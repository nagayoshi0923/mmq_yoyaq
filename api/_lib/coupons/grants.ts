// api/coupons.ts のクーポンの付与（登録時・手動・コード）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'
import { COUPON_CAMPAIGN_FIELDS, fireCouponGrantedEmail } from './common.js'

// =========================================
// 顧客向け: 新規登録クーポンを付与
// =========================================
export async function handleGrantRegistrationCoupon(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as { customer_id?: string }
  const customerId = body.customer_id
  if (!customerId) {
    return res.status(400).json({ error: 'customer_id が必要です' })
  }

  const database = db!

  // 本人検証: customer_id が JWT user_id ⇒ 自組織の customers のものであること
  const { data: customer } = await database
    .from('customers')
    .select('id, organization_id, user_id')
    .eq('id', customerId)
    .eq('user_id', user.userId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (!customer) {
    return res.status(403).json({ error: '対象の顧客にクーポンを付与する権限がありません' })
  }

  // 対象キャンペーン取得（JWT 由来の org のみ）
  const { data: campaigns, error: campaignError } = await database
    .from('coupon_campaigns')
    .select(COUPON_CAMPAIGN_FIELDS)
    .eq('trigger_type', 'registration')
    .eq('is_active', true)
    .eq('organization_id', user.orgId)
    .or('valid_from.is.null,valid_from.lte.now()')
    .or('valid_until.is.null,valid_until.gte.now()')

  if (campaignError || !campaigns || campaigns.length === 0) {
    return res.status(200).json({ granted: 0, skipped: true, reason: '対象キャンペーンなし' })
  }

  let grantedCount = 0

  for (const campaign of campaigns) {
    // 1人あたり配布上限チェック（NULL = 無制限）
    if (campaign.max_grants_per_customer != null) {
      const { count: customerGrantCount } = await database
        .from('customer_coupons')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('customer_id', customerId)
      if ((customerGrantCount ?? 0) >= campaign.max_grants_per_customer) {
        continue // この顧客は既に上限到達、次のキャンペーンへ
      }
    }

    // 全体配布上限チェック（NULL = 無制限）
    if (campaign.max_total_grants != null) {
      const { count: totalGrantCount } = await database
        .from('customer_coupons')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
      if ((totalGrantCount ?? 0) >= campaign.max_total_grants) {
        continue
      }
    }

    let expiresAt: string | null = null
    if (campaign.usage_valid_until) {
      expiresAt = new Date(campaign.usage_valid_until).toISOString()
    } else if (campaign.coupon_expiry_days) {
      const expiry = new Date()
      expiry.setDate(expiry.getDate() + campaign.coupon_expiry_days)
      expiresAt = expiry.toISOString()
    }

    const { data: newCC, error: insertError } = await database
      .from('customer_coupons')
      .insert({
        campaign_id: campaign.id,
        customer_id: customerId,
        organization_id: campaign.organization_id,
        uses_remaining: campaign.max_uses_per_customer,
        expires_at: expiresAt,
        status: 'active',
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[coupons:grant-registration] insert error:', insertError)
    } else {
      grantedCount++
      if (campaign.notify_on_grant && newCC?.id) {
        fireCouponGrantedEmail(database, newCC.id)
      }
    }
  }

  return res.status(200).json({ granted: grantedCount, skipped: grantedCount === 0 })
}

// =========================================
// 管理者向け: 顧客にクーポンを手動付与
// =========================================
export async function handleGrantCouponToCustomer(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as { campaign_id?: string; customer_id?: string; uses?: number }
  const campaignId = body.campaign_id
  const customerId = body.customer_id
  if (!campaignId || !customerId) {
    return res.status(400).json({ success: false, error: 'campaign_id と customer_id が必要です' })
  }
  // 付与時に使用回数を指定可能（未指定 or 不正なら campaign.max_uses_per_customer を使う）
  const usesRaw = body.uses
  const usesOverride = typeof usesRaw === 'number' && Number.isFinite(usesRaw) && usesRaw >= 1
    ? Math.floor(usesRaw)
    : null

  const database = db!

  // キャンペーンが自組織のものか
  const { data: campaign, error: campaignError } = await database
    .from('coupon_campaigns')
    .select(COUPON_CAMPAIGN_FIELDS)
    .eq('id', campaignId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (campaignError) {
    console.error('[coupons:grant-to-customer] campaign fetch error:', campaignError)
    return res.status(500).json({ success: false, error: campaignError.message })
  }
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'キャンペーンが見つかりません' })
  }

  // 顧客が自組織 または platform 顧客(organization_id IS NULL) か。
  // platform_customers_phase1 以降、ログイン顧客の customers 行は org=NULL に統一されているため、
  // org 縛りだと付与できない（searchCustomers と同じく org=NULL も対象に含める）。
  // クーポン自体は organization_id = user.orgId で作られるので、配布元組織は正しく記録される。
  const { data: customer, error: customerError } = await database
    .from('customers')
    .select('id, organization_id')
    .eq('id', customerId)
    .or(`organization_id.eq.${user.orgId},organization_id.is.null`)
    .maybeSingle()

  if (customerError) {
    console.error('[coupons:grant-to-customer] customer fetch error:', customerError)
    return res.status(500).json({ success: false, error: customerError.message })
  }
  if (!customer) {
    return res.status(404).json({ success: false, error: '顧客が見つかりません' })
  }

  // 1人あたり配布上限チェック（NULL = 無制限）
  if (campaign.max_grants_per_customer != null) {
    const { count: customerGrantCount } = await database
      .from('customer_coupons')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('customer_id', customerId)
    if ((customerGrantCount ?? 0) >= campaign.max_grants_per_customer) {
      return res.status(409).json({ success: false, error: `この顧客への配布上限 (${campaign.max_grants_per_customer}) に達しています` })
    }
  }

  // 全体配布数上限チェック（NULL = 無制限）
  if (campaign.max_total_grants != null) {
    const { count: grantedCount } = await database
      .from('customer_coupons')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
    if ((grantedCount ?? 0) >= campaign.max_total_grants) {
      return res.status(400).json({ success: false, error: `配布数の上限 (${campaign.max_total_grants}) に達しています` })
    }
  }

  // expires_at の決定: 絶対 usage_valid_until が優先、なければ相対 coupon_expiry_days
  let expiresAt: string | null = null
  if (campaign.usage_valid_until) {
    expiresAt = new Date(campaign.usage_valid_until).toISOString()
  } else if (campaign.coupon_expiry_days) {
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + campaign.coupon_expiry_days)
    expiresAt = expiry.toISOString()
  }

  const { data, error } = await database
    .from('customer_coupons')
    .insert({
      campaign_id: campaignId,
      customer_id: customerId,
      organization_id: user.orgId,
      uses_remaining: usesOverride ?? campaign.max_uses_per_customer,
      expires_at: expiresAt,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[coupons:grant-to-customer] insert error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }

  if (campaign.notify_on_grant) {
    fireCouponGrantedEmail(database, data.id)
  }

  return res.status(200).json({ success: true, couponId: data.id })
}

