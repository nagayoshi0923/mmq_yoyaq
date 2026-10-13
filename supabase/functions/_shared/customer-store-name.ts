/**
 * お客様に届くメールの店舗名。画面の src/lib/publicStoreName.ts（storeDisplayName）と
 * DB の public.customer_store_name と同じ決め方:
 * 1. 臨時会場はその日の temporary_venue_names（無ければ public_name、それも無ければ「特設会場」）
 * 2. stores.public_name
 * 3. 店舗名から組織名の接頭辞を外したもの（外すと空なら元の名前）
 */
export interface CustomerStoreNameSource {
  name?: string | null
  short_name?: string | null
  public_name?: string | null
  is_temporary?: boolean | null
  temporary_venue_names?: unknown
  organizations?: { name?: string | null } | { name?: string | null }[] | null
}

const SEPARATORS = /^[\s　・\-－ー_/／]+/

export function customerStoreName(
  store: CustomerStoreNameSource | null | undefined,
  options: { date?: string | null; fallback?: string | null; organizationName?: string | null } = {},
): string {
  const fallback = options.fallback?.trim() || ''
  if (!store) return fallback
  const publicName = store.public_name?.trim() || ''
  if (store.is_temporary) {
    const names = store.temporary_venue_names
    const byDate = options.date && names && typeof names === 'object' && !Array.isArray(names)
      ? (names as Record<string, unknown>)[options.date]
      : null
    if (typeof byDate === 'string' && byDate.trim()) return byDate.trim()
    return publicName || '特設会場'
  }
  if (publicName) return publicName
  const base = (store.name || store.short_name || fallback).trim()
  const org = Array.isArray(store.organizations) ? store.organizations[0] : store.organizations
  const orgName = (options.organizationName ?? org?.name ?? '').trim()
  if (orgName && base.startsWith(orgName)) {
    const rest = base.slice(orgName.length).replace(SEPARATORS, '').trim()
    if (rest) return rest
  }
  return base
}
