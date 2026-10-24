import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ getPublic: vi.fn(), pauses: vi.fn(), deadline: vi.fn(), horizon: vi.fn() }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getPublic: api.getPublic } }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({ publicBookingReadApi: { listPrivatePauses: api.pauses } }))
vi.mock('@/lib/api/scheduleHookReadApi', () => ({ privateBookingSlotReadApi: { getEffectiveDeadlineDays: api.deadline, getEffectiveHorizonDays: api.horizon } }))
import {
  fetchPrivateBookingData, fetchPrivateBookingDays, orgPrivateBookingPath, orgScenarioPrivateStatus, platformPrivateBookingPath,
  type PrivateBookingData, type PrivateBookingDays,
} from './privateBookingStatus'

// 架空の組織 A（店舗 a1・a2）と B（店舗 b1）。今日 = 2026-10-24、締切 1 日・受付範囲 30 日 → 受付対象期間 10/25〜11/23
const TODAY = '2026-10-24'
const row = (over: Record<string, unknown> = {}) => ({
  accepts_private_booking: true, scenario_kind: 'regular', booking_start_date: null, booking_end_date: null, available_stores: [], ...over,
})
const STORES = [
  { id: 'a1', organization_id: 'org-a', status: 'active', is_temporary: false },
  { id: 'a2', organization_id: 'org-a', status: 'active', is_temporary: false },
  { id: 'b1', organization_id: 'org-b', status: 'active', is_temporary: false },
]
const A = STORES.filter((s) => s.organization_id === 'org-a')
const NO_PERIOD = { available_from: null, available_until: null }
const pause = (store_id: string, starts_on: string | null, ends_on: string | null, organization_id = store_id.startsWith('a') ? 'org-a' : 'org-b') =>
  ({ store_id, organization_id, pause_type: 'private' as const, starts_on, ends_on })
const data = (rowsA: Record<string, ReturnType<typeof row>>, rowsB: Record<string, ReturnType<typeof row>> = {}, pauses: ReturnType<typeof pause>[] | null = []): PrivateBookingData => ({
  rows: new Map([['org-a', new Map(Object.entries(rowsA))], ['org-b', new Map(Object.entries(rowsB))]]),
  pauses,
})
const days = (...keys: string[]): PrivateBookingDays => new Map(keys.map((k) => [k, { deadlineDays: 1, horizonDays: 30 }]))
const DAYS = days('org-a:m', 'org-a:m1', 'org-b:m1')

beforeEach(() => { vi.clearAllMocks() })

describe('材料の読み込み', () => {
  it('組織ごとに公開 API を読む。失敗した組織・判定に要る列が欠けた行は入れない', async () => {
    api.getPublic.mockImplementation(async (orgId: string) => {
      if (orgId === 'org-b') throw new Error('network')
      return [
        { id: 'ok', ...row() },
        { id: 'no-kind', accepts_private_booking: true, booking_start_date: null, booking_end_date: null, available_stores: [] },
        { id: 'no-period', accepts_private_booking: true, scenario_kind: 'regular', available_stores: [] },
        { id: 'no-stores', accepts_private_booking: true, scenario_kind: 'regular', booking_start_date: null, booking_end_date: null },
        { id: 'undef-end', ...row(), booking_end_date: undefined },
      ]
    })
    api.pauses.mockResolvedValue({ data: [], error: null })
    const d = await fetchPrivateBookingData(['org-a', 'org-b', 'org-a'], ['a1'])
    expect(api.getPublic).toHaveBeenCalledTimes(2)
    expect(api.pauses).toHaveBeenCalledWith(['a1'])
    expect(d.rows.has('org-b')).toBe(false)
    expect([...d.rows.get('org-a')!.keys()]).toEqual(['ok'])
    const all = days('org-a:ok', 'org-a:no-kind', 'org-a:no-period', 'org-a:no-stores', 'org-a:undef-end', 'org-b:ok')
    for (const id of ['no-kind', 'no-period', 'no-stores', 'undef-end']) expect(orgScenarioPrivateStatus(d, all, 'org-a', id, NO_PERIOD, A, TODAY), id).toBe('unknown')
    expect(orgScenarioPrivateStatus(d, all, 'org-b', 'ok', NO_PERIOD, STORES, TODAY)).toBe('unknown')
    expect(orgScenarioPrivateStatus(d, all, 'org-a', 'ok', NO_PERIOD, A, TODAY)).toBe('accepting')
  })

  it('募集停止期間を読めなければ unknown', async () => {
    api.getPublic.mockResolvedValue([{ id: 'ok', ...row() }])
    api.pauses.mockResolvedValue({ data: null, error: new Error('denied') })
    const d = await fetchPrivateBookingData(['org-a'], ['a1', 'a2'])
    expect(d.pauses).toBeNull()
    expect(orgScenarioPrivateStatus(d, days('org-a:ok'), 'org-a', 'ok', NO_PERIOD, A, TODAY)).toBe('unknown')
  })

  it('締切・受付範囲は作品ごとの RPC（保存の判定と同じ値）。読めない・範囲外の値なら入れない', async () => {
    api.deadline.mockImplementation(async ({ scenarioId }: { scenarioId: string }) => (scenarioId === 'bad' ? { data: null, error: new Error('x') } : { data: 14, error: null }))
    api.horizon.mockImplementation(async ({ scenarioId }: { scenarioId: string }) => ({ data: scenarioId === 'odd' ? 999 : 90, error: null }))
    const d = await fetchPrivateBookingDays([{ organizationId: 'org-a', scenarioId: 'ok' }, { organizationId: 'org-a', scenarioId: 'bad' }, { organizationId: 'org-a', scenarioId: 'odd' }])
    expect(api.deadline).toHaveBeenCalledWith({ scenarioId: 'ok', organizationId: 'org-a', organizationSlug: null })
    expect(api.horizon).toHaveBeenCalledWith({ organizationId: 'org-a', scenarioId: 'ok' })
    expect([...d.entries()]).toEqual([['org-a:ok', { deadlineDays: 14, horizonDays: 90 }]])
  })
})

