/**
 * お客様向けの店舗名・店舗数・地域の決め方（予約サイトのトップ・全体トップ・フッターで共通）。
 *
 * 店舗名をどう見せるかはここ 1 か所で決める（点検 2026-10-11 の 15・33）。優先順:
 * 1. 臨時会場は日付ごとの `temporary_venue_names`（無ければ public_name、それも無ければ「特設会場」）
 * 2. 店舗設定の「お客様向けの名前」 `stores.public_name`（例: 仮設店① → フォレスト①）
 * 3. 店舗名から組織名の接頭辞を外したもの（「クインズワルツ高田馬場店」→「高田馬場店」。外すと空なら元のまま）
 * お客様向けの画面・メールはこの関数を通す。スタッフ向けの管理画面は従来どおり name / short_name。
 */

export interface StoreNameSource {
  name?: string | null
  public_name?: string | null
  short_name?: string | null
  is_temporary?: boolean | null
  temporary_venue_names?: unknown
}

export interface StoreCountSource {
  name?: string | null
  short_name?: string | null
  is_temporary?: boolean | null
  status?: string | null
  ownership_type?: string | null
}

export interface StoreAreaSource {
  region?: string | null
  address?: string | null
}

/** 臨時会場で日付ごとの名前が無いときの表示 */
export const TEMPORARY_VENUE_FALLBACK_NAME = '特設会場'

const SEPARATORS = /^[\s　・\-－ー_/／]+/

function venueNameForDate(names: unknown, date: string | null | undefined): string | null {
  if (!date || !names || typeof names !== 'object' || Array.isArray(names)) return null
  const value = (names as Record<string, unknown>)[date]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** 先頭の組織名を外す。外すと空になるなら元のまま */
export function stripOrganizationPrefix(name: string, organizationName?: string | null): string {
  const base = name.trim()
  const org = organizationName?.trim()
  if (!org || !base.startsWith(org)) return base
  const rest = base.slice(org.length).replace(SEPARATORS, '').trim()
  return rest || base
}

/**
 * お客様に見せる店舗名。
 * @param store stores_public の行（無ければ fallback を使う）
 * @param options.organizationName 外す接頭辞（組織名）
 * @param options.date 公演日（臨時会場の名前を引く）
 * @param options.fallback 店舗が引けないときの名前（公演の venue など）
 */
export function storeDisplayName(
  store: StoreNameSource | null | undefined,
  options: { organizationName?: string | null; date?: string | null; fallback?: string | null } = {},
): string {
  const { organizationName, date, fallback } = options
  const publicName = store?.public_name?.trim() || null
  if (store?.is_temporary) {
    return venueNameForDate(store.temporary_venue_names, date) ?? publicName ?? TEMPORARY_VENUE_FALLBACK_NAME
  }
  if (publicName) return publicName
  const base = (store?.name || store?.short_name || fallback || '').trim()
  if (!base) return '店舗未定'
  return stripOrganizationPrefix(base, organizationName)
}

/**
 * 店舗として数える・並べるか（臨時会場・休止中・オフィスを除く）。店舗数はこの数え方だけを使う。
 * オフィス（レンタルスペース）は公演の会場にはなるが店舗には数えない（作品カタログの店舗絞り込みと同じ扱い）。
 */
export function isPublicRegularStore(store: StoreCountSource): boolean {
  if (store.is_temporary) return false
  if (store.status === 'inactive') return false
  if (store.ownership_type === 'office') return false
  if ((store.name || store.short_name || '').includes('オフィス')) return false
  return true
}

/** 公開中の店舗数（トップ・全体トップ・組織カードで共通） */
export function countPublicStores(stores: readonly StoreCountSource[]): number {
  return stores.filter(isPublicRegularStore).length
}

const PREFECTURE_RE = /^(北海道|東京都|京都府|大阪府|.{2,3}県)/

/** 店舗の都道府県（region が都道府県ならそれ、無ければ住所の先頭） */
export function storePrefecture(store: StoreAreaSource): string | null {
  const region = store.region?.trim()
  if (region && PREFECTURE_RE.test(region)) return region.match(PREFECTURE_RE)![1]
  const address = store.address?.trim()
  if (address) {
    const m = address.match(PREFECTURE_RE)
    if (m) return m[1]
  }
  return region || null
}

/** 「東京都」→「東京」（北海道はそのまま） */
export function shortPrefecture(prefecture: string): string {
  if (prefecture === '北海道') return prefecture
  return prefecture.replace(/[都府県]$/, '')
}

/** 店舗の並びから「東京・埼玉」のような地域の文字（出現順・重複なし） */
export function storeAreaLabel(stores: readonly (StoreAreaSource & StoreCountSource)[]): string {
  const prefectures: string[] = []
  for (const store of stores) {
    if (!isPublicRegularStore(store)) continue
    const p = storePrefecture(store)
    if (p && !prefectures.includes(p)) prefectures.push(p)
  }
  return prefectures.map(shortPrefecture).join('・')
}

/** 上の帯の一言（組織設定に文が無いとき）。例: 「東京・埼玉 6 店舗のマーダーミステリー専門店」 */
export function autoOrganizationTagline(stores: readonly (StoreAreaSource & StoreCountSource)[]): string {
  const count = countPublicStores(stores)
  const area = storeAreaLabel(stores)
  if (count === 0) return 'マーダーミステリー専門店'
  if (count === 1) return area ? `${area}のマーダーミステリー専門店` : 'マーダーミステリー専門店'
  return `${area ? `${area} ` : ''}${count} 店舗のマーダーミステリー専門店`
}

/** 店舗の並びの name / short_name をお客様向けの名前に置き換える（id・その他の列はそのまま） */
export function withCustomerStoreNames<T extends StoreNameSource>(stores: readonly T[], organizationName: string | null | undefined): T[] {
  return stores.map((s) => {
    const display = storeDisplayName(s, { organizationName })
    return { ...s, name: display, short_name: display }
  })
}

/**
 * stores の行（organizations(name) を埋め込んだもの）の name / short_name をお客様向けの名前にする。
 * マイページなど、stores を直接読むお客様向けの取得で使う。
 */
export function toCustomerStoreRow<T extends StoreNameSource & { organizations?: { name?: string | null } | { name?: string | null }[] | null }>(row: T): T {
  const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
  const display = storeDisplayName(row, { organizationName: org?.name ?? null })
  return { ...row, name: display, short_name: display }
}
