// スタッフ⇔シナリオ担当の増減差分を求める純粋ロジック（YOYAQ-011 減少ガード）。
// api/assignments.ts（サーバー）から import して使う。副作用・DB 依存を持たないためユニットテスト可能。

/**
 * 既存の担当集合と、新しく送られてきた担当集合を比較して増減を求める。
 * - removed: 既存にあって新配列に無い（＝減る）分
 * - added:   新配列にあって既存に無い（＝増える）分
 * 減少ガードは removed.length > 0 のとき発火する（1件でも減れば拒否）。
 */
export function computeAssignmentDiff(
  existingIds: Iterable<string>,
  incomingIds: Iterable<string>
): { existingCount: number; incomingCount: number; removed: string[]; added: string[] } {
  const existing = new Set<string>(existingIds)
  const incoming = new Set<string>(incomingIds)
  const removed = Array.from(existing).filter((id) => !incoming.has(id))
  const added = Array.from(incoming).filter((id) => !existing.has(id))
  return {
    existingCount: existing.size,
    incomingCount: incoming.size,
    removed,
    added,
  }
}