describe('組織トップ（その組織の行と店舗だけで決める）', () => {
  const org = { id: 'org-a', slug: 'aaa' }
  const path = (d: PrivateBookingData, period: { available_from?: string | null; available_until?: string | null } = NO_PERIOD, dd: PrivateBookingDays | undefined = DAYS) =>
    orgPrivateBookingPath(d, dd, org, { id: 'm', slug: 'm-slug', ...period }, A, TODAY)

  it('受付可（公演予定の有無は見ない）なら日程相談（貸切リクエストのタブ）へのパス', () => {
    expect(path(data({ m: row() }))).toBe('/aaa/scenario/m-slug?tab=private')
  })
  it('貸切受付 OFF・出張限定は出さない', () => {
    expect(path(data({ m: row({ accepts_private_booking: false }) }))).toBeNull()
    expect(path(data({ m: row({ scenario_kind: 'offsite_only' }) }))).toBeNull()
  })
  it('受付期間（貸切募集期間）の外・公演期間の終了は出さない', () => {
    expect(path(data({ m: row({ booking_end_date: '2026-10-23' }) }))).toBeNull()
    expect(path(data({ m: row({ booking_start_date: '2026-10-25' }) }))).toBeNull()
    expect(path(data({ m: row() }), { available_from: null, available_until: '2026-10-23' })).toBeNull()
  })
  it('受付範囲の N 日以内に申し込める日が無い（公演期間が受付対象期間の外）なら出さない', () => {
    expect(path(data({ m: row() }), { available_from: '2026-11-24', available_until: null })).toBeNull()
    expect(path(data({ m: row() }), { available_from: '2026-11-23', available_until: null })).toBe('/aaa/scenario/m-slug?tab=private')
  })
  it('非公開（公開の一覧に無い）・公演期間・日数が読めないときは出さない', () => {
    expect(orgPrivateBookingPath(data({ m: row() }), DAYS, org, { id: 'other', ...NO_PERIOD }, A, TODAY)).toBeNull()
    expect(path(data({ m: row() }), { available_until: null })).toBeNull()
    expect(orgPrivateBookingPath(data({ m: row() }), undefined, org, { id: 'm', ...NO_PERIOD }, A, TODAY)).toBeNull()
    expect(path(data({ m: row() }), NO_PERIOD, new Map())).toBeNull()
  })
  it('今日だけ全店舗停止で明日以降は可 → 受付中', () => {
    expect(path(data({ m: row() }, {}, [pause('a1', TODAY, TODAY), pause('a2', TODAY, TODAY)]))).toBe('/aaa/scenario/m-slug?tab=private')
  })
  it('明日から無期限で全店舗停止（今日の公演日は締切後）→ 出さない', () => {
    expect(path(data({ m: row() }, {}, [pause('a1', '2026-10-25', null), pause('a2', '2026-10-25', null)]))).toBeNull()
  })
  it('受付対象期間の一部だけ全店舗停止 → 受付中。一部の店舗だけ期間すべて停止 → 他の店舗で受付中', () => {
    expect(path(data({ m: row() }, {}, [pause('a1', '2026-11-01', '2026-11-05'), pause('a2', '2026-11-01', '2026-11-05')]))).toBe('/aaa/scenario/m-slug?tab=private')
    expect(path(data({ m: row() }, {}, [pause('a1', null, null)]))).toBe('/aaa/scenario/m-slug?tab=private')
  })
  it('境界: 停止がちょうど受付対象期間（10/25〜11/23）なら出さない。最終日の 1 日が残れば受付中', () => {
    expect(path(data({ m: row() }, {}, [pause('a1', '2026-10-25', '2026-11-23'), pause('a2', '2026-10-25', '2026-11-23')]))).toBeNull()
    expect(path(data({ m: row() }, {}, [pause('a1', '2026-10-25', '2026-11-22'), pause('a2', '2026-10-25', '2026-11-23')]))).toBe('/aaa/scenario/m-slug?tab=private')
  })
  it('作品の公演可能店舗が停止中の店舗だけなら、ほかの店舗が空いていても出さない', () => {
    expect(path(data({ m: row({ available_stores: ['a1'] }) }, {}, [pause('a1', null, null)]))).toBeNull()
  })
  it('ほかの組織の停止行（organization_id が違う）は見ない（DB と同じ）', () => {
    expect(path(data({ m: row() }, {}, [pause('a1', null, null, 'org-x'), pause('a2', null, null, 'org-x')]))).toBe('/aaa/scenario/m-slug?tab=private')
  })
  it('上演できる店舗が無い・店舗を読めていない間は出さない', () => {
    expect(orgPrivateBookingPath(data({ m: row() }), DAYS, org, { id: 'm', ...NO_PERIOD }, [{ id: 't1', organization_id: 'org-a', status: 'active', is_temporary: true }], TODAY)).toBeNull()
    expect(orgPrivateBookingPath(data({ m: row() }), DAYS, org, { id: 'm', ...NO_PERIOD }, null, TODAY)).toBeNull()
  })
})

