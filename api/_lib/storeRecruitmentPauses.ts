import { ApiError } from './auth.js'
import type { SupabaseClient } from '@supabase/supabase-js'

// 店舗の募集停止期間（QW-20260909-011）。組織と店舗の所属はサーバーで確かめ、入力の組織IDは使わない。
const FIELDS = 'id, store_id, pause_type, starts_on, ends_on, created_at'
const TYPES = ['performance', 'private']
const YMD = /^\d{4}-\d{2}-\d{2}$/

// The database client is injected so the tenant boundary can be tested without live data.
async function assertOwnStore(database: SupabaseClient, orgId: string | null, storeId: unknown): Promise<string> {
  if (!orgId) throw new ApiError(403, '組織を確認できません')
  if (typeof storeId !== 'string' || !storeId) throw new ApiError(400, '店舗IDが必要です')
  const store = await database.from('stores').select('id').eq('id', storeId).eq('organization_id', orgId).maybeSingle()
  if (store.error) throw new ApiError(500, '店舗を確認できません')
  if (!store.data) throw new ApiError(404, '店舗が見つかりません')
  return storeId
}

// 店舗IDを省くと、組織の全店舗分を返す（スケジュール表示用）
export async function listStoreRecruitmentPauses(database: SupabaseClient, orgId: string | null, storeId: unknown) {
  if (storeId === undefined || storeId === '') {
    if (!orgId) throw new ApiError(403, '組織を確認できません')
    const all = await database.from('store_recruitment_pauses').select(FIELDS).eq('organization_id', orgId)
    if (all.error) throw new ApiError(500, '募集停止期間を取得できません')
    return all.data ?? []
  }
  const id = await assertOwnStore(database, orgId, storeId)
  const result = await database.from('store_recruitment_pauses').select(FIELDS).eq('store_id', id).eq('organization_id', orgId)
    .order('starts_on', { ascending: true, nullsFirst: true })
  if (result.error) throw new ApiError(500, '募集停止期間を取得できません')
  return result.data ?? []
}

export async function addStoreRecruitmentPause(database: SupabaseClient, orgId: string | null, storeId: unknown, value: unknown) {
  const id = await assertOwnStore(database, orgId, storeId)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, '設定形式が不正です')
  const body = value as Record<string, unknown>
  if (!TYPES.includes(String(body.pause_type))) throw new ApiError(400, '停止の種類が不正です')
  const date = (key: string) => {
    const v = body[key]
    if (v === null || v === undefined || v === '') return null
    if (typeof v !== 'string' || !YMD.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new ApiError(400, '日付の形式が不正です')
    return v
  }
  const startsOn = date('starts_on')
  const endsOn = date('ends_on')
  if (startsOn && endsOn && startsOn > endsOn) throw new ApiError(400, '終了日は開始日以降にしてください')
  const created = await database.from('store_recruitment_pauses')
    .insert({ organization_id: orgId, store_id: id, pause_type: body.pause_type, starts_on: startsOn, ends_on: endsOn })
    .select(FIELDS).maybeSingle()
  if (created.error) throw new ApiError(500, '募集停止期間を保存できません')
  return created.data
}

export async function removeStoreRecruitmentPause(database: SupabaseClient, orgId: string | null, storeId: unknown, pauseId: unknown) {
  const id = await assertOwnStore(database, orgId, storeId)
  if (typeof pauseId !== 'string' || !pauseId) throw new ApiError(400, '期間IDが必要です')
  const removed = await database.from('store_recruitment_pauses').delete()
    .eq('id', pauseId).eq('store_id', id).eq('organization_id', orgId).select('id')
  if (removed.error) throw new ApiError(500, '募集停止期間を削除できません')
  if (!removed.data?.length) throw new ApiError(404, '募集停止期間が見つかりません')
  return { success: true }
}
