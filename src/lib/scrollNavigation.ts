/**
 * ScrollToTop が「別の画面へ移った」とみなすかの判定（src/components/routing/ScrollToTop.tsx から使う）。
 */

// ⚠️ 画面の中の状態を持つだけの query param はナビゲーションと見なさない（下の一覧）。
//    これらが変わるたびに上へ戻すと、ダイアログを開いた瞬間や絞り込みを押した瞬間に最上部へ飛ぶ。

/** ダイアログ状態: event・count は作品ページで選んだ公演と人数（選ぶたびに URL を書き換える） */
const DIALOG_QUERY_PARAMS = ['event', 'count'] as const

/**
 * 公演の絞り込み条件（usePerformanceSearchParams が持つキー。店舗トップ・MMQ 全体トップ・貸切の店舗選択）。
 * 今週／来週／今月・日付・店舗・空席あり・初心者向け・地域・カレンダー／リストの切替は、同じ画面の中の操作。
 * people は 2026-10-12 に廃止したが、古いリンクから消すときに URL が変わるので含める。
 * 2026-10-20 社長の公開前点検で「絞り込みを押すたびに先頭へ戻る」が見つかり追加。
 */
const SEARCH_FILTER_QUERY_PARAMS = ['when', 'date', 'stores', 'avail', 'beginner', 'area', 'view', 'people'] as const

export const NON_NAVIGATION_QUERY_PARAMS: readonly string[] = [...DIALOG_QUERY_PARAMS, ...SEARCH_FILTER_QUERY_PARAMS]

export function stripNonNavigationParams(search: string): string {
  if (!search) return ''
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const key of NON_NAVIGATION_QUERY_PARAMS) {
    params.delete(key)
  }
  const result = params.toString()
  return result ? `?${result}` : ''
}

/** 前回と今回で「別の画面」になったか（null は初回） */
export function isNavigationChange(prevKey: string | null, pathname: string, search: string): boolean {
  if (prevKey === null) return false
  return prevKey !== `${pathname}${stripNonNavigationParams(search)}`
}
