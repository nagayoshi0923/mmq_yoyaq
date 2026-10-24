import { describe, expect, it } from 'vitest'
import { canRequestPerformance, type PreviewPublicEvent } from './requestPlacement'
import { requestsForSlot, prioritizeRequestedOptions } from './requestSlots'
import { buildPerformanceDraft, groupRequestsForPanel, type PerformanceRequest } from './model'
import { PROTO_SCENARIOS, PROTO_STORES } from './fixtures'
const nowMs = new Date('2026-10-24T12:00:00+09:00').getTime()
const event: PreviewPublicEvent = { scenarioId: 's1', organizationId: 'o1', storeId: 'a', date: '2026-11-20', startTime: '13:00', published: true, cancelled: false, category: 'open', seats: 3, reservationEnabled: true }
const check = (events: PreviewPublicEvent[], patch: object = {}) => canRequestPerformance({ loadState: 'ready', scenarioId: 's1', organizationId: null, selectedStoreIds: [], events, nowMs, ...patch })
describe('公演未設定の入口', () => {
  it('取得成功の0件だけ許可し、読込中・取得失敗を空とみなさない', () => {
    expect(check([])).toBe(true)
    expect(check([], { loadState: 'loading' })).toBe(false)
    expect(check([], { loadState: 'error' })).toBe(false)
  })
  it('満席・予約受付停止は公演未設定ではない', () => {
    expect(check([event])).toBe(false)
    expect(check([{ ...event, startTime: '13:00:00' }])).toBe(false)
    expect(check([{ ...event, startTime: 'invalid' }])).toBe(false)
    expect(check([{ ...event, seats: 0 }])).toBe(false)
    expect(check([{ ...event, reservationEnabled: false }])).toBe(false)
  })
  it('店舗選択・全体と組織・非公開/貸切/中止/過去を区別する', () => {
    expect(check([event], { selectedStoreIds: ['b'] })).toBe(true)
    expect(check([event], { selectedStoreIds: ['a'] })).toBe(false)
    expect(check([event], { organizationId: 'o2' })).toBe(true)
    expect(check([event], { organizationId: null })).toBe(false)
    for (const patch of [{ published: false }, { cancelled: true }, { category: 'private' as const }, { date: '2026-10-23' }]) expect(check([{ ...event, ...patch }])).toBe(true)
  })
})
const request: PerformanceRequest = { id: 'r', userId: 'u', scenarioId: 'proto-scn-public', organizationId: 'proto-org', storeIds: ['proto-store-a'], dates: ['2026-11-20'], timeSlots: ['afternoon'], period: { kind: 'anytime' }, weekdays: [], participants: 3, createdAt: '2026-10-24T12:00:00+09:00' }
describe('指定セルと候補順', () => {
  it('日付・店舗・枠・組織がすべて一致した希望だけを返す', () => {
    const list = [request]
    expect(requestsForSlot(list, '2026-11-20', 'proto-store-a', 'afternoon', 'proto-org')).toEqual(list)
    expect(requestsForSlot(list, '2026-11-21', 'proto-store-a', 'afternoon', 'proto-org')).toEqual([])
    expect(requestsForSlot(list, '2026-11-20', 'proto-store-b', 'afternoon', 'proto-org')).toEqual([])
    expect(requestsForSlot(list, '2026-11-20', 'proto-store-a', 'morning', 'proto-org')).toEqual([])
    expect(requestsForSlot(list, '2026-11-20', 'proto-store-a', 'afternoon', 'other-org')).toEqual([])
  })
  it('未指定を全セルへ広げず、元データや予約人数を変更しない', () => {
    for (const patch of [{ dates: [] }, { timeSlots: [] }, { timeSlots: undefined }]) expect(requestsForSlot([{ ...request, ...patch }], '2026-11-20', 'proto-store-a', 'afternoon', 'proto-org')).toEqual([])
    expect(request.participants).toBe(3)
  })
  it('希望タイトルを一度だけ先頭へ置き、その他と希望なしの元順序を維持する', () => {
    const options = ['c', 'proto-store-a', 'proto-store-b', 'proto-store-a'].map((value) => ({ value }))
    expect(prioritizeRequestedOptions(options, new Set(['proto-store-a'])).map((x) => x.value)).toEqual(['proto-store-a', 'c', 'proto-store-b'])
    expect(prioritizeRequestedOptions(options, new Set())).toEqual(options)
    expect(options.map((x) => x.value)).toEqual(['c', 'proto-store-a', 'proto-store-b', 'proto-store-a'])
  })
})

it('店舗指定なしの1件は同組織の上演可能店舗だけに表示し、件数・人数は倍増しない', () => {
  const r = { ...request, storeIds: [] }
  expect(requestsForSlot([r], '2026-11-20', 'proto-store-a', 'afternoon')).toEqual([r])
  expect(requestsForSlot([r], '2026-11-20', 'proto-store-b', 'afternoon')).toEqual([r])
  expect(requestsForSlot([r], '2026-11-20', 'proto-store-c', 'afternoon')).toEqual([])
  expect(requestsForSlot([r], '2026-11-20', 'proto-store-other', 'afternoon')).toEqual([])
  expect(requestsForSlot([r], '2026-11-20', 'proto-store-a', 'afternoon', 'proto-other-org')).toEqual([])
  const groups = groupRequestsForPanel([r], '2026-11', [])
  expect(groups[0].requestCount).toBe(1)
  expect(groups[0].desiredParticipants).toBe(3)
})
it('店舗指定なしの作成下書きは選択店舗を優先し、許可店舗外へ戻らない', () => {
  const group = groupRequestsForPanel([{ ...request, storeIds: [] }], '2026-11', [])[0]
  const own = PROTO_STORES.filter((s) => ['proto-store-a', 'proto-store-b'].includes(s.id))
  expect(buildPerformanceDraft(group, PROTO_SCENARIOS[0], own, '2026-11', ['proto-store-b']).venue).toBe('proto-store-b')
  const other = PROTO_STORES.filter((s) => s.id === 'proto-store-other')
  expect(buildPerformanceDraft({ ...group, storeIds: ['proto-store-a'] }, PROTO_SCENARIOS[0], other, '2026-11', ['proto-store-a']).venue).toBe('proto-store-other')
})
