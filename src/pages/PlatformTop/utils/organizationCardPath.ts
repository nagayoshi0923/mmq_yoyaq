/** 組織カードの行き先。貸切用は「MMQ トップから来た」印（from=mmq）を付け、作品一覧に「別の店舗を選ぶ」を出す */
export function organizationCardPath(slug: string, mode: 'default' | 'private' = 'default'): string {
  return mode === 'private' ? `/${slug}/private-booking-select?from=mmq` : `/${slug}`
}
