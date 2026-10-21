// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const HORIZON = vi.hoisted(() => ({ days: 180 }))
vi.mock('@/lib/privateBookingHorizon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/privateBookingHorizon')>()),
  usePrivateBookingHorizonDays: () => ({ days: HORIZON.days, loading: false }),
}))

const mocks = vi.hoisted(() => ({ scenario: vi.fn(), stores: vi.fn(), rpc: vi.fn(), from: vi.fn(), holiday: () => false }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 'org', slug: 'test' } }) }))
vi.mock('@/hooks/useCustomHolidays', () => ({ useCustomHolidays: () => ({ isCustomHoliday: mocks.holiday, isLoading: false }) }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getById: mocks.scenario }, storeApi: { getAllPublic: mocks.stores, getAllPublicForCustomer: mocks.stores } }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/organization', () => ({ resolveOrganizationFromPathSegment: vi.fn() }))
vi.mock('./PrivateBookingRequest/index', () => ({ PrivateBookingRequest: (props: any) => <output>{JSON.stringify(props.selectedTimeSlots)}</output> }))
import { PrivateBookingRequestPage } from './PrivateBookingRequestPage'
let root: Root, host: HTMLDivElement
const scenarioId = '20000000-0000-0000-0000-000000000001'
const storeId = '30000000-0000-0000-0000-000000000001'
async function render() { await act(async () => root.render(<PrivateBookingRequestPage organizationSlug="test" />)) }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks()
  window.history.replaceState({}, '', `/test/private-booking-request?scenario=${scenarioId}&store=${storeId}&date=2026-10-19&slot=evening&time=19:30`)
  mocks.scenario.mockResolvedValue({ id: scenarioId, organization_id: 'org', title: 'Fixture', duration: 180, accepts_private_booking: true })
  mocks.stores.mockResolvedValue([{ id: storeId, organization_id: 'org', status: 'active', ownership_type: 'owned' }])
  mocks.rpc.mockResolvedValue({ data: [], error: null })
  mocks.from.mockImplementation(() => {
    const query: any = { select: () => query, in: () => query, eq: () => query, then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) }
    return query
  })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
it('非同期読込後、計算結果が空でもカレンダーの日時を候補へ渡す', async () => {
  let resolve!: (value: unknown) => void
  mocks.stores.mockReturnValue(new Promise(done => { resolve = done }))
  await render(); expect(host.querySelector('output')).toBeNull()
  await act(async () => resolve([{ id: storeId, status: 'active' }]))
  expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual([{ date: '2026-10-19', slot: { label: '夜', startTime: '19:30', endTime: '' } }])
})
it('DB の空き判定で選べる枠はその時刻で候補を渡す', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ date: '2026-10-19', time_slot: 'evening', available: true, reason: null, start_time: '18:30', end_time: '21:30' }], error: null })
  await render()
  expect(JSON.parse(host.querySelector('output')!.textContent!)[0].slot.startTime).toBe('18:30')
})
it('貸切受付停止作品はフォームを開かない', async () => {
  mocks.scenario.mockResolvedValue({ id: scenarioId, accepts_private_booking: false })
  await render()
  expect(host.querySelector('output')).toBeNull()
  expect(host.textContent).toContain('現在貸切リクエストを受け付けていません')
})
it('カレンダーから渡った日付が申し込める範囲（今日から 180 日先）より先なら、理由を出して申込フォームへ進めない', async () => {
  window.history.replaceState({}, '', `/test/private-booking-request?scenario=${scenarioId}&store=${storeId}&date=2099-01-05&slot=evening&time=19:00`)
  await render()
  expect(host.querySelector('output')).toBeNull()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('申し込めるのは今日から 180 日先までです')
})
it('設定が 90 日なら、91 日先の日付は進めず 90 日先は進める', async () => {
  const { privateBookingHorizonMaxYmd, addYmdDays } = await import('@/lib/privateBookingHorizon')
  HORIZON.days = 90
  try {
    const day90 = privateBookingHorizonMaxYmd(90)
    window.history.replaceState({}, '', `/test/private-booking-request?scenario=${scenarioId}&store=${storeId}&date=${addYmdDays(day90, 1)}&slot=evening&time=19:00`)
    await render()
    expect(host.querySelector('output')).toBeNull()
    expect(host.textContent).toContain('申し込めるのは今日から 90 日先までです')
    await act(async () => root.unmount()); root = createRoot(host)
    window.history.replaceState({}, '', `/test/private-booking-request?scenario=${scenarioId}&store=${storeId}&date=${day90}&slot=evening&time=19:00`)
    await render()
    expect(host.querySelector('output')).not.toBeNull()
  } finally { HORIZON.days = 180 }
})
