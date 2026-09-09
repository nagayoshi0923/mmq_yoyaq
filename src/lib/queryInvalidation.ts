import type { QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * 渡した各 queryKey を「非アクティブな画面も含めて」即時に再取得させる invalidate ヘルパー。
 *
 * このプロジェクトは QueryClient のグローバル既定が `refetchOnMount:false`＋`staleTime:5分`
 * （`src/AppRoot.tsx`）になっている。そのため素の
 * `invalidateQueries({ queryKey })` では、いま画面に出ていない（＝マウントされていない）
 * クエリは stale マークが付くだけで**再取得されない**。
 * mutation の `onSuccess` で「別画面のリスト」を更新したいときは、
 * `refetchType: 'all'` を明示して非アクティブなクエリまで再取得させる必要がある。
 *
 * この付け忘れは過去に複数のバグ実績があり、docs/IMPROVEMENT_HANDOFF.md「0. 絶対ルール」4項の
 * React Query の罠に記載されている。別画面のデータを更新する invalidate はこのヘルパーに寄せること。
 *
 * @example
 * // mutation の onSuccess で、別画面のマイページ一覧も即時更新する
 * onSuccess: () => {
 *   invalidateEverywhere(queryClient, ['mypage-data'])
 * }
 *
 * @param queryClient React Query の QueryClient
 * @param queryKeys 再取得させたい queryKey（可変長）
 * @returns すべての invalidateQueries の完了を待つ Promise
 */
export function invalidateEverywhere(
  queryClient: QueryClient,
  ...queryKeys: QueryKey[]
): Promise<void> {
  return Promise.all(
    queryKeys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, refetchType: 'all' })
    )
  ).then(() => undefined)
}

/** 担当GM（staff_scenario_assignments）を読む画面の queryKey。画面を増やしたらここへ足す。 */
export const ASSIGNMENT_QUERY_KEYS: QueryKey[] = [
  ['staff'],
  ['scenarios'],
  ['org-scenarios', 'list'],
  ['org-scenarios-options'],
]

/**
 * 担当の保存後に呼ぶ。シナリオ管理・スタッフ管理・担当作品・スケジュールが
 * 同じ結合テーブルを読み直す。
 */
export function invalidateAssignmentQueries(queryClient: QueryClient): Promise<void> {
  return invalidateEverywhere(queryClient, ...ASSIGNMENT_QUERY_KEYS)
}
