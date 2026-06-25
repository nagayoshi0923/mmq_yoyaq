/**
 * ライセンス報告グループの並び替え比較（純関数・テスト対象）
 *
 * SendReports の filteredGroups.sort コールバックから抽出（Phase 5-5・挙動不変）。
 * sortKey に応じた比較値を算出し、sortAsc で昇降順を反転する。副作用なし。
 */

/** 並び替えキー（SendReports の SortKey と同一）。 */
export type ReportSortKey = 'hasEvents' | 'name' | 'email' | 'events' | 'cost'

/** compareReportGroups が参照するグループの最小集合。 */
export interface SortableReportGroup {
  authorName: string
  authorEmail: string | null
  totalEvents: number
  totalLicenseCost: number
}

/**
 * 2 グループの比較値を返す（Array.prototype.sort 用）。
 * - hasEvents: 公演あり（totalEvents > 0）を優先、同点は名前順（日本語ロケール）
 * - name: 名前順 / email: メアド順（未登録は 'zzz' で末尾） / events: 公演数 / cost: ライセンス料
 * sortAsc=false（既定）で降順に反転する。
 */
export function compareReportGroups(
  a: SortableReportGroup,
  b: SortableReportGroup,
  sortKey: ReportSortKey,
  sortAsc: boolean,
): number {
  let cmp = 0
  switch (sortKey) {
    case 'hasEvents': {
      // 公演あり（totalEvents > 0）を優先、同じなら名前順
      const aHas = a.totalEvents > 0 ? 1 : 0
      const bHas = b.totalEvents > 0 ? 1 : 0
      cmp = aHas !== bHas ? aHas - bHas : a.authorName.localeCompare(b.authorName, 'ja')
      break
    }
    case 'name':
      cmp = a.authorName.localeCompare(b.authorName, 'ja')
      break
    case 'email':
      cmp = (a.authorEmail || 'zzz').localeCompare(b.authorEmail || 'zzz')
      break
    case 'events':
      cmp = a.totalEvents - b.totalEvents
      break
    case 'cost':
      cmp = a.totalLicenseCost - b.totalLicenseCost
      break
  }
  return sortAsc ? cmp : -cmp
}
