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
  // 来店時にその場でもぎった使用は、そのまま「来店時に確認済み」の印を付ける（社長決定 B、2026-10-20）。
  // 印付けに失敗してもクーポンの使用は済んでいるので成功を返す（予約に適用済みの欄から押し直せる）。
  const usageId = (data as { usage_id?: unknown } | null)?.usage_id
  // 来店確認は公演当日だけ（20261020180000）。先の予約に使ったときは印を付けず、理由を添えて返す（当日に「この予約に適用済み」から押す）。
  if (req.query.action === 'use' && typeof usageId === 'string') {
    const { error: redeemError } = await db!.rpc('redeem_coupon_usage', { p_user: user.userId, p_usage_id: usageId, p_source: 'venue_use' })
    if (redeemError) {
      if (redeemError.hint !== NOT_PERFORMANCE_DAY) console.warn('[coupons:use] redeem mark failed:', redeemError.message)
      return res.status(200).json({ ...(data as Record<string, unknown>), redeemed: false, redeem_code: redeemErrorCode(redeemError) })
    }
  }
  return res.status(200).json(data)
}

/** 来店確認（もぎる）が公演当日でないと断られたときの理由（RPC の HINT。画面はこの値で文言を出し分ける） */
export const NOT_PERFORMANCE_DAY = 'not_performance_day'

function redeemErrorCode(error: { code?: string; hint?: string | null }): string {
  return error.hint === NOT_PERFORMANCE_DAY ? NOT_PERFORMANCE_DAY : (error.code ?? 'unknown')
}

// =========================================
// 顧客向け: 予約に適用済みのクーポンを来店時に「もぎる」（来店確認の印だけ付ける。消費は予約時のまま）
// =========================================
export async function handleRedeemCouponUsage(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as { usage_id?: unknown }
  if (typeof body.usage_id !== 'string' || !body.usage_id) return res.status(400).json({ success: false, error: 'クーポンを選択してください' })
  const { data, error } = await db!.rpc('redeem_coupon_usage', { p_user: user.userId, p_usage_id: body.usage_id, p_source: 'customer_present' })
  if (error) {
    if (error.code === 'P0028' || error.code === '22P02') {
      return res.status(400).json({ success: false, error: error.code === '22P02' ? '指定を確認してください' : error.message, code: redeemErrorCode(error) })
    }
    console.error('[coupons:redeem-usage] DB error:', error)
    return res.status(500).json({ success: false, error: '来店確認を記録できませんでした' })
  }
  return res.status(200).json(data)
}

/**
 * 付与通知メールを fire-and-forget で送信する。
 * 失敗してもクーポン付与処理はブロックしない。
 * Edge Function 側でフラグチェックするので、ここでは notify_on_grant=true のみ呼び出す。
 */
