// api/coupons.ts の顧客のクーポン使用・予約前確認（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'

// =========================================
// 顧客向け: クーポンを使用（もぎる）
// =========================================
export async function handlePreviewBooking(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = req.body ?? {}
  if (typeof body.customer_coupon_id !== 'string' || typeof body.event_id !== 'string'
    || !Number.isInteger(body.participant_count) || body.participant_count < 1 || body.participant_count > 100) {
    return res.status(400).json({ success: false, error: 'クーポン・公演・人数を確認してください' })
  }
  const { data, error } = await db!.rpc('preview_booking_coupon', {
    p_user: user.userId, p_coupon: body.customer_coupon_id, p_event: body.event_id, p_participants: body.participant_count,
  })
  if (error) {
    if (error.code === 'P0028' || error.code === '22P02') return res.status(400).json({ success: false, error: error.code === 'P0028' ? error.message : '指定を確認してください' })
    console.error('[coupons:preview-booking] DB error:', error)
    return res.status(500).json({ success: false, error: 'クーポンの利用条件を確認できませんでした' })
  }
  return res.status(200).json(data)
}

export async function handleUseCoupon(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as { customer_coupon_id?: string; reservation_id?: string }
  if (!body.customer_coupon_id || !body.reservation_id) return res.status(400).json({ success: false, error: 'クーポンと利用する予約を選択してください' })
  const { data, error } = await db!.rpc(req.query.action === 'preview-use' ? 'preview_customer_coupon' : 'use_customer_coupon', {
    p_user: user.userId, p_coupon: body.customer_coupon_id, p_reservation: body.reservation_id,
  })
  if (error) {
    if (error.code === 'P0028' || error.code === '22P02') return res.status(400).json({ success: false, error: error.code === '22P02' ? '指定を確認してください' : error.message })
    console.error('[coupons:use] DB error:', error)
    return res.status(500).json({ success: false, error: 'クーポンの使用に失敗しました' })
  }
  return res.status(200).json(data)
}

/**
 * 付与通知メールを fire-and-forget で送信する。
 * 失敗してもクーポン付与処理はブロックしない。
 * Edge Function 側でフラグチェックするので、ここでは notify_on_grant=true のみ呼び出す。
 */
