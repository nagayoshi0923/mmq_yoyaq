// api/coupons.ts のクーポンの取消・残回数調整・使用の取り消し（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'

// =========================================
// 管理者向け: 未使用クーポンを取消（誤付与の取り消し）
// 使用履歴があるクーポンは取消不可（その場合は restore-usage で使用を戻すこと）
// =========================================
export async function handleRevokeCoupon(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const customerCouponId = req.query.customer_coupon_id as string | undefined
  if (!customerCouponId) {
    return res.status(400).json({ success: false, error: 'customer_coupon_id が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 自組織のクーポンか検証
  const { data: coupon, error: couponError } = await database
    .from('customer_coupons')
    .select('id, organization_id')
    .eq('id', customerCouponId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (couponError) {
    console.error('[coupons:revoke-coupon] fetch error:', couponError)
    return res.status(500).json({ success: false, error: couponError.message })
  }
  if (!coupon) {
    return res.status(404).json({ success: false, error: 'クーポンが見つかりません' })
  }

  // 使用履歴があれば取消不可（使用を戻したい場合は restore-usage）
  const { count: usageCount, error: usageError } = await database
    .from('coupon_usages')
    .select('id', { count: 'exact', head: true })
    .eq('customer_coupon_id', customerCouponId)

  if (usageError) {
    console.error('[coupons:revoke-coupon] usage check error:', usageError)
    return res.status(500).json({ success: false, error: usageError.message })
  }
  if ((usageCount ?? 0) > 0) {
    return res.status(409).json({ success: false, error: '使用履歴があるため取消できません（使用を戻す場合は「使用取消」を使ってください）' })
  }

  const { error: deleteError } = await database
    .from('customer_coupons')
    .delete()
    .eq('id', customerCouponId)
    .eq('organization_id', user.orgId)

  if (deleteError) {
    console.error('[coupons:revoke-coupon] delete error:', deleteError)
    return res.status(500).json({ success: false, error: '取消に失敗しました' })
  }

  return res.status(200).json({ success: true })
}

// =========================================
// 管理者向け: 保有クーポンの残使用回数を調整
// 店舗で利用失敗した等で残回数がズレた場合にスタッフが直す。
// =========================================
export async function handleAdjustCouponUses(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as { customer_coupon_id?: string; uses_remaining?: number }
  const customerCouponId = body.customer_coupon_id
  const usesRaw = body.uses_remaining
  if (!customerCouponId) {
    return res.status(400).json({ success: false, error: 'customer_coupon_id が必要です' })
  }
  if (typeof usesRaw !== 'number' || !Number.isFinite(usesRaw) || usesRaw < 0) {
    return res.status(400).json({ success: false, error: 'uses_remaining は 0 以上の数値が必要です' })
  }
  const usesRemaining = Math.floor(usesRaw)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 自組織のクーポンか検証
  const { data: coupon, error: couponError } = await database
    .from('customer_coupons')
    .select('id, status, organization_id')
    .eq('id', customerCouponId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (couponError) {
    console.error('[coupons:adjust-coupon-uses] fetch error:', couponError)
    return res.status(500).json({ success: false, error: couponError.message })
  }
  if (!coupon) {
    return res.status(404).json({ success: false, error: 'クーポンが見つかりません' })
  }

  // 残回数に応じて status を整える（取消済みは触らない）。0なら fully_used、>0 なら active。
  const nextStatus = coupon.status === 'revoked' ? 'revoked' : (usesRemaining > 0 ? 'active' : 'fully_used')

  const { error: updateError } = await database
    .from('customer_coupons')
    .update({ uses_remaining: usesRemaining, status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', customerCouponId)
    .eq('organization_id', user.orgId)

  if (updateError) {
    console.error('[coupons:adjust-coupon-uses] update error:', updateError)
    return res.status(500).json({ success: false, error: '残回数の更新に失敗しました' })
  }

  return res.status(200).json({ success: true })
}

// =========================================
// 管理者向け: クーポン使用を取り消して残数を復元
// =========================================
export async function handleRestoreCouponUsage(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const couponUsageId = req.query.usage_id as string | undefined
  const customerCouponId = req.query.customer_coupon_id as string | undefined
  if (!couponUsageId || !customerCouponId) {
    return res.status(400).json({ success: false, error: 'usage_id と customer_coupon_id が必要です' })
  }

  const { data, error } = await db!.rpc('restore_coupon_usage', {
    p_organization: user.orgId, p_coupon: customerCouponId, p_usage: couponUsageId,
  })
  if (error) return res.status(error.code === 'P0028' ? 400 : 500).json({ success: false, error: error.code === 'P0028' ? error.message : '使用の取消に失敗しました' })
  return res.status(200).json(data)
}
