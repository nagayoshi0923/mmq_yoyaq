/** カタログの URL で新作だけを開くときのクエリ（?filter=new） */
export const NEW_ARRIVALS_FILTER_PARAM = 'filter'
export const NEW_ARRIVALS_FILTER_VALUE = 'new'

/** 全作品のカタログ（全体 /scenario、組織 /{org}/catalog）。「カタログ」ボタン・新作フィルターの解除の行き先 */
export function catalogPath(organizationSlug?: string | null): string {
  return organizationSlug ? `/${organizationSlug}/catalog` : '/scenario'
}

/** 新作だけの一覧（トップの新作一覧の「すべて見る ›」の行き先） */
export function newArrivalsPath(organizationSlug?: string | null): string {
  return `${catalogPath(organizationSlug)}?${NEW_ARRIVALS_FILTER_PARAM}=${NEW_ARRIVALS_FILTER_VALUE}`
}

export function isNewArrivalsFilter(search: URLSearchParams): boolean {
  return search.get(NEW_ARRIVALS_FILTER_PARAM) === NEW_ARRIVALS_FILTER_VALUE
}
