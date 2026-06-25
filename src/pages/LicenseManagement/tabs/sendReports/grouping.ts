/**
 * ライセンス報告明細の作者グループ化（純関数・テスト対象）
 *
 * SendReports の loadData 内のグループ化ロジックから抽出（Phase 5-5・挙動不変）。
 * 明細（ReportItem[]）を作者ごとに集約し ReportGroup[] を返す。副作用なし。
 * 作者メモ・組織名は呼び出し側で取得したマップを注入する。
 * （呼び出し側の totalEvents 降順ソートはここには含めない＝grouping のみ）
 */
import type { ReportItem, ReportGroup } from './types'

/**
 * 明細を作者でグループ化する。
 * - グループキー: メアドがあれば `email:<addr>`、無ければ `name:<reportDisplayName>`
 * - 合計（公演数・金額）を集約、メアド有無で itemsWithEmail/Without をカウント
 * - hasPartialEmail: グループ内にメアド有り・無しが混在
 * - authorNotes: authorNotesMap（reportDisplayName 優先、無ければ originalAuthorName）
 * - グループ表示名の優先順位:
 *   1. グループ内いずれかの作者が持つ license_organization_name（authorOrgNameMap）
 *   2. メアドグループで表示名が複数なら sort して ' / ' 結合
 *   3. そのままの reportDisplayName
 */
export function groupReportItems(
  items: ReportItem[],
  authorNotesMap: Map<string, string>,
  authorOrgNameMap: Map<string, string>,
): ReportGroup[] {
  // グループ化: メールアドレスがあればメアドで、なければ報告用表示名で
  const groupMap = new Map<string, ReportGroup>()
  // メアドごとの表示名を追跡（複数作者をまとめる場合用）
  const emailDisplayNames = new Map<string, Set<string>>()

  items.forEach(item => {
    // メールアドレスがあればメアドでグループ化、なければ報告用表示名でグループ化
    const key = item.authorEmail
      ? `email:${item.authorEmail}`
      : `name:${item.reportDisplayName}`

    // メアドグループの場合、表示名を追跡
    if (item.authorEmail) {
      if (!emailDisplayNames.has(item.authorEmail)) {
        emailDisplayNames.set(item.authorEmail, new Set())
      }
      emailDisplayNames.get(item.authorEmail)!.add(item.reportDisplayName)
    }

    if (groupMap.has(key)) {
      const group = groupMap.get(key)!
      group.items.push(item)
      group.totalEvents += item.events
      group.totalInternalEvents += item.internalEvents
      group.totalExternalEvents += item.externalEvents
      group.totalLicenseCost += item.licenseCost
      group.totalInternalLicenseCost += item.internalLicenseCost
      group.totalExternalLicenseCost += item.externalLicenseCost
      if (item.authorEmail) {
        group.itemsWithEmail++
      } else {
        group.itemsWithoutEmail++
      }
    } else {
      groupMap.set(key, {
        authorName: item.reportDisplayName,
        originalAuthorName: item.author,
        authorEmail: item.authorEmail,
        authorNotes: authorNotesMap.get(item.author) || null,
        items: [item],
        totalEvents: item.events,
        totalInternalEvents: item.internalEvents,
        totalExternalEvents: item.externalEvents,
        totalLicenseCost: item.licenseCost,
        totalInternalLicenseCost: item.internalLicenseCost,
        totalExternalLicenseCost: item.externalLicenseCost,
        itemsWithEmail: item.authorEmail ? 1 : 0,
        itemsWithoutEmail: item.authorEmail ? 0 : 1,
        hasPartialEmail: false
      })
    }
  })

  // 一部未登録フラグ・メモ・グループ表示名を確定
  groupMap.forEach((group, key) => {
    group.hasPartialEmail = group.itemsWithEmail > 0 && group.itemsWithoutEmail > 0

    // メモ
    if (!group.authorNotes) {
      group.authorNotes = authorNotesMap.get(group.originalAuthorName) || null
    }

    // グループ表示名の優先順位:
    //   1. グループ内いずれかの作者が持つ license_organization_name
    //   2. メアドグループの場合、report_display_name の結合
    //   3. そのままの reportDisplayName
    const orgName = group.items
      .map(item => authorOrgNameMap.get(item.author))
      .find(name => !!name)

    if (orgName) {
      group.authorName = orgName
    } else if (key.startsWith('email:') && group.authorEmail) {
      const displayNames = emailDisplayNames.get(group.authorEmail)
      if (displayNames && displayNames.size > 1) {
        group.authorName = Array.from(displayNames).sort().join(' / ')
      }
    }
  })

  return Array.from(groupMap.values())
}
