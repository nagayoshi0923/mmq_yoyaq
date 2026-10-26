/**
 * 新作一覧のカードの次回公演（2026-10-26 社長報告: 新作のクラファン応援企画に 2027/2/7 の公演があるのに、最初はカードに出なかった）。
 * カードの公演はトップの検索と同じ期間（店舗トップは最初の 3 か月、全体トップは 55 日）しか読んでいないので、
 * 新作の作品だけ、期間に関係なく次の公開の公演を 1〜2 件読む。全部の公演を読み足さない。
 * 既存の判定（募集停止・締切・貸切など）で外れた公演が先にあっても、有効な公演を取りこぼさないよう、2 件そろうか尽きるまで次のページを読む。
 */

/** 作品ごとに出す次回公演の数 */
export const NEW_ARRIVAL_NEXT_COUNT = 2
/** 最初のページは小さく（ふつうは 1 ページで足りる）、外れる公演が続いたら大きめのページで読み進める */
const FIRST_PAGE_SIZE = 4
const NEXT_PAGE_SIZE = 50
/** 実用上の上限（1 作品の今後の公演の行）。超えたら空と見せずに失敗にする（有効な公演を黙って落とさない） */
export const NEW_ARRIVAL_NEXT_MAX_ROWS = 2000

/** 有効な公演が want 件そろうか、公演が尽きるまでページを読む */
export async function collectNextValid<R, V>(
  fetchPage: (offset: number, limit: number) => PromiseLike<{ data: R[] | null; error: unknown }>,
  toValid: (rows: R[]) => V[] | Promise<V[]>,
  want: number = NEW_ARRIVAL_NEXT_COUNT,
): Promise<V[]> {
  const valid: V[] = []
  for (let offset = 0; ;) {
    if (offset >= NEW_ARRIVAL_NEXT_MAX_ROWS) throw new Error(`新作の次回公演: ${NEW_ARRIVAL_NEXT_MAX_ROWS} 件読んでも有効な公演がそろいません`)
    const limit = offset === 0 ? FIRST_PAGE_SIZE : NEXT_PAGE_SIZE
    const { data, error } = await fetchPage(offset, limit)
    if (error) throw error
    const rows = data ?? []
    if (rows.length > 0) valid.push(...await toValid(rows))
    if (valid.length >= want || rows.length < limit) break
    offset += limit
  }
  return valid.slice(0, want)
}

/** 作品ごとの次回公演の読み込み: 読み込み中（今回の取得の前・失敗のあとの再試行中）／読めなかった／読めた */
export type NextEventsState = 'loading' | 'error' | 'ready'

interface NextQueryResult<V> {
  data?: V[]
  isError: boolean
  isFetching: boolean
  isFetchedAfterMount: boolean
  status: string
  fetchStatus: string
  dataUpdatedAt: number
  refetch: () => unknown
}

/**
 * 次回公演の問い合わせの結果を、画面に使う公演と状態にする（2026-10-26 Codex レビュー #1246・点検 R1247）。
 * - 今回の取得が終わるまで、前回のキャッシュの公演は使わない（離れている間に取消・非公開になった公演を出さない）
 * - 読めなかったら「公演なし」と同じにせず error にする（「公演予定未定」と見せない。再試行できる）
 */
export function nextEventsFromQueries<V>(ids: readonly string[], results: readonly NextQueryResult<V>[]) {
  const events: V[] = []
  const state = new Map<string, NextEventsState>()
  ids.forEach((id, i) => {
    const r = results[i]
    if (!r) return
    const fresh = r.isFetchedAfterMount && !r.isError
    if (fresh && r.data) events.push(...r.data)
    state.set(id, !r.isFetchedAfterMount || (r.isError && r.isFetching) ? 'loading' : r.isError ? 'error' : 'ready')
  })
  return { events, state }
}

/** 取得の状態が変わったら作り直すための印（useQueries の結果の配列は毎回新しいので） */
export function nextQueriesKey(results: readonly NextQueryResult<unknown>[]): string {
  return results.map((r) => `${r.status}:${r.fetchStatus}:${r.isFetchedAfterMount ? 1 : 0}:${r.dataUpdatedAt}`).join(',')
}

/** 最初の取得の期間（loadedUntil まで）は最初の取得（再訪で取り直した最新）を正とし、次回公演の取得からは足さない */
export function beyondLoadedRange<V extends { date: string }>(events: readonly V[], loadedUntil: string | null | undefined): V[] {
  return loadedUntil ? events.filter((e) => e.date > loadedUntil) : [...events]
}
