// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ days: 90, rpc: vi.fn(), from: vi.fn(), submit: vi.fn(), create: vi.fn(), blocked: vi.fn(), holiday: () => false }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user', email: 'fixture@example.invalid' } }) }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/NavigationBar', () => ({ NavigationBar: () => null }))
vi.mock('../ScenarioDetailPage/components/BookingNotice', () => ({ BookingNotice: () => null }))
vi.mock('@/hooks/useCustomHolidays', () => ({ useCustomHolidays: () => ({ isCustomHoliday: mocks.holiday }) }))
vi.mock('@/hooks/usePrivateBookingDeadlineDays', () => ({ usePrivateBookingDeadlineDays: () => mocks.days }))
vi.mock('@/hooks/usePrivateGroup', () => ({ usePrivateGroup: () => ({ createGroup: mocks.create, loading: false }) }))
vi.mock('./hooks/usePrivateBookingSubmit', () => ({ usePrivateBookingSubmit: () => ({ handleSubmit: mocks.submit, isSubmitting: false, success: false }) }))
vi.mock('../BookingConfirmation/hooks/useCustomerData', () => ({ useCustomerData: () => ({ customerName: 'Fixture', customerEmail: 'fixture@example.invalid', customerPhone: '00000000000', customerNickname: '', setCustomerName: vi.fn(), setCustomerEmail: vi.fn(), setCustomerPhone: vi.fn(), setCustomerNickname: vi.fn() }) }))
vi.mock('@/lib/organization', () => ({ resolveOrgIdFromPageContext: async () => 'org' }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }))
import { PrivateBookingRequest } from './index'
let root: Root, host: HTMLDivElement, client: QueryClient
const date = new Date(Date.now() + 30 * 86400000).toISOString().slice(0,10)
const props = { scenarioId: 'scenario', scenarioTitle: 'Fixture', scenarioDuration: 180, participationFee: 4000, maxParticipants: 6, selectedTimeSlots: [{ date, slot: { label: '夜', startTime: '19:30', endTime: '22:30' } }], selectedStoreIds: ['store'], stores: [{ id: 'store', name: 'Fixture store', status: 'active', ownership_type: 'owned' }], organizationSlug: 'test', onBack: vi.fn(), onComplete: vi.fn() }
async function render() { await act(async () => root.render(<QueryClientProvider client={client}><PrivateBookingRequest {...props} /></QueryClientProvider>)); await flush() }
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks(); mocks.days = 90
  mocks.blocked.mockImplementation(async (params: any) => ({ data: params.p_start_date <= date ? [{ date, store_id: 'store', time_slot: 'evening' }] : [], error: null }))
  // 候補日時の空き判定は DB（夜は 19:00 開始）、受付停止の表示は従来の RPC
  mocks.rpc.mockImplementation(async (name: string, params: any) => name === 'private_booking_candidate_slot_availability'
    ? { data: [{ date: params.p_from, time_slot: 'evening', available: true, reason: null, start_time: '19:00', end_time: '22:00' }], error: null }
    : mocks.blocked(params))
  mocks.from.mockImplementation(() => {
    const query: any = { select: () => query, in: () => query, eq: () => query, filter: () => query, gte: () => query, lte: () => query, then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) }; return query
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove() })
it('締切読み込みが90日→14日へ変わると停止枠を取り直し、送信ボタンを無効化する', async () => {
  await render(); expect(mocks.blocked).toHaveBeenCalledTimes(1)
  mocks.days = 14; await render()
  expect(mocks.blocked).toHaveBeenCalledTimes(2)
  const button = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('受付停止中の候補を再選択'))
  expect(button?.disabled).toBe(true)
})
it('最新時刻が違う場合は画面へ反映して再確認を促し、グループも予約も作らない', async () => {
  mocks.days = 14; mocks.blocked.mockResolvedValue({ data: [], error: null })
  await render()
  const button = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('貸切リクエストを送信'))!
  await act(async () => button.click()); await flush()
  expect(host.textContent).toContain('最新の空き状況に合わせて候補時刻を更新しました')
  expect(host.textContent).toContain('19:00')
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled()
})
it('送信の失敗（DB の英字のコード）は日本語にして、送信ボタンのすぐ上に出す', async () => {
  mocks.days = 14; mocks.blocked.mockResolvedValue({ data: [], error: null })
  props.selectedTimeSlots = [{ date, slot: { label: '夜', startTime: '19:00', endTime: '22:00' } }]
  mocks.create.mockRejectedValue(Object.assign(new Error('PRIVATE_BOOKING_OUTSIDE_PERFORMANCE_PERIOD'), { code: 'P0054' }))
  await render()
  const button = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('貸切リクエストを送信'))!
  await act(async () => button.click()); await flush()
  const alert = host.querySelector('[data-testid="private-request-error"]')!
  expect(alert.textContent).toContain('この作品の公演期間外の候補日があります')
  expect(host.textContent).not.toContain('PRIVATE_BOOKING_OUTSIDE_PERFORMANCE_PERIOD')
  // ボタンの直前（同じ囲みの中で、ボタンの 1 つ前）
  expect(alert.nextElementSibling?.textContent).toContain('貸切リクエストを送信')
})
