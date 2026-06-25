import { describe, expect, it } from 'vitest'
import { groupReportItems } from './grouping'
import type { ReportItem } from './types'

function item(o: Partial<ReportItem> & { scenarioKey: string }): ReportItem {
  return {
    scenarioId: o.scenarioKey,
    scenarioTitle: 'T',
    author: '作者',
    reportDisplayName: '作者',
    authorEmail: null,
    events: 0,
    internalEvents: 0,
    externalEvents: 0,
    licenseCost: 0,
    internalLicenseCost: 0,
    externalLicenseCost: 0,
    internalLicenseAmount: 0,
    externalLicenseAmount: 0,
    ...o,
  }
}

const noMaps = () => [new Map<string, string>(), new Map<string, string>()] as const

describe('groupReportItems', () => {
  it('同一メアドは1グループに集約し合計を加算', () => {
    const [notes, org] = noMaps()
    const groups = groupReportItems([
      item({ scenarioKey: 'a', authorEmail: 'x@example.com', reportDisplayName: '田中', events: 3, internalEvents: 3, licenseCost: 300, internalLicenseCost: 300 }),
      item({ scenarioKey: 'b', authorEmail: 'x@example.com', reportDisplayName: '田中', events: 2, externalEvents: 2, licenseCost: 200, externalLicenseCost: 200 }),
    ], notes, org)

    expect(groups).toHaveLength(1)
    const g = groups[0]
    expect(g.authorName).toBe('田中')
    expect(g.authorEmail).toBe('x@example.com')
    expect(g.items).toHaveLength(2)
    expect(g.totalEvents).toBe(5)
    expect(g.totalInternalEvents).toBe(3)
    expect(g.totalExternalEvents).toBe(2)
    expect(g.totalLicenseCost).toBe(500)
    expect(g.totalInternalLicenseCost).toBe(300)
    expect(g.totalExternalLicenseCost).toBe(200)
    expect(g.itemsWithEmail).toBe(2)
    expect(g.itemsWithoutEmail).toBe(0)
    expect(g.hasPartialEmail).toBe(false)
  })

  it('メアド無しは reportDisplayName でグループ化', () => {
    const [notes, org] = noMaps()
    const groups = groupReportItems([
      item({ scenarioKey: 'a', authorEmail: null, reportDisplayName: '名無し', events: 1 }),
    ], notes, org)
    expect(groups).toHaveLength(1)
    expect(groups[0].authorName).toBe('名無し')
    expect(groups[0].itemsWithoutEmail).toBe(1)
    expect(groups[0].itemsWithEmail).toBe(0)
  })

  it('異なるメアドは別グループ', () => {
    const [notes, org] = noMaps()
    const groups = groupReportItems([
      item({ scenarioKey: 'a', authorEmail: 'a@x.com', reportDisplayName: 'A' }),
      item({ scenarioKey: 'b', authorEmail: 'b@x.com', reportDisplayName: 'B' }),
    ], notes, org)
    expect(groups).toHaveLength(2)
  })

  it('license_organization_name があればグループ表示名を上書き', () => {
    const [notes] = noMaps()
    const org = new Map([['作者A', '株式会社X']])
    const groups = groupReportItems([
      item({ scenarioKey: 'a', author: '作者A', reportDisplayName: '表示A' }),
    ], notes, org)
    expect(groups[0].authorName).toBe('株式会社X')
  })

  it('メアドグループで表示名が複数なら sort して " / " 連結', () => {
    const [notes, org] = noMaps()
    const groups = groupReportItems([
      item({ scenarioKey: 'a', authorEmail: 'x@example.com', reportDisplayName: '田中' }),
      item({ scenarioKey: 'b', authorEmail: 'x@example.com', reportDisplayName: '佐藤' }),
    ], notes, org)
    expect(groups[0].authorName).toBe(['田中', '佐藤'].sort().join(' / '))
  })

  it('authorNotes は authorNotesMap から（作者名で解決）', () => {
    const notes = new Map([['作者A', 'メモA']])
    const [, org] = noMaps()
    const groups = groupReportItems([
      item({ scenarioKey: 'a', author: '作者A', reportDisplayName: '表示A' }),
    ], notes, org)
    expect(groups[0].authorNotes).toBe('メモA')
  })
})
