import { randomBytes } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { requireStaff, type AuthUser } from './auth.js'

export function compensationAmount(start: string, cancelled: string): number | null {
  const s = new Date(start), c = new Date(cancelled)
  if (!Number.isFinite(+s) || !Number.isFinite(+c) || +c > +s) return null
  const day = (d: Date) => Math.floor((+d + 9 * 3600000) / 86400000)
  const days = day(s) - day(c)
  if (days === 0) return +s - +c <= 2 * 3600000 ? 5000 : 2000
  if (days === 1) return 1000
  return null
}

export async function privateCouponClaims(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const database = db as any
  const action = String(req.query.action ?? req.query.type ?? '')
  res.setHeader('Cache-Control', 'no-store')
  if (action === 'private-claim-candidates') {
    requireStaff(user)
    const { data, error } = await database.from('reservations')
      .select('id,title,participant_count,schedule_events!inner(id,date,is_cancelled,category)')
      .eq('organization_id', user.orgId).eq('schedule_events.is_cancelled', true)
      .eq('schedule_events.category', 'private').order('requested_datetime', { ascending: false }).limit(100)
    if (error) return res.status(500).json({ error: '貸切予約を取得できませんでした' })
    return res.status(200).json(data ?? [])
  }
  if (action === 'create-private-claim-link') {
    requireStaff(user)
    if (req.body?.gm_cancellation_confirmed !== true) return res.status(400).json({ error: 'GM都合の中止を確認してください' })
    const { data: r } = await database.from('reservations')
      .select('id,status,cancelled_at,organization_id,participant_count,schedule_event_id,schedule_events!inner(id,date,start_time,start_at,cancelled_at,is_cancelled,category,organization_id)')
      .eq('id', req.body?.reservation_id).eq('organization_id', user.orgId).maybeSingle()
    const e = r?.schedule_events
    if (!e || e.organization_id !== user.orgId || !e.is_cancelled || e.category !== 'private') {
      return res.status(400).json({ error: '中止済みの貸切予約を選択してください' })
    }
    if (!['confirmed', 'cancelled', 'checked_in'].includes(r.status) || (r.cancelled_at && +new Date(r.cancelled_at) < +new Date(e.cancelled_at))) {
      return res.status(400).json({ error: '公演中止より前に取り消された予約、または未確定の予約は対象にできません' })
    }
    const amount = compensationAmount(e.start_at || `${e.date}T${e.start_time}+09:00`, e.cancelled_at)
    if (!amount) return res.status(400).json({ error: '中止日時または補償額を自動判定できません。個別に確認してください' })
    const { data: campaigns } = await database.from('coupon_campaigns').select('id')
      .eq('organization_id', user.orgId).eq('is_active', true).eq('discount_type', 'fixed').eq('discount_amount', amount)
      .eq('coupon_expiry_months', 6).eq('murder_mystery_only', true).eq('trigger_type', 'manual').eq('max_uses_per_customer', 1)
    if (campaigns?.length !== 1) return res.status(409).json({ error: '補償用クーポンを1種類に特定できません' })
    if (!Number.isInteger(r.participant_count) || r.participant_count < 1 || r.participant_count > 100) {
      return res.status(400).json({ error: '予約人数を確認してください' })
    }
    const { error } = await database.from('private_coupon_claim_links').upsert({
      organization_id: user.orgId, reservation_id: r.id, event_id: e.id,
      campaign_id: campaigns[0].id, discount_amount: amount, token: randomBytes(32).toString('hex'),
      max_claims: r.participant_count, created_by: user.userId,
    }, { onConflict: 'organization_id,reservation_id', ignoreDuplicates: true })
    if (error) return res.status(500).json({ error: '受け取りURLを作成できませんでした' })
    const { data: link } = await database.from('private_coupon_claim_links').select('token,max_claims,revoked,expires_at')
      .eq('organization_id', user.orgId).eq('reservation_id', r.id).single()
    return res.status(200).json({ path: `/coupon-claim#${link.token}`, max_claims: link.max_claims, revoked: link.revoked, expires_at: link.expires_at })
  }
  const token = req.body?.token
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: '受け取りURLが無効です' })
  if (action === 'private-claim-info') {
    const { data: link } = await database.from('private_coupon_claim_links')
      .select('campaign_id,revoked,expires_at,coupon_campaigns(display_name,name,discount_amount,customer_terms)')
      .eq('token', token).maybeSingle()
    if (!link || link.revoked || +new Date(link.expires_at) <= Date.now()) return res.status(404).json({ error: '受け取りURLが無効か、受付が終了しています' })
    return res.status(200).json({ ...link.coupon_campaigns, claim_expires_at: link.expires_at })
  }
  if (action === 'claim-private-coupon') {
    const { data, error } = await database.rpc('claim_private_compensation_coupon', { p_token: token, p_user_id: user.userId })
    if (error) return res.status(400).json({ error: error.code === 'P0001' ? error.message : '受け取りに失敗しました。もう一度お試しください' })
    if (!data.already_claimed) {
      // Await the existing email endpoint; a failed email must not create another coupon.
      await database.functions.invoke('send-coupon-granted', { body: { customerCouponId: data.coupon_id } }).catch(() => undefined)
    }
    return res.status(200).json(data)
  }
  return res.status(400).json({ error: '不明な操作です' })
}
