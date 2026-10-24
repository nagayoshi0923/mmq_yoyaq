import { describe, expect, it } from 'vitest'
import { prototypesDefine, shouldEnablePrototypes } from '../prototypeFlag'
import { PROTO_EVENTS, PROTO_REQUESTS, PROTO_SCENARIOS, PROTO_STORES } from './fixtures'
import {
  REQUEST_NOT_RESERVATION_NOTICE, buildPerformanceDraft, eventsForSlot, groupRequestsForPanel,
  requestMatchesMonth, type PerformanceRequest,
} from './model'
import { resolvePrototypeView } from './routes'

describe('本番ビルドで試作のルートが無い', () => {
  it('Vercel の production では、明示の指定があっても無効', () => {
    expect(shouldEnablePrototypes({ mode: 'production', env: { VERCEL_ENV: 'production' } })).toBe(false)
    expect(shouldEnablePrototypes({ mode: 'production', env: { VERCEL_ENV: 'production', VITE_ENABLE_PROTOTYPES: 'true' } })).toBe(false)
  })
  it('production モードで指定が無いビルド（手元の npm run build など）も無効', () => {
    expect(shouldEnablePrototypes({ mode: 'production', env: {} })).toBe(false)
  })
  it('preview・開発・明示の指定のときだけ有効', () => {
    expect(shouldEnablePrototypes({ mode: 'production', env: { VERCEL_ENV: 'preview' } })).toBe(true)
    expect(shouldEnablePrototypes({ mode: 'development', env: {} })).toBe(true)
    expect(shouldEnablePrototypes({ mode: 'staging', env: { VITE_ENABLE_PROTOTYPES: 'true' } })).toBe(true)
  })
  it('vite.config の define は production で文字列 false を埋め込む（試作のコードは成果物から消える）', () => {
    expect(prototypesDefine({ mode: 'production', env: { VERCEL_ENV: 'production' } })).toEqual({ 'import.meta.env.VITE_PROTOTYPES_ENABLED': '"false"' })
    expect(prototypesDefine({ mode: 'production', env: { VERCEL_ENV: 'preview' } })).toEqual({ 'import.meta.env.VITE_PROTOTYPES_ENABLED': '"true"' })
  })
  it('無効のときはどの試作のパスも解決しない', () => {
    for (const p of ['/prototype/performance-request', '/prototype/performance-request/admin', '/prototype/performance-request/notifications', '/prototype/performance-request/event/x']) {
      expect(resolvePrototypeView(p, false)).toBeNull()
      expect(resolvePrototypeView(p, true)).not.toBeNull()
    }
    expect(resolvePrototypeView('/prototype/performance-request/unknown', true)).toBeNull()
    expect(resolvePrototypeView('/queens-waltz/scenario/x', true)).toBeNull()
  })
})

describe('開催リクエストの注意文', () => {
  it('指定の文言と一字一句同じ', () => {
    expect(REQUEST_NOT_RESERVATION_NOTICE).toBe('リクエストは予約ではありません。開催・お席の確保をお約束するものではなく、公演公開後に別途ご予約が必要です')
  })
})

describe('管理のパネル（月・店舗の絞り込み）', () => {
  it('日付の指定が無い・曜日だけ・いつでもの希望は消さずに「日程未指定」に残す', () => {
    const groups = groupRequestsForPanel(PROTO_REQUESTS, '2026-11', ['proto-store-a'])
    const kiri = groups.find((g) => g.scenarioId === 'proto-scn-1')!
    expect(kiri.requestCount).toBe(3)
    expect(kiri.unscheduled.map((r) => r.id).sort()).toEqual(['proto-req-1', 'proto-req-3'])
    expect(kiri.dated.map((r) => r.id)).toEqual(['proto-req-2'])
    expect(kiri.desiredParticipants).toBe(6)
  })
  it('「いつでも」の希望はどの月でも残る。月の合わない希望は出ない', () => {
    const dec = groupRequestsForPanel(PROTO_REQUESTS, '2027-01', [])
    expect(dec.flatMap((g) => [...g.dated, ...g.unscheduled]).map((r) => r.id)).toEqual(['proto-req-3'])
    expect(requestMatchesMonth(PROTO_REQUESTS[3], '2026-12')).toBe(false)
  })
  it('店舗で絞ると、その店舗を希望していないリクエストは出ない', () => {
    const groups = groupRequestsForPanel(PROTO_REQUESTS, '2026-12', ['proto-store-b'])
    expect(groups).toEqual([])
    const all = groupRequestsForPanel(PROTO_REQUESTS, '2026-12', [])
    expect(all.map((g) => g.scenarioId).sort()).toEqual(['proto-scn-1', 'proto-scn-3'])
  })
})

describe('予約人数・残席に加算しない', () => {
  it('リクエストがいくつあっても、表に出る公演と予約人数・定員は変わらない', () => {
    const before = JSON.stringify(PROTO_EVENTS)
    const many: PerformanceRequest[] = Array.from({ length: 20 }, (_, i) => ({
      ...PROTO_REQUESTS[0], id: `x${i}`, storeIds: ['proto-store-a'], participants: 6, dates: ['2026-11-07'],
    }))
    groupRequestsForPanel([...PROTO_REQUESTS, ...many], '2026-11', [])
    expect(JSON.stringify(PROTO_EVENTS)).toBe(before)
    const cell = eventsForSlot(PROTO_EVENTS, '2026-11-07', 'proto-store-a', 'afternoon')
    expect(cell).toHaveLength(1)
    expect(cell[0].current_participants).toBe(3)
    expect(cell[0].max_participants).toBe(5)
    // 希望しか無い日のセルは空のまま（希望を公演として混ぜない）
    expect(eventsForSlot(PROTO_EVENTS, '2026-11-21', 'proto-store-a', 'afternoon')).toEqual([])
  })
  it('公演の下書きは作品の定員を使い、参加希望人数を予約人数・定員に入れない', () => {
    const group = groupRequestsForPanel(PROTO_REQUESTS, '2026-11', ['proto-store-a']).find((g) => g.scenarioId === 'proto-scn-1')!
    const draft = buildPerformanceDraft(group, PROTO_SCENARIOS[0], PROTO_STORES, '2026-11', ['proto-store-a'])
    expect(draft.max_participants).toBe(PROTO_SCENARIOS[0].playerMax)
    expect(draft.capacity).toBe(0)
    expect(draft).not.toHaveProperty('current_participants')
    expect(draft.venue).toBe('proto-store-a')
    expect(draft.date).toBe('2026-11-21')
    expect(draft.scenario).toBe(PROTO_SCENARIOS[0].title)
    expect(draft.category).toBe('open')
  })
  it('日付の希望が無いときは、多い曜日の最初の日を仮に入れる', () => {
    const group = groupRequestsForPanel(PROTO_REQUESTS, '2026-11', ['proto-store-b']).find((g) => g.scenarioId === 'proto-scn-2')!
    const onlyWeekday = { ...group, requestedDates: [] }
    const draft = buildPerformanceDraft(onlyWeekday, PROTO_SCENARIOS[1], PROTO_STORES, '2026-11', [])
    expect(draft.date).toBe('2026-11-06') // 金曜の希望 → 11/6(金)
  })
})
