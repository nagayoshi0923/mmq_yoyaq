// api/coupons.ts の共通部分（CORS、SELECT 定数、ページング補助、顧客検索、メール通知、対象の検証）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import type { SupabaseClient } from '@supabase/supabase-js'

export const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

export function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export const CUSTOMER_COUPON_FIELDS = `
  id,
  campaign_id,
  customer_id,
  organization_id,
  uses_remaining,
  rules_snapshot,
  expires_at,
  status,
  created_at,
  updated_at,
  coupon_campaigns (
    id,
    organization_id,
    name,
    description,
    discount_type,
    discount_amount,
    max_uses_per_customer,
    target_type,
    target_ids,
    murder_mystery_only,
    coupon_expiry_months,
    customer_terms,
    trigger_type,
    valid_from,
    valid_until,
    is_active
  )
`

export const COUPON_CAMPAIGN_FIELDS =
  'id, organization_id, name, description, discount_type, discount_amount, max_uses_per_customer, target_type, target_ids, target_store_ids, same_scenario_once, trigger_type, valid_from, valid_until, coupon_expiry_days, coupon_expiry_months, murder_mystery_only, usage_valid_from, usage_valid_until, max_total_grants, max_grants_per_customer, coupon_code, notify_on_grant, min_order_amount, combinable, allowed_weekdays, allowed_time_slots, display_name, display_image_url, customer_terms, internal_memo, is_active, created_at, updated_at'

export const CUSTOMER_COUPON_WITH_CUSTOMER_FIELDS = `
  id,
  campaign_id,
  customer_id,
  organization_id,
  uses_remaining,
  expires_at,
  status,
  created_at,
  updated_at,
  customers (
    name,
    email
  )
`

// PostgREST のデフォルト行数上限（1000）を超える結果を全件取得するためのページサイズ。
export const PAGE_SIZE = 1000
// coupon_usages の .in() に一度に渡す customer_coupon_id の最大件数。
// 1クーポンあたりの usage 行数が数枚でも 1000 行上限に収まるよう控えめに設定。
export const USAGE_CHUNK_SIZE = 200

/**
 * PostgREST のデフォルト 1000 行上限を回避し、range ページングで全行を取得する。
 * buildQuery は毎回新しいクエリビルダを返す関数（同じビルダを使い回すと range が累積するため）。
 */

/** range でページを取れる問い合わせ（Supabase の問い合わせの組み立て途中の形） */
export type RangeQuery = { range(from: number, to: number): PromiseLike<{ data: unknown; error: unknown }> }

export async function fetchAllRows<T>(
  buildQuery: () => RangeQuery,
): Promise<{ rows: T[]; error: unknown | null }> {
  const all: T[] = []
  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1)
    if (error) return { rows: all, error }
    const batch = (data as T[]) ?? []
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return { rows: all, error: null }
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// JWT user.id から customer 行を1件取得。
// platform_customers_phase1 マイグレーション以降、ログイン済み顧客の customers 行は
// organization_id = NULL（プラットフォーム共通）になっているため、user_id だけで一意に引く。
// organizationId 引数は呼び出し側互換のため残すが使わない（customers の org フィルタは外す）。
export async function findCustomerByUserId(
  database: SupabaseClient,
  userId: string,
  _organizationId: string | null,
  selectFields = 'id'
): Promise<Record<string, unknown> | null> {
  const { data } = await database
    .from('customers')
    .select(selectFields)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
  return (data?.[0] as unknown as Record<string, unknown> | undefined) ?? null
}

export function fireCouponGrantedEmail(database: SupabaseClient, customerCouponId: string): void {
  database.functions
    .invoke('send-coupon-granted', { body: { customerCouponId } })
    .then((r: { error?: unknown }) => {
      if (r?.error) {
        console.warn('[coupons:notify] send-coupon-granted error (non-blocking):', r.error)
      }
    })
    .catch((err: unknown) => {
      console.warn('[coupons:notify] send-coupon-granted exception (non-blocking):', err)
    })
}

export async function validateCampaignTargets(data: Record<string, unknown>, orgId: string): Promise<boolean> {
  if (!orgId) return false
  const ids = (data.target_ids ?? []) as string[]
  if (data.target_type === 'specific_organization' && (ids.length !== 1 || ids[0] !== orgId)) return false
  if (data.target_type === 'specific_scenarios') {
    const { data: rows, error } = await db!.from('organization_scenarios').select('id, scenario_master_id').eq('organization_id', orgId)
    if (error || ids.some(id => !rows?.some(row => row.id === id || row.scenario_master_id === id))) return false
  }
  const stores = (data.target_store_ids ?? []) as string[]
  if (stores.length) {
    const { data: rows, error } = await db!.from('stores').select('id').eq('organization_id', orgId).in('id', stores)
    if (error || stores.some(id => !rows?.some(row => row.id === id))) return false
  }
  return true
}
