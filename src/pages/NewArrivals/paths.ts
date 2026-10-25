import { NEW_ARRIVAL_CHIP } from '@/components/public-top/newArrivals'

/** 前の版の新作一覧の URL（?filter=new）。開いたら「新作」のチップを選んだカタログへ移す */
export const LEGACY_NEW_ARRIVALS_FILTER_PARAM = 'filter'
export const LEGACY_NEW_ARRIVALS_FILTER_VALUE = 'new'

/** 全作品のカタログ（全体 /scenario、組織 /{org}/catalog）。「カタログ」ボタンの行き先 */
export function catalogPath(organizationSlug?: string | null): string {
  return organizationSlug ? `/${organizationSlug}/catalog` : '/scenario'
}

/**
 * 「新作」のチップを選んだカタログ（トップの新作一覧の「すべて見る ›」の行き先）。
 * クエリは既存のカテゴリのチップと同じ ?genre=…（ほかのチップ・検索とそのまま組み合わせられる）
 */
export function newArrivalsPath(organizationSlug?: string | null): string {
  return `${catalogPath(organizationSlug)}?${new URLSearchParams({ genre: NEW_ARRIVAL_CHIP }).toString()}`
}

/** 前の版の ?filter=new を「新作」のチップに置き換えたクエリ（ほかのクエリは残す）。該当しなければ null */
export function legacyNewArrivalsRedirect(search: URLSearchParams): string | null {
  if (search.get(LEGACY_NEW_ARRIVALS_FILTER_PARAM) !== LEGACY_NEW_ARRIVALS_FILTER_VALUE) return null
  const next = new URLSearchParams(search)
  next.delete(LEGACY_NEW_ARRIVALS_FILTER_PARAM)
  const genres = new Set(next.getAll('genre').filter(Boolean))
  genres.add(NEW_ARRIVAL_CHIP)
  next.delete('genre')
  ;[...genres].sort().forEach((g) => next.append('genre', g))
  return next.toString()
}
