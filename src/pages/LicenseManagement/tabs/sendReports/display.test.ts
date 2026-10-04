import { describe, expect, it } from 'vitest'
import { buildReportStats, itemDisplayEvents, itemDisplayLicenseCost, reportDrift, reportGroupKey, sumDisplayEvents } from './display'
import type { ReportGroup, ReportItem } from './types'

const item = (events: number, internal: number, cost: number, internalCost: number) =>
  ({ events, internalEvents: internal, externalEvents: events - internal, licenseCost: cost, internalLicenseCost: internalCost, externalLicenseCost: cost - internalCost }) as ReportItem

describe('ライセンス報告の表示用の件数・金額', () => {
  it('表示モードで公演数・金額を切り替える', () => {
    const i = item(5, 3, 5000, 3000)
    expect([itemDisplayEvents(i, 'all'), itemDisplayEvents(i, 'internal'), itemDisplayEvents(i, 'external')]).toEqual([5, 3, 2])
    expect([itemDisplayLicenseCost(i, 'all'), itemDisplayLicenseCost(i, 'internal'), itemDisplayLicenseCost(i, 'external')]).toEqual([5000, 3000, 2000])
    expect(sumDisplayEvents([i, item(1, 1, 0, 0)], 'internal')).toBe(4)
  })

  it('送信時との差は有料明細で比べる（0 円の明細は数えない）', () => {
    const items = [item(5, 3, 5000, 3000), item(2, 2, 0, 0)]
    expect(reportDrift(items, undefined)).toBeNull()
    expect(reportDrift(items, { totalEvents: 5, totalCost: 5000 })).toBeNull()
    expect(reportDrift(items, { totalEvents: 4, totalCost: 4000 })).toEqual({ events: 5, cost: 5000, sentEvents: 4, sentCost: 4000 })
  })

  it('統計と作者のキー', () => {
    const groups = [
      { authorEmail: 'a@example.invalid', itemsWithoutEmail: 0, hasPartialEmail: false, originalAuthorName: 'A', items: [item(5, 3, 5000, 3000)] },
      { authorEmail: null, itemsWithoutEmail: 1, hasPartialEmail: false, originalAuthorName: 'B', items: [item(2, 0, 1000, 0)] },
    ] as unknown as ReportGroup[]
    expect(buildReportStats(groups, (i) => i, 'all')).toEqual({
      totalGroups: 2, withEmail: 1, partialEmail: 0, withoutEmail: 1,
      totalEvents: 7, totalInternalEvents: 3, totalExternalEvents: 4, totalLicense: 6000, totalInternalLicense: 3000, totalExternalLicense: 3000,
    })
    expect(reportGroupKey(groups[0])).toBe('email:a@example.invalid')
    expect(reportGroupKey(groups[1])).toBe('name:B')
  })
})
