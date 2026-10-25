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
