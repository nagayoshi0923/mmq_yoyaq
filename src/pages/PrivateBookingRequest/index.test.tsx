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
// 時間帯のプルダウンは jsdom で操作できるように素の select にする（表示する文言と値はそのまま）
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => <select data-testid="slot-select" value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children, disabled }: any) => <option value={value} disabled={disabled}>{children}</option>,
}))
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
it('前ページの時刻と DB の最新の時刻が違えば、開いた時点で DB の時刻にそろえて知らせる（何も作らない）', async () => {
  mocks.days = 14; mocks.blocked.mockResolvedValue({ data: [], error: null })
  props.selectedTimeSlots = [{ date, slot: { label: '夜', startTime: '19:30', endTime: '22:30' } }]
  await render()
  expect(host.textContent).toContain('夜 19:00 - 22:00')
  expect(host.querySelector('[data-testid="candidate-times-updated"]')).not.toBeNull()
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled()
})
it('送信直前に最新時刻が変わっていれば画面へ反映して再確認を促し、グループも予約も作らない', async () => {
  mocks.days = 14; mocks.blocked.mockResolvedValue({ data: [], error: null })
  props.selectedTimeSlots = [{ date, slot: { label: '夜', startTime: '19:30', endTime: '22:30' } }]
  let start = '19:30', end = '22:30'
  mocks.rpc.mockImplementation(async (name: string, params: any) => name === 'private_booking_candidate_slot_availability'
    ? { data: [{ date: params.p_from, time_slot: 'evening', available: true, reason: null, start_time: start, end_time: end }], error: null }
    : mocks.blocked(params))
  await render()
  expect(host.textContent).toContain('夜 19:30 - 22:30')
  start = '19:00'; end = '22:00'
  const button = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('貸切リクエストを送信'))!
  await act(async () => button.click()); await flush()
  expect(host.textContent).toContain('最新の空き状況に合わせて候補時刻を更新しました')
  expect(host.textContent).toContain('19:00')
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled()
})
it('DB で選べない候補（URL から来て時刻が決まらなかったもの）は、仮の時刻を出さず理由を出して送信させない', async () => {
  mocks.days = 14; mocks.blocked.mockResolvedValue({ data: [], error: null })
  mocks.rpc.mockImplementation(async (name: string, params: any) => name === 'private_booking_candidate_slot_availability'
    ? { data: [{ date: params.p_from, time_slot: 'afternoon', available: false, reason: 'conflict', start_time: null, end_time: null }], error: null }
    : mocks.blocked(params))
  props.selectedTimeSlots = [{ date, slot: { label: '午後', startTime: '14:00', endTime: '' } }]
  await render()
  expect(host.textContent).not.toContain('14:00 - 14:00')
  expect(host.querySelector('[data-testid="candidate-unavailable"]')?.textContent).toContain('この日時は選べません（他の公演と重なります）')
  const button = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('選べない候補日時を再選択してください'))
  expect(button?.disabled).toBe(true)
  expect(mocks.create).not.toHaveBeenCalled()
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

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}
const buttonByText = (text: string) => [...host.querySelectorAll('button')].find(button => button.textContent?.includes(text))!

it('監査 R1: 店舗の特別営業日で DB が 14:00〜18:00 を返したら、候補の追加・確認画面・作成まで 18:00 のまま（作品の所要 3 時間で 17:00 に直さない）', async () => {
  mocks.days = 14; mocks.blocked.mockResolvedValue({ data: [], error: null })
  // 平日の作品の所要は 3 時間だが、二号店の特別営業日なので DB は土日祝の所要 4 時間で 14:00〜18:00 を返す（R25 と同じ）
  mocks.rpc.mockImplementation(async (name: string, params: any) => name === 'private_booking_candidate_slot_availability'
    ? { data: [{ date: params.p_from, time_slot: 'afternoon', available: true, reason: null, start_time: '14:00', end_time: '18:00' }], error: null }
    : mocks.blocked(params))
  mocks.create.mockResolvedValue({ id: 'group', invite_code: 'invite' })
  const second = new Date(Date.now() + 37 * 86400000).toISOString().slice(0, 10)
  props.selectedTimeSlots = [{ date, slot: { label: '午後', startTime: '14:00', endTime: '18:00' } }]
  await render()
  // 確認画面: DB の終了時刻のまま
  expect(host.textContent).toContain('午後 14:00 - 18:00')
  expect(host.textContent).not.toContain('17:00')

  // 候補の追加: プルダウンも追加した候補も DB の終了時刻
  await act(async () => buttonByText('追加').click())
  await act(async () => setValue(host.querySelector('input[type="date"]') as HTMLInputElement, second)); await flush()
  const select = host.querySelector('[data-testid="slot-select"]') as HTMLSelectElement
  expect(select.textContent).toContain('午後（14:00〜18:00）')
  await act(async () => setValue(select, '午後')); await flush()
  await act(async () => buttonByText('追加する').click()); await flush()
  expect(host.textContent?.match(/午後 14:00 - 18:00/g)).toHaveLength(2)
  expect(host.textContent).not.toContain('17:00')

  // 送信: 送信前の再検証も同じ応答なので書き換えず、グループ作成に 18:00 を渡す
  await act(async () => buttonByText('貸切リクエストを送信').click()); await flush()
  expect(host.textContent).not.toContain('最新の空き状況に合わせて候補時刻を更新しました')
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(mocks.create.mock.calls[0][0].candidateDates).toEqual([
    { date, time_slot: '午後', start_time: '14:00', end_time: '18:00', order_num: 1 },
    { date: second, time_slot: '午後', start_time: '14:00', end_time: '18:00', order_num: 2 },
  ])
  expect(mocks.submit).toHaveBeenCalledTimes(1)
})