describe('全体トップ（公開している組織ごとに決め、組織をまたいで店舗・停止を混ぜない）', () => {
  const slugs = new Map([['org-a', 'aaa'], ['org-b', 'bbb']])
  const both = [{ organization_id: 'org-a', ...NO_PERIOD }, { organization_id: 'org-b', ...NO_PERIOD }]
  const s1 = { id: 'm1', slug: 's1', organizations: both }

  it('A は貸切受付 OFF・B は受付中なら B の貸切リクエストへ', () => {
    expect(platformPrivateBookingPath(data({ m1: row({ accepts_private_booking: false }) }, { m1: row() }), DAYS, s1, slugs, STORES, TODAY)).toBe('/bbb/scenario/s1?tab=private')
  })
  it('A の店舗は受付対象期間すべて停止・B は受付中なら B へ（A では出さない＝組織トップ A とは結果が分かれる）', () => {
    const d = data({ m1: row() }, { m1: row() }, [pause('a1', null, null), pause('a2', null, null)])
    expect(platformPrivateBookingPath(d, DAYS, s1, slugs, STORES, TODAY)).toBe('/bbb/scenario/s1?tab=private')
    expect(orgPrivateBookingPath(d, DAYS, { id: 'org-a', slug: 'aaa' }, { id: 'm1', slug: 's1', ...NO_PERIOD }, A, TODAY)).toBeNull()
  })
  it('B の店舗が停止中なら、A の店舗が空いていても B では受付中にしない', () => {
    expect(platformPrivateBookingPath(data({}, { m1: row() }, [pause('b1', null, null)]), DAYS, { ...s1, organizations: [both[1]] }, slugs, STORES, TODAY)).toBeNull()
  })
  it('両方で受付中なら作品の共通ページ（組織ごとの貸切リクエストが並ぶ）へ', () => {
    expect(platformPrivateBookingPath(data({ m1: row() }, { m1: row() }), DAYS, s1, slugs, STORES, TODAY)).toBe('/scenario/s1')
  })
  it('どこも受付していない・判定できないなら出さない', () => {
    expect(platformPrivateBookingPath(data({ m1: row({ booking_end_date: '2026-10-01' }) }), DAYS, s1, slugs, STORES, TODAY)).toBeNull()
    expect(platformPrivateBookingPath(undefined, DAYS, s1, slugs, STORES, TODAY)).toBeNull()
    expect(platformPrivateBookingPath(data({ m1: row() }, { m1: row() }, null), DAYS, s1, slugs, STORES, TODAY)).toBeNull()
    expect(platformPrivateBookingPath(data({ m1: row() }, { m1: row() }), undefined, s1, slugs, STORES, TODAY)).toBeNull()
  })
  it('その作品を公開していない組織の受付は数えない', () => {
    expect(platformPrivateBookingPath(data({}, { m1: row() }), DAYS, { ...s1, organizations: [both[0]] }, slugs, STORES, TODAY)).toBeNull()
  })
})
