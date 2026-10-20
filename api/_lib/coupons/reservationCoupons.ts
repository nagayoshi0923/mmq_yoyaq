// スタッフ向け: 予約に付いたクーポンと「来店確認済み／未確認」（社長決定 B、2026-10-20）。
// coupon_usages は管理者しか直接読めないため、ここで自組織の予約に限って読む。
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 200

export type ReservationCouponStatus = {
  usage_id: string
  reservation_id: string
  discount_amount: number
  campaign_name: string | null
  used_at: string | null
  redeemed_at: string | null
  redeemed_source: string | null
}

type UsageRow = {
  id: string; reservation_id: string; discount_amount: number; used_at: string | null
  redeemed_at?: string | null; redeemed_source?: string | null
  customer_coupons?: { organization_id?: string | null; coupon_campaigns?: { name?: string | null; display_name?: string | null } | null } | null
}

/** 来店確認の列が無い DB（migration 適用前）では列なしで読み直す */
export function isMissingRedeemColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42703' || error.code === 'PGRST204' || /redeemed_(at|source|by_member)/.test(error.message ?? '')
}

export async function handleReservationCoupons(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const raw = String(req.query.reservation_ids ?? '')
  const ids = [...new Set(raw.split(',').map(id => id.trim()).filter(id => UUID.test(id)))].slice(0, MAX_IDS)
  if (ids.length === 0) return res.status(200).json([])
  const database = db!

  const { data: owned, error: ownedError } = await database
    .from('reservations').select('id').in('id', ids).eq('organization_id', user.orgId)
  if (ownedError) {
    console.error('[coupons:reservation-coupons] reservations error:', ownedError)
    return res.status(500).json({ error: 'データ取得に失敗しました' })
  }
  const ownedIds = (owned ?? []).map((row: { id: string }) => row.id)
  if (ownedIds.length === 0) return res.status(200).json([])

  const base = 'id, reservation_id, discount_amount, used_at, customer_coupons ( organization_id, coupon_campaigns ( name, display_name ) )'
  let result: { data: unknown[] | null; error: { code?: string; message: string } | null } = await database.from('coupon_usages').select(`${base}, redeemed_at, redeemed_source`).in('reservation_id', ownedIds)
  if (isMissingRedeemColumn(result.error)) {
    result = await database.from('coupon_usages').select(base).in('reservation_id', ownedIds)
  }
  if (result.error) {
    console.error('[coupons:reservation-coupons] usages error:', result.error)
    return res.status(500).json({ error: 'データ取得に失敗しました' })
  }
  const rows: ReservationCouponStatus[] = ((result.data ?? []) as unknown as UsageRow[])
    .filter(row => !row.customer_coupons?.organization_id || row.customer_coupons.organization_id === user.orgId)
    .map(row => ({
      usage_id: row.id,
      reservation_id: row.reservation_id,
      discount_amount: row.discount_amount,
      campaign_name: row.customer_coupons?.coupon_campaigns?.display_name || row.customer_coupons?.coupon_campaigns?.name || null,
      used_at: row.used_at,
      redeemed_at: row.redeemed_at ?? null,
      redeemed_source: row.redeemed_source ?? null,
    }))
  return res.status(200).json(rows)
}
