import { compensatedCancellation } from './_lib/compensatedCancellation.js'
import { representativeCompensation } from './_lib/representativeCompensation.js'
import { privateCouponClaims } from './_lib/privateCouponClaims.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'
import { handleAvailable, handleAll, handleUsages } from './_lib/coupons/customerReads.js'
import { handleCurrentReservations } from './_lib/coupons/currentReservations.js'
import { handleCampaigns, handleCampaignStats, handleCustomerUsages, handleAdminUsages, handleCampaignCoupons, handleSearchCustomers, handleCustomerCoupons } from './_lib/coupons/adminReads.js'
import { handleCreateCampaign, handleUpdateCampaign, handleToggleCampaignActive } from './_lib/coupons/campaigns.js'
import { handleGrantRegistrationCoupon, handleGrantCouponToCustomer, handleRedeemCouponByCode } from './_lib/coupons/grants.js'
import { handleRevokeCoupon, handleAdjustCouponUses, handleRestoreCouponUsage } from './_lib/coupons/adjustments.js'
import { handlePreviewBooking, handleUseCoupon } from './_lib/coupons/usage.js'
import { setCors } from './_lib/coupons/common.js'

// クーポン API の入口。処理は api/_lib/coupons/ に分けてある（整備 Phase 3、#774）。

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    const claimAction = String(req.query.action ?? req.query.type ?? '')
    if (req.method === 'POST' && ['preview-compensated-cancellation', 'confirm-compensated-cancellation'].includes(claimAction)) {
      return await compensatedCancellation(req, res, user)
    }
    if ((req.method === 'GET' && ['representative-candidates', 'compensation-events'].includes(claimAction)) ||
      (req.method === 'POST' && ['preview-representative-compensation', 'grant-representative-compensation', 'preview-event-compensation'].includes(claimAction))) {
      return await representativeCompensation(req, res, user)
    }
    if ((req.method === 'GET' && claimAction === 'private-claim-candidates') ||
      (req.method === 'POST' && ['create-private-claim-link', 'private-claim-info', 'claim-private-coupon'].includes(claimAction))) {
      return await privateCouponClaims(req, res, user)
    }

    if (req.method === 'GET') return await handleGet(req, res, user)
    if (req.method === 'POST') return await handlePost(req, res, user)
    if (req.method === 'PATCH') return await handlePatch(req, res, user)
    if (req.method === 'DELETE') return await handleDelete(req, res, user)

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[coupons] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// =========================================
// GET handler
// =========================================
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const type = (req.query.type as string | undefined) ?? 'available'
  const requestedOrgId = req.query.organization_id as string | undefined

  // 顧客向け read（requireAuth のみで OK）
  if (type === 'available') {
    if (req.query.event_id) {
      const { data: event, error } = await db!.from('schedule_events').select('organization_id').eq('id', String(req.query.event_id)).maybeSingle()
      if (error || !event) return res.status(400).json({ error: '公演を確認できませんでした' })
      return handleAvailable(req, res, user.userId, event.organization_id)
    }
    return handleAvailable(req, res, user.userId, requestedOrgId ?? user.orgId)
  }
  if (type === 'all') {
    return handleAll(req, res, user.userId, user.orgId)
  }
  if (type === 'usages') {
    return handleUsages(req, res, user.userId, user.orgId)
  }
  if (type === 'current-reservations') {
    return handleCurrentReservations(req, res, user)
  }

  if (type === 'target-options') {
    requireStaff(user)
    const [{ data: stores, error: se }, { data: scenarios, error: ce }] = await Promise.all([
      db!.from('stores').select('id, name').eq('organization_id', user.orgId).order('name'),
      db!.from('organization_scenarios').select('id, scenario_master_id, scenario_masters(title)').eq('organization_id', user.orgId).order('id'),
    ])
    if (se || ce) return res.status(500).json({ error: '対象一覧を取得できませんでした' })
    return res.status(200).json({ organization_id: user.orgId, stores, scenarios })
  }

  // 管理者向け read（requireStaff）
  if (type === 'campaigns') {
    requireStaff(user)
    return handleCampaigns(req, res, user)
  }
  if (type === 'campaign-stats') {
    requireStaff(user)
    return handleCampaignStats(req, res, user)
  }
  if (type === 'customer-usages') {
    requireStaff(user)
    return handleCustomerUsages(req, res, user)
  }
  if (type === 'admin-usages') {
    requireStaff(user)
    return handleAdminUsages(req, res, user)
  }
  if (type === 'campaign-coupons') {
    requireStaff(user)
    return handleCampaignCoupons(req, res, user)
  }
  if (type === 'search-customers') {
    requireStaff(user)
    return handleSearchCustomers(req, res, user)
  }
  if (type === 'customer-coupons') {
    requireStaff(user)
    return handleCustomerCoupons(req, res, user)
  }

  return res.status(400).json({ error: `unknown type: ${type}` })
}

// =========================================
// POST handler
// =========================================
async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = req.query.action as string | undefined

  // 顧客向け write（requireAuth のみで OK）
  if (action === 'preview-booking') return handlePreviewBooking(req, res, user)
  if (action === 'use' || action === 'preview-use') {
    return handleUseCoupon(req, res, user)
  }
  if (action === 'grant-registration') {
    return handleGrantRegistrationCoupon(req, res, user)
  }
  if (action === 'redeem-code') {
    return handleRedeemCouponByCode(req, res, user)
  }

  // 管理者向け write（requireStaff）
  if (action === 'create-campaign') {
    requireStaff(user)
    return handleCreateCampaign(req, res, user)
  }
  if (action === 'grant-to-customer') {
    requireStaff(user)
    return handleGrantCouponToCustomer(req, res, user)
  }

  return res.status(400).json({ error: `unknown action: ${action}` })
}

// =========================================
// PATCH handler（管理者向けのみ）
// =========================================
async function handlePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  const action = req.query.action as string | undefined

  if (action === 'update-campaign') {
    return handleUpdateCampaign(req, res, user)
  }
  if (action === 'toggle-campaign-active') {
    return handleToggleCampaignActive(req, res, user)
  }
  if (action === 'adjust-coupon-uses') {
    return handleAdjustCouponUses(req, res, user)
  }

  return res.status(400).json({ error: `unknown action: ${action}` })
}

// =========================================
// DELETE handler（管理者向けのみ）
// =========================================
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  const action = req.query.action as string | undefined

  if (action === 'restore-usage') {
    return handleRestoreCouponUsage(req, res, user)
  }
  if (action === 'revoke-coupon') {
    return handleRevokeCoupon(req, res, user)
  }

  return res.status(400).json({ error: `unknown action: ${action}` })
}
