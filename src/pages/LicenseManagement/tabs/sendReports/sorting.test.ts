import { describe, expect, it } from 'vitest'
import { compareReportGroups, type SortableReportGroup } from './sorting'

function group(overrides: Partial<SortableReportGroup> = {}): SortableReportGroup {
  return {
    authorName: 'あ',
    authorEmail: null,
    totalEvents: 0,
    totalLicenseCost: 0,
    ...overrides,
  }
}

// 比較関数で実際に並べた authorName 配列を返すヘルパー
function sortedNames(groups: SortableReportGroup[], key: Parameters<typeof compareReportGroups>[2], asc: boolean): string[] {
  return [...groups].sort((a, b) => compareReportGroups(a, b, key, asc)).map(g => g.authorName)
}

describe('compareReportGroups', () => {
  it('hasEvents: 公演ありを優先、同点は名前順（降順既定でも公演あり優先は維持）', () => {
    const groups = [
      group({ authorName: 'い', totalEvents: 0 }),
      group({ authorName: 'あ', totalEvents: 5 }),
      group({ authorName: 'う', totalEvents: 3 }),
    ]
    // sortAsc=false（降順）: 公演あり(あ,う)が先、同点グループ内は名前順を -1 反転
    expect(sortedNames(groups, 'hasEvents', false)).toEqual(['う', 'あ', 'い'])
    // sortAsc=true（昇順）: 公演なし(い)が先
    expect(sortedNames(groups, 'hasEvents', true)).toEqual(['い', 'あ', 'う'])
  })

  it('name: 日本語ロケールの名前順、sortAsc で反転', () => {
    const groups = [group({ authorName: 'う' }), group({ authorName: 'あ' }), group({ authorName: 'い' })]
    expect(sortedNames(groups, 'name', true)).toEqual(['あ', 'い', 'う'])
    expect(sortedNames(groups, 'name', false)).toEqual(['う', 'い', 'あ'])
  })

  it('email: 未登録は zzz 扱いで末尾（昇順）', () => {
    const groups = [
      group({ authorName: 'noemail', authorEmail: null }),
      group({ authorName: 'a', authorEmail: 'a@example.com' }),
      group({ authorName: 'b', authorEmail: 'b@example.com' }),
    ]
    expect(sortedNames(groups, 'email', true)).toEqual(['a', 'b', 'noemail'])
  })

  it('events / cost: 数値比較', () => {
    const byEvents = [group({ authorName: 'lo', totalEvents: 1 }), group({ authorName: 'hi', totalEvents: 9 })]
    expect(sortedNames(byEvents, 'events', true)).toEqual(['lo', 'hi'])
    expect(sortedNames(byEvents, 'events', false)).toEqual(['hi', 'lo'])

    const byCost = [group({ authorName: 'lo', totalLicenseCost: 100 }), group({ authorName: 'hi', totalLicenseCost: 999 })]
    expect(sortedNames(byCost, 'cost', false)).toEqual(['hi', 'lo'])
  })
})
