import { describe, expect, it } from 'vitest'
import { PROTO_ORGANIZATION, PROTO_SCENARIOS, PROTO_SIMULATED_PERFORMANCES, PROTO_STORES } from './fixtures'
import type { PerformanceRequest } from './model'
import {
  PERFORMANCE_ADDED_NOT_RESERVATION, dedupeKeyFor, loginUrlForNotification, planPerformanceNotifications,
  popupCandidates, type PerformanceSubscription, type PlanInput, type ProtoNotification,
} from './notify'

const USER = 'u1'
const request: PerformanceRequest = {
  id: 'r1', userId: USER, scenarioId: 'proto-scn-1', storeIds: ['proto-store-a', 'proto-store-b'], participants: 2,
  period: { kind: 'months', months: ['2026-11'] }, weekdays: [6], dates: [], createdAt: '2026-10-24T00:00:00Z',
}
const bell: PerformanceSubscription = {
  id: 's1', userId: USER, scenarioId: 'proto-scn-1', organizationId: PROTO_ORGANIZATION.id, storeIds: [], createdAt: '2026-10-24T00:00:00Z',
}

function plan(overrides: Partial<PlanInput>): ProtoNotification[] {
  return planPerformanceNotifications({
    performance: PROTO_SIMULATED_PERFORMANCES.matching,
    organizationId: PROTO_ORGANIZATION.id,
    requests: [], subscriptions: [], existing: [],
    scenarios: PROTO_SCENARIOS, stores: PROTO_STORES, now: '2026-10-24T10:00:00Z',
    ...overrides,
  })
}

describe('通知を出す条件', () => {
  it('下書き（非公開・受付前）では出さない', () => {
    expect(plan({ performance: PROTO_SIMULATED_PERFORMANCES.draft, requests: [request], subscriptions: [bell] })).toEqual([])
  })
  it('公開済みでも予約受付をしていない・中止・貸切の公演では出さない', () => {
    const m = PROTO_SIMULATED_PERFORMANCES.matching
    expect(plan({ performance: { ...m, isReservationEnabled: false }, subscriptions: [bell] })).toEqual([])
    expect(plan({ performance: { ...m, isCancelled: true }, subscriptions: [bell] })).toEqual([])
    expect(plan({ performance: { ...m, category: 'private' }, subscriptions: [bell] })).toEqual([])
  })
  it('ベルもリクエストも無い作品では出さない', () => {
    expect(plan({ performance: PROTO_SIMULATED_PERFORMANCES.otherWork, requests: [request], subscriptions: [bell] })).toEqual([])
  })
  it('ベルの店舗の絞り込みの外の店舗では出さない', () => {
    expect(plan({ subscriptions: [{ ...bell, storeIds: ['proto-store-c'] }] })).toEqual([])
  })
  it('別の組織のベルでは出さない', () => {
    expect(plan({ subscriptions: [{ ...bell, organizationId: 'other-org' }] })).toEqual([])
  })
})

describe('重複させない（dedupe の鍵 = 利用者 × 公演）', () => {
  it('リクエストとベルの両方に登録していても 1 通', () => {
    const created = plan({ requests: [request], subscriptions: [bell] })
    expect(created).toHaveLength(1)
    expect(created[0].dedupeKey).toBe(dedupeKeyFor(USER, PROTO_SIMULATED_PERFORMANCES.matching.id))
    expect(created[0].sources).toEqual(['bell', 'request'])
  })
  it('同じ人が同じ作品に 2 件リクエストしていても 1 通', () => {
    expect(plan({ requests: [request, { ...request, id: 'r2' }] })).toHaveLength(1)
  })
  it('公演の更新・再公開では 2 通目を作らない', () => {
    const first = plan({ requests: [request], subscriptions: [bell] })
    const again = plan({ requests: [request], subscriptions: [bell], existing: first, performance: { ...PROTO_SIMULATED_PERFORMANCES.matching, startTime: '14:00' } })
    expect(again).toEqual([])
  })
})

describe('言い方を分ける', () => {
  it('希望の条件に合うときだけ「ご希望に近い公演」（それでも「確定」とは言わない）', () => {
    const [n] = plan({ requests: [request] })
    expect(n.variant).toBe('near_request')
    expect(n.title).toBe('ご希望に近い公演が公開されました')
    expect(`${n.title}${n.message.replace(PERFORMANCE_ADDED_NOT_RESERVATION, '')}`).not.toMatch(/確定/)
  })
  it('条件と違う日程（水曜）は「新しい公演が追加されました」。「確定」とは言わない', () => {
    const [n] = plan({ performance: PROTO_SIMULATED_PERFORMANCES.notMatching, requests: [request] })
    expect(n.variant).toBe('new_performance')
    expect(n.title).toBe('新しい公演が追加されました')
    expect(`${n.title}${n.message.replace(PERFORMANCE_ADDED_NOT_RESERVATION, '')}`).not.toMatch(/確定/)
    expect(n.message).not.toMatch(/ご希望/)
  })
  it('ベルだけの人も「新しい公演が追加されました」', () => {
    const [n] = plan({ subscriptions: [bell] })
    expect(n.variant).toBe('new_performance')
  })
  it('どの通知にも、予約の確定・席の確保ではなく別途予約が必要と書く', () => {
    for (const n of [...plan({ requests: [request] }), ...plan({ subscriptions: [bell], performance: PROTO_SIMULATED_PERFORMANCES.notMatching })]) {
      expect(n.message).toContain(PERFORMANCE_ADDED_NOT_RESERVATION)
    }
  })
})

describe('通知からその公演へ', () => {
  it('行き先は同じサイトの相対パス。ログインが要るときは戻り先付きのログイン URL', () => {
    const [n] = plan({ subscriptions: [bell] })
    expect(n.link).toBe('/prototype/performance-request/event/proto-new-1')
    expect(loginUrlForNotification(n.link)).toBe(`/login?redirect=${encodeURIComponent(n.link)}`)
  })
  it('外の URL やプロトコル相対の URL は戻り先にしない', () => {
    expect(loginUrlForNotification('https://evil.example/x')).toBe('/login')
    expect(loginUrlForNotification('//evil.example/x')).toBe('/login')
  })
})

describe('ポップアップの候補', () => {
  it('閉じたもの・表示済み・既読は出さない（一覧には残る）', () => {
    const [n] = plan({ subscriptions: [bell] })
    expect(popupCandidates([n], USER)).toHaveLength(1)
    expect(popupCandidates([{ ...n, popupDismissedAt: 'x' }], USER)).toHaveLength(0)
    expect(popupCandidates([{ ...n, popupShownAt: 'x' }], USER)).toHaveLength(0)
    expect(popupCandidates([{ ...n, readAt: 'x' }], USER)).toHaveLength(0)
    expect(popupCandidates([n], 'someone-else')).toHaveLength(0)
  })
})
