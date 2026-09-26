// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ scenario: vi.fn(), stores: vi.fn(), compute: vi.fn(), from: vi.fn(), holiday: () => false }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 'org', slug: 'test' } }) }))
vi.mock('@/hooks/useCustomHolidays', () => ({ useCustomHolidays: () => ({ isCustomHoliday: mocks.holiday, isLoading: false }) }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getById: mocks.scenario }, storeApi: { getAllPublic: mocks.stores } }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('@/lib/computePrivateBookingSlots', () => ({ computePrivateBookingSlots: mocks.compute }))
vi.mock('@/lib/privateGroupStatus', () => ({ updatePrivateGroupStatus: vi.fn() }))
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
  mocks.compute.mockReturnValue([])
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
  expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual([{ date: '2026-10-19', slot: { label: '夜', startTime: '19:30', endTime: '19:30' } }])
})
it('計算可能な枠は営業時間に合わせた候補を渡す', async () => {
  mocks.compute.mockReturnValue([{ key: 'evening', label: '夜', startTime: '18:30', endTime: '21:30' }])
  await render()
  expect(JSON.parse(host.querySelector('output')!.textContent!)[0].slot.startTime).toBe('18:30')
})
it('貸切受付停止作品はフォームを開かない', async () => {
  mocks.scenario.mockResolvedValue({ id: scenarioId, accepts_private_booking: false })
  await render()
  expect(host.querySelector('output')).toBeNull()
  expect(host.textContent).toContain('現在貸切リクエストを受け付けていません')
})
