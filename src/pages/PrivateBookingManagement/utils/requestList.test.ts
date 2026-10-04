import { describe, expect, it } from 'vitest'
import {
  applyDisplayLimit, buildScenarioOptions, buildStoreOptions, groupStoresByRegion, hasActiveRequestFilters,
  matchesRequestFilters, mergeGmOptions, splitRequestsIntoTabs,
} from './requestList'
import type { PrivateBookingRequest } from '../hooks/usePrivateBookingData'

const req = (over: Partial<PrivateBookingRequest>): PrivateBookingRequest => ({
  id: 'r', reservation_number: '261004-ABCD', scenario_title: '作品A', customer_name: '山田', customer_email: 'y@example.invalid',
  customer_phone: '090', status: 'pending', created_at: '2026-10-01T00:00:00Z',
  candidate_datetimes: { candidates: [{ order: 1, date: '2026-11-01', timeSlot: '夜', startTime: '19:00', endTime: '22:00', status: 'pending' }], requestedStores: [{ storeId: 's1', storeName: '高田馬場' }] },
  ...over,
} as unknown as PrivateBookingRequest)

const none = { searchText: '', scenarioFilter: 'all', storeFilter: 'all' }

describe('貸切リクエスト管理の一覧', () => {
  it('フリーワード・シナリオ・店舗・期間で絞り込む', () => {
    const r = req({})
    expect(matchesRequestFilters(r, none)).toBe(true)
    expect(matchesRequestFilters(r, { ...none, searchText: ' ABCD ' })).toBe(true)
    expect(matchesRequestFilters(r, { ...none, searchText: '佐藤' })).toBe(false)
    expect(matchesRequestFilters(r, { ...none, scenarioFilter: '作品B' })).toBe(false)
    expect(matchesRequestFilters(r, { ...none, storeFilter: '高田馬場' })).toBe(true)
    expect(matchesRequestFilters(r, { ...none, storeFilter: '大塚' })).toBe(false)
    expect(matchesRequestFilters(r, { ...none, dateRangeStart: '2026-11-02' })).toBe(false)
    expect(matchesRequestFilters(r, { ...none, dateRangeEnd: '2026-11-01' })).toBe(true)
    expect(matchesRequestFilters(req({ candidate_datetimes: { candidates: [] } as never }), { ...none, dateRangeStart: '2026-01-01' })).toBe(false)
    expect(hasActiveRequestFilters(none)).toBe(false)
    expect(hasActiveRequestFilters({ ...none, searchText: '  ' })).toBe(false)
    expect(hasActiveRequestFilters({ ...none, dateRangeEnd: '2026-11-01' })).toBe(true)
  })

  it('選択肢はシナリオ名と店舗名（確定・希望）を重複なく並べる', () => {
    const list = [req({ scenario_title: '作品B' }), req({ candidate_datetimes: { candidates: [], confirmedStore: { storeId: 's2', storeName: '大塚' }, requestedStores: [{ storeId: 's1', storeName: '高田馬場' }] } as never })]
    expect(buildScenarioOptions(list)).toEqual(['作品A', '作品B'])
    expect(buildStoreOptions(list)).toEqual(['大塚', '高田馬場'].sort())
  })

  it('タブ分け: GM 準備の有無で作業キューを分け、承認済み・却下済みは動きがあった順', () => {
    const tabs = splitRequestsIntoTabs([
      req({ id: 'g', status: 'pending', gm_team_ready: false }),
      req({ id: 's', status: 'gm_confirmed', gm_team_ready: true }),
      req({ id: 'rej-old', status: 'cancelled', cancelled_at: '2026-10-01T00:00:00Z' }),
      req({ id: 'rej-new', status: 'cancelled', cancelled_at: '2026-10-03T00:00:00Z' }),
      req({ id: 'ok', status: 'confirmed', approver_name: 'えいきち', approved_at: '2026-10-02T00:00:00Z' }),
      req({ id: 'ok-cancel', status: 'cancelled', approver_name: 'えいきち', cancelled_at: '2026-10-04T00:00:00Z' }),
    ] as PrivateBookingRequest[])
    expect(tabs.gmPending.map(r => r.id)).toEqual(['g'])
    expect(tabs.storePending.map(r => r.id)).toEqual(['s'])
    expect(tabs.rejected.map(r => r.id)).toEqual(['rej-new', 'rej-old'])
    expect(tabs.approved.map(r => r.id)).toEqual(['ok-cancel', 'ok'])
  })

  it('表示件数で切る', () => {
    expect(applyDisplayLimit([1, 2, 3], '2')).toEqual([1, 2])
    expect(applyDisplayLimit([1, 2, 3], 'all')).toEqual([1, 2, 3])
  })

  it('店舗は東京・埼玉・神奈川・千葉の順、知らない地域は後、未分類は最後', () => {
    const { sortedRegions, grouped } = groupStoresByRegion([{ region: '大阪' }, { region: null }, { region: '埼玉' }, { region: '東京' }, { region: '京都' }])
    expect(sortedRegions).toEqual(['東京', '埼玉', '未分類', '京都', '大阪'])
    expect(grouped['未分類']).toHaveLength(1)
  })

  it('GM の選択肢はスタッフと回答者をまとめ、名前順', () => {
    const out = mergeGmOptions([{ id: '2', name: 'わたなべ' }], [{ gm_id: 2, gm_name: '重複' }, { gm_id: '9', gm_name: null }, { gm_id: '5', gm_name: 'あおき' }])
    const names = out.map(g => `${g.id}:${g.name}`)
    expect(names).toHaveLength(3)
    expect(names).toContain('9:（スタッフ名不明）')
    expect(names.indexOf('5:あおき')).toBeLessThan(names.indexOf('2:わたなべ'))
  })
})