// =========================================
// 顧客向け: コード入力でクーポンを取得（コード制キャンペーン）
// =========================================
export async function handleRedeemCouponByCode(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as { code?: string }
  const code = (body.code ?? '').trim()
  if (!code) {
    return res.status(400).json({ success: false, error: 'コードを入力してください' })
  }

  const database = db!

  // コードに一致する有効キャンペーン（user.orgId で絞らない: コード自体が組織横断のキーになりうる）
  // ただし配布期間内・有効でなければならない
  const now = new Date().toISOString()
  const { data: campaign, error: campaignError } = await database
    .from('coupon_campaigns')
    .select(COUPON_CAMPAIGN_FIELDS)
    .eq('coupon_code', code)
    .eq('is_active', true)
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gte.${now}`)
    .limit(1)
    .maybeSingle()

  if (campaignError) {
    console.error('[coupons:redeem-code] campaign fetch error:', campaignError)
    return res.status(500).json({ success: false, error: 'コードの照合に失敗しました' })
  }
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'コードが無効か、配布期間外です' })
  }

  // 全体配布数上限チェック（NULL = 無制限）
  if (campaign.max_total_grants != null) {
    const { count: grantedCount } = await database
      .from('customer_coupons')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
    if ((grantedCount ?? 0) >= campaign.max_total_grants) {
      return res.status(400).json({ success: false, error: '配布数の上限に達しています' })
    }
  }

  // ログインユーザーの customer 行（自分自身のみ）
  const { data: customer } = await database
    .from('customers')
    .select('id')
    .eq('user_id', user.userId)
    .limit(1)
    .maybeSingle()
  if (!customer) {
    return res.status(404).json({ success: false, error: '顧客情報が見つかりません' })
  }

  // 1人あたり配布上限チェック（NULL = 無制限、customer.id 確定後に実施）
  if (campaign.max_grants_per_customer != null) {
    const { count: customerGrantCount } = await database
      .from('customer_coupons')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('customer_id', customer.id)
    if ((customerGrantCount ?? 0) >= campaign.max_grants_per_customer) {
      return res.status(409).json({ success: false, error: 'このクーポンの取得上限に達しています' })
    }
  }

  // expires_at 決定
  let expiresAt: string | null = null
  if (campaign.usage_valid_until) {
    expiresAt = new Date(campaign.usage_valid_until).toISOString()
  } else if (campaign.coupon_expiry_days) {
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + campaign.coupon_expiry_days)
    expiresAt = expiry.toISOString()
  }

  const { data, error } = await database
    .from('customer_coupons')
    .insert({
      campaign_id: campaign.id,
      customer_id: customer.id,
      organization_id: campaign.organization_id,
      uses_remaining: campaign.max_uses_per_customer,
      expires_at: expiresAt,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[coupons:redeem-code] insert error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }

  if (campaign.notify_on_grant) {
    fireCouponGrantedEmail(database, data.id)
  }

  return res.status(200).json({ success: true, couponId: data.id, campaignName: campaign.name })
}
