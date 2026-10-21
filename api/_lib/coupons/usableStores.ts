// マイページのクーポン: 使える店舗の表示（発行した組織の全店舗＋押すと開く店舗名の一覧、対象店舗を絞ったクーポンは店舗名）。2026-10-12 社長要望
import { couponUsableStores, type CouponStoreSource } from '../../../src/lib/couponUsableStores.js'

type Database = { from: (table: string) => any }
type CouponRow = { organization_id?: string | null; rules_snapshot?: Record<string, unknown> | null }

/** 各クーポンに usable_stores_label を付ける。読めなければ付けない（一覧の表示は続ける） */
export async function withUsableStoresLabel<T extends CouponRow>(database: Database, rows: T[]): Promise<Array<T & { usable_stores_label?: string; usable_store_names?: string[] }>> {
  const orgIds = [...new Set(rows.map(row => row.organization_id).filter((id): id is string => !!id))]
  if (orgIds.length === 0) return rows
  try {
    const [orgResult, storeResult] = await Promise.all([
      database.from('organizations').select('id, name').in('id', orgIds),
      database.from('stores')
        .select('id, organization_id, name, short_name, public_name, is_temporary, status, ownership_type, region, address')
        .in('organization_id', orgIds),
    ])
    if (orgResult.error || storeResult.error) return rows
    const orgName = new Map<string, string>((orgResult.data ?? []).map((org: { id: string; name: string }) => [org.id, org.name]))
    const storesByOrg = new Map<string, CouponStoreSource[]>()
    for (const store of (storeResult.data ?? []) as Array<CouponStoreSource & { organization_id: string }>) {
      const list = storesByOrg.get(store.organization_id) ?? []
      list.push(store)
      storesByOrg.set(store.organization_id, list)
    }
    return rows.map(row => {
      if (!row.organization_id) return row
      const targets = row.rules_snapshot?.target_store_ids
      const targetIds = Array.isArray(targets) ? targets.filter((id): id is string => typeof id === 'string') : null
      const usable = couponUsableStores(orgName.get(row.organization_id), storesByOrg.get(row.organization_id) ?? [], targetIds)
      return { ...row, usable_stores_label: usable.label, usable_store_names: usable.storeNames }
    })
  } catch (error) {
    console.warn('[coupons:all] usable stores failed:', error)
    return rows
  }
}
