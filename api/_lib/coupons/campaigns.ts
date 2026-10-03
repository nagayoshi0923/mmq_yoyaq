// api/coupons.ts のキャンペーンの作成・更新・有効切替（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import { validateCouponCampaign } from '../couponRules.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'
import { validateCampaignTargets } from './common.js'

// =========================================
// 管理者向け: キャンペーン作成
// =========================================
export async function handleCreateCampaign(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as Record<string, unknown>
  let formData: Record<string, unknown>
  try { formData = validateCouponCampaign(body) } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : '入力を確認してください' })
  }
  if (!await validateCampaignTargets(formData, user.orgId)) return res.status(400).json({ success: false, error: '対象は自組織の店舗・シナリオから選択してください' })

  const database = db!
  const { data, error } = await database
    .from('coupon_campaigns')
    .insert({ ...formData, organization_id: user.orgId })
    .select('id')
    .single()

  if (error) {
    console.error('[coupons:create-campaign] DB error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
  return res.status(200).json({ success: true, id: data.id })
}

// =========================================
// 管理者向け: キャンペーン更新
// =========================================
export async function handleUpdateCampaign(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) {
    return res.status(400).json({ success: false, error: 'id クエリパラメータが必要です' })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  let formData: Record<string, unknown>
  try { formData = validateCouponCampaign(body) } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : '入力を確認してください' })
  }
  if (!await validateCampaignTargets(formData, user.orgId)) return res.status(400).json({ success: false, error: '対象は自組織の店舗・シナリオから選択してください' })

  const database = db!
  const { data, error } = await database
    .from('coupon_campaigns')
    .update(formData)
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .select('id')

  if (error) {
    console.error('[coupons:update-campaign] DB error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
  if (!data || data.length === 0) {
    return res.status(404).json({ success: false, error: 'キャンペーンが見つかりません（権限不足の可能性）' })
  }
  return res.status(200).json({ success: true })
}

// =========================================
// 管理者向け: キャンペーンの有効/無効を切り替え
// =========================================
export async function handleToggleCampaignActive(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) {
    return res.status(400).json({ success: false, error: 'id クエリパラメータが必要です' })
  }

  const database = db!

  const { data: campaign, error: fetchError } = await database
    .from('coupon_campaigns')
    .select('is_active')
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (fetchError) {
    console.error('[coupons:toggle-campaign-active] fetch error:', fetchError)
    return res.status(500).json({ success: false, error: fetchError.message })
  }
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'キャンペーンが見つかりません' })
  }

  const newStatus = !campaign.is_active
  const { error: updateError } = await database
    .from('coupon_campaigns')
    .update({ is_active: newStatus })
    .eq('id', id)
    .eq('organization_id', user.orgId)

  if (updateError) {
    console.error('[coupons:toggle-campaign-active] update error:', updateError)
    return res.status(500).json({ success: false, error: updateError.message })
  }

  return res.status(200).json({ success: true, isActive: newStatus })
}
