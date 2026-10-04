/**
 * ライセンス報告の送信画面の表示用の件数・金額（表示モード＝全体／自社／他社に応じて）。
 * SendReports.tsx から規則を変えずに切り出した純粋な関数。明細は手動上書きを反映した後の値（プレビュー）を渡す。
 */
import type { ReportGroup, ReportItem } from './types'

export type ReportViewMode = 'all' | 'internal' | 'external'

type CountFields = Pick<ReportItem, 'events' | 'internalEvents' | 'externalEvents' | 'licenseCost' | 'internalLicenseCost' | 'externalLicenseCost'>

/** 明細 1 件の公演数（表示モード別） */
export function itemDisplayEvents(item: CountFields, viewMode: ReportViewMode): number {
  switch (viewMode) {
    case 'internal': return item.internalEvents
    case 'external': return item.externalEvents
    default: return item.events
  }
}

/** 明細 1 件の金額（表示モード別） */
export function itemDisplayLicenseCost(item: CountFields, viewMode: ReportViewMode): number {
  switch (viewMode) {
    case 'internal': return item.internalLicenseCost
    case 'external': return item.externalLicenseCost
    default: return item.licenseCost
  }
}

/** 作者ごとの公演数・金額の合計（表示モード別） */
export function sumDisplayEvents(items: CountFields[], viewMode: ReportViewMode): number {
  return items.reduce((sum, i) => sum + itemDisplayEvents(i, viewMode), 0)
}
export function sumDisplayLicenseCost(items: CountFields[], viewMode: ReportViewMode): number {
  return items.reduce((sum, i) => sum + itemDisplayLicenseCost(i, viewMode), 0)
}

/**
 * 送信時の記録と今の集計の差。有料明細（licenseCost > 0・送信時と同じ基準）で公演数・金額を比べ、どちらかが違えば差分。
 */
export function reportDrift(
  items: CountFields[],
  sent: { totalEvents: number; totalCost: number } | undefined,
): { events: number; cost: number; sentEvents: number; sentCost: number } | null {
  if (!sent) return null
  const paid = items.filter(i => i.licenseCost > 0)
  const events = paid.reduce((sum, i) => sum + i.events, 0)
  const cost = paid.reduce((sum, i) => sum + i.licenseCost, 0)
  if (events === sent.totalEvents && cost === sent.totalCost) return null
  return { events, cost, sentEvents: sent.totalEvents, sentCost: sent.totalCost }
}

/** 一覧の上の統計（作者数・メールの有無・公演数・金額。自社／他社の内訳つき） */
export function buildReportStats(groups: ReportGroup[], preview: (item: ReportItem) => CountFields, viewMode: ReportViewMode) {
  const itemsOf = (g: ReportGroup) => g.items.map(preview)
  return {
    totalGroups: groups.length,
    withEmail: groups.filter(g => g.authorEmail && g.itemsWithoutEmail === 0).length,
    partialEmail: groups.filter(g => g.hasPartialEmail).length,
    withoutEmail: groups.filter(g => !g.authorEmail).length,
    totalEvents: groups.reduce((sum, g) => sum + sumDisplayEvents(itemsOf(g), viewMode), 0),
    totalInternalEvents: groups.reduce((sum, g) => sum + sumDisplayEvents(itemsOf(g), 'internal'), 0),
    totalExternalEvents: groups.reduce((sum, g) => sum + sumDisplayEvents(itemsOf(g), 'external'), 0),
    totalLicense: groups.reduce((sum, g) => sum + sumDisplayLicenseCost(itemsOf(g), viewMode), 0),
    totalInternalLicense: groups.reduce((sum, g) => sum + sumDisplayLicenseCost(itemsOf(g), 'internal'), 0),
    totalExternalLicense: groups.reduce((sum, g) => sum + sumDisplayLicenseCost(itemsOf(g), 'external'), 0),
  }
}

/** 作者の束ね方のキー（メールがあればメール、無ければ元の作者名） */
export function reportGroupKey(group: Pick<ReportGroup, 'authorEmail' | 'originalAuthorName'>): string {
  return group.authorEmail ? `email:${group.authorEmail}` : `name:${group.originalAuthorName}`
}
