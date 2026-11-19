// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ period: vi.fn(), pauses: vi.fn(), deadline: vi.fn(), horizon: vi.fn() }))
vi.mock('@/lib/api/scenarioPageReadApi', () => ({ scenarioPageReadApi: { findScenarioPerformancePeriod: api.period } }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({ publicBookingReadApi: { listPrivatePauses: api.pauses } }))
vi.mock('@/lib/api/scheduleHookReadApi', () => ({ privateBookingSlotReadApi: { getEffectiveDeadlineDays: api.deadline, getEffectiveHorizonDays: api.horizon } }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getPublic: vi.fn() } }))
import { useScenarioPrivateBookingStatus } from './useScenarioPrivateBookingStatus'
import { PrivateBookingStatusNote } from '../components/PrivateBookingStatusNote'

// 架空の組織 A（店舗 s1・s2）。今日 = 2026-10-24、締切 1 日・範囲 30 日 → 受付対象期間 10/25〜11/23
const scenario = (over: Record<string, unknown> = {}) => ({
  scenario_master_id: 'm1', accepts_private_booking: true, scenario_kind: 'regular', booking_start_date: null, booking_end_date: null,
  available_stores: [], private_booking_fields_complete: true, ...over,
})
const STORES = [{ id: 's1', status: 'active', is_temporary: false }, { id: 's2', status: 'active', is_temporary: false }]
const pause = (store_id: string, starts_on: string | null, ends_on: string | null) => ({ store_id, organization_id: 'org-a', pause_type: 'private', starts_on, ends_on })

let root: Root
let host: HTMLDivElement
const onOpen = vi.fn()
function Probe({ s, stores = STORES, orgId = 'org-a' }: { s: ReturnType<typeof scenario> | null; stores?: typeof STORES | null; orgId?: string }) {
  const status = useScenarioPrivateBookingStatus(orgId, s, stores)
  return <><output data-testid="status">{status}</output><PrivateBookingStatusNote status={status} hasEvents={false} onOpenPrivate={onOpen} /></>
}
async function statusOf(s: ReturnType<typeof scenario> | null, stores?: typeof STORES | null, orgId?: string) {
  await act(async () => root.render(<Probe s={s} stores={stores} orgId={orgId} />))
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  return host.querySelector('[data-testid="status"]')?.textContent
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00+09:00'))
  api.period.mockResolvedValue({ data: { available_from: null, available_until: null }, error: null })
  api.pauses.mockResolvedValue({ data: [], error: null })
  api.deadline.mockResolvedValue({ data: 1, error: null })
  api.horizon.mockResolvedValue({ data: 30, error: null })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.useRealTimers() })

describe('作品ページの貸切受付中（表示中の組織で判定）', () => {
  it('受付可なら「貸切受付中」と、空きの保証でない旨と、日程相談（貸切リクエストのタブ）へのボタン', async () => {
    expect(await statusOf(scenario())).toBe('accepting')
    expect(api.period).toHaveBeenCalledWith('org-a', 'm1')
    expect(api.deadline).toHaveBeenCalledWith({ scenarioId: 'm1', organizationId: 'org-a', organizationSlug: null })
    const note = host.querySelector('[data-testid="private-booking-status"]')
    expect(note?.textContent).toContain('貸切受付中')
    expect(note?.textContent).toContain('公演予定はありませんが')
    expect(note?.textContent).toContain('日程はご相談のうえ決まります')
    await act(async () => (note?.querySelector('button') as HTMLButtonElement).click())
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
  it('貸切受付 OFF・出張限定は何も出さない', async () => {
    expect(await statusOf(scenario({ accepts_private_booking: false }))).toBe('not_accepting')
    expect(host.querySelector('[data-testid="private-booking-status"]')).toBeNull()
    expect(await statusOf(scenario({ scenario_kind: 'offsite_only' }))).toBe('not_accepting')
  })
  it('受付期間（貸切募集期間）外・公演期間の終了は「現在貸切を募集していません」', async () => {
    expect(await statusOf(scenario({ booking_end_date: '2026-10-23' }))).toBe('closed')
    expect(host.textContent).toContain('この作品は現在貸切を募集していません')
    api.period.mockResolvedValue({ data: { available_from: null, available_until: '2026-10-20' }, error: null })
    expect(await statusOf(scenario({ scenario_master_id: 'm2' }))).toBe('closed')
  })
  it('受付対象期間すべて全店舗停止なら出さない。今日だけの停止・一部の店舗だけの停止なら受付中', async () => {
    api.pauses.mockResolvedValue({ data: [pause('s1', '2026-10-25', null), pause('s2', '2026-10-25', null)], error: null })
    expect(await statusOf(scenario())).toBe('paused')
    expect(host.querySelector('[data-testid="private-booking-status"]')).toBeNull()
    api.pauses.mockResolvedValue({ data: [pause('s1', '2026-10-24', '2026-10-24'), pause('s2', '2026-10-24', '2026-10-24')], error: null })
    expect(await statusOf(scenario({ scenario_master_id: 'm3' }))).toBe('accepting')
    api.pauses.mockResolvedValue({ data: [pause('s1', null, null)], error: null })
    expect(await statusOf(scenario({ scenario_master_id: 'm4' }))).toBe('accepting')
  })
  it('組織差: 同じ停止行でも表示中の組織と違う組織の停止は見ない', async () => {
    api.pauses.mockResolvedValue({ data: [pause('s1', null, null), pause('s2', null, null)], error: null })
    expect(await statusOf(scenario(), STORES, 'org-a')).toBe('paused')
    expect(await statusOf(scenario(), STORES, 'org-b')).toBe('accepting')
  })
  it('受付範囲の N 日以内に申し込める日が無い（公演期間が受付対象期間より後）なら出さない', async () => {
    api.period.mockResolvedValue({ data: { available_from: '2026-11-24', available_until: null }, error: null })
    expect(await statusOf(scenario())).toBe('no_dates')
    expect(host.querySelector('[data-testid="private-booking-status"]')).toBeNull()
  })
  it('列の欠落・読めない値（公演期間・停止・日数・店舗）は unknown で何も出さない', async () => {
    expect(await statusOf(scenario({ private_booking_fields_complete: false }))).toBe('unknown')
    expect(await statusOf(scenario(), null)).toBe('unknown')
    api.pauses.mockResolvedValue({ data: null, error: new Error('x') })
    expect(await statusOf(scenario({ scenario_master_id: 'm5' }))).toBe('unknown')
    api.pauses.mockResolvedValue({ data: [], error: null })
    api.horizon.mockResolvedValue({ data: null, error: new Error('x') })
    expect(await statusOf(scenario({ scenario_master_id: 'm6' }))).toBe('unknown')
    expect(host.querySelector('[data-testid="private-booking-status"]')).toBeNull()
  })
})
