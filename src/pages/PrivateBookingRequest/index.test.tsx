// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isWeekendOrHoliday } from '../ScenarioDetailPage/utils/pricingUtils'
const HORIZON = vi.hoisted(() => ({ days: 180 }))
vi.mock('@/lib/privateBookingHorizon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/privateBookingHorizon')>()),
  usePrivateBookingHorizonDays: () => ({ days: HORIZON.days, loading: false }),
}))

const mocks = vi.hoisted(() => ({ days: 90, rpc: vi.fn(), from: vi.fn(), submit: vi.fn(), create: vi.fn(), blocked: vi.fn(), holiday: () => false, submitArgs: null as null | { selectedStoreIds: string[] } }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user', email: 'fixture@example.invalid' } }) }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/NavigationBar', () => ({ NavigationBar: () => null }))
vi.mock('../ScenarioDetailPage/components/BookingNotice', () => ({ BookingNotice: () => null }))
const holidayLoad = vi.hoisted(() => ({ isLoading: false, error: null as string | null }))
vi.mock('@/hooks/useCustomHolidays', async (importOriginal) => ({
  knownCustomHoliday: (await importOriginal<typeof import('@/hooks/useCustomHolidays')>()).knownCustomHoliday,
  useCustomHolidays: () => ({ isCustomHoliday: mocks.holiday, isLoading: holidayLoad.isLoading, error: holidayLoad.error }),
}))
vi.mock('@/hooks/usePrivateBookingDeadlineDays', () => ({ usePrivateBookingDeadlineDays: () => mocks.days }))
vi.mock('@/hooks/usePrivateGroup', () => ({ usePrivateGroup: () => ({ createGroup: mocks.create, loading: false }) }))
vi.mock('./hooks/usePrivateBookingSubmit', () => ({ usePrivateBookingSubmit: (args: { selectedStoreIds: string[] }) => { mocks.submitArgs = args; return { handleSubmit: mocks.submit, isSubmitting: false, success: false } } }))
// お客様情報は入力どおりに持つ（店舗の変更で消えないことを確かめる）
vi.mock('../BookingConfirmation/hooks/useCustomerData', async () => {
  const React = await import('react')
  return { useCustomerData: () => {
    const [customerName, setCustomerName] = React.useState('Fixture')
    const [customerNickname, setCustomerNickname] = React.useState('')
    return { customerName, setCustomerName, customerEmail: 'fixture@example.invalid', customerPhone: '00000000000', customerNickname, setCustomerNickname, setCustomerEmail: vi.fn(), setCustomerPhone: vi.fn() }
  } }
})
// 店舗のプルダウン（Radix Popover）は jsdom で開閉が進まないため、中身を常に出す
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <div data-testid="popover-content">{children}</div>,
}))
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

it('点検 F09: 送信を二度押し（同じ描画のうちに 2 回）しても、グループの作成と申込は 1 回だけ', async () => {
  mocks.days = 14; mocks.blocked.mockResolvedValue({ data: [], error: null })
  props.selectedTimeSlots = [{ date, slot: { label: '夜', startTime: '19:00', endTime: '22:00' } }]
  let release!: () => void
  mocks.create.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ id: 'group-1', invite_code: 'X' }) }))
  mocks.submit.mockResolvedValue(undefined)
  await render()
  const button = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('貸切リクエストを送信'))!
  await act(async () => { button.click(); button.click() })
  await flush()
  expect(button.disabled).toBe(true)
  await act(async () => { release() }); await flush()
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(mocks.submit).toHaveBeenCalledTimes(1)
  expect(mocks.submit.mock.calls[0][5]).toBe('group-1')
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

describe('確認ページで希望店舗を変更する（QW-20261022-013）', () => {
  const twoStores = [
    { id: 'store', name: '大塚店', status: 'active', ownership_type: 'owned' },
    { id: 'store2', name: '高田馬場店', status: 'active', ownership_type: 'owned' },
  ]
  const onStoreIdsChange = vi.fn()
  let conflictAtStore2 = false
  async function renderStores() {
    const p = { ...props, stores: twoStores, selectedStoreIds: ['store'], selectedTimeSlots: [{ date, slot: { label: '夜', startTime: '19:00', endTime: '22:00' } }], onStoreIdsChange }
    await act(async () => root.render(<QueryClientProvider client={client}><PrivateBookingRequest {...p} /></QueryClientProvider>)); await flush()
  }
  beforeEach(() => {
    mocks.days = 14; conflictAtStore2 = false; onStoreIdsChange.mockClear()
    mocks.blocked.mockResolvedValue({ data: [], error: null })
    mocks.rpc.mockImplementation(async (name: string, params: any) => name === 'private_booking_candidate_slot_availability'
      ? { data: [conflictAtStore2 && params.p_store_ids.join(',') === 'store2'
        ? { date: params.p_from, time_slot: 'evening', available: false, reason: 'conflict', start_time: null, end_time: null }
        : { date: params.p_from, time_slot: 'evening', available: true, reason: null, start_time: '19:00', end_time: '22:00' }], error: null }
      : mocks.blocked(params))
    mocks.create.mockResolvedValue({ id: 'group', invite_code: 'invite' })
  })
  const sheet = () => document.querySelector('[data-testid="change-stores-sheet"]') as HTMLElement | null
  const inSheet = (text: string) => [...sheet()!.querySelectorAll('button')].find((b) => b.textContent?.trim().endsWith(text) || b.getAttribute('aria-label') === text) as HTMLButtonElement
  const shownStores = () => [...host.querySelectorAll('[data-testid="selected-stores"] .text-sm.font-medium')].map((e) => e.textContent)
  async function chooseStore2Only() {
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="change-stores"]')!.click()); await flush()
    expect(sheet()).not.toBeNull()
    await act(async () => inSheet('高田馬場店').click())
    await act(async () => inSheet('大塚店を解除').click()); await flush()
  }
  const notesBox = () => host.querySelector('textarea') as HTMLTextAreaElement
  function typeNotes(value: string) {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(notesBox(), value)
    notesBox().dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('「希望店舗」の横の「変更」から選び直して確定すると、表示・空き判定・送信データが同じ店舗になり、入力は消えない', async () => {
    await renderStores()
    expect(shownStores()).toEqual(['大塚店'])
    await act(async () => typeNotes('誕生日です'))
    const nameInput = host.querySelector('input[placeholder="山田 太郎"]') as HTMLInputElement
    await act(async () => setValue(nameInput, '貸切 花子'))
    await chooseStore2Only()
    expect(sheet()!.querySelector('[data-testid="change-stores-ok"]')).not.toBeNull()
    await act(async () => inSheet('この店舗に変更する').click()); await flush()
    expect(sheet()).toBeNull()
    expect(shownStores()).toEqual(['高田馬場店'])
    expect(onStoreIdsChange).toHaveBeenCalledWith(['store2'])
    // 作品・候補日時・お客様情報・備考はそのまま
    expect(host.textContent).toContain('Fixture')
    expect(host.textContent).toContain('夜 19:00 - 22:00')
    expect(notesBox().value).toBe('誕生日です')
    expect((host.querySelector('input[placeholder="山田 太郎"]') as HTMLInputElement).value).toBe('貸切 花子')
    // 空き判定も新しい店舗で
    expect(mocks.rpc.mock.calls.some(([n, p]: any) => n === 'private_booking_candidate_slot_availability' && p.p_store_ids.join(',') === 'store2')).toBe(true)
    // 送信データも同じ店舗
    expect(mocks.submitArgs?.selectedStoreIds).toEqual(['store2'])
    await act(async () => buttonByText('貸切リクエストを送信').click()); await flush()
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create.mock.calls[0][0].preferredStoreIds).toEqual(['store2'])
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })

  it('「変更しない」で閉じたら元の店舗のまま（URL も送信データも変えない）', async () => {
    await renderStores()
    await chooseStore2Only()
    await act(async () => inSheet('変更しない').click()); await flush()
    expect(sheet()).toBeNull()
    expect(shownStores()).toEqual(['大塚店'])
    expect(onStoreIdsChange).not.toHaveBeenCalled()
    expect(mocks.submitArgs?.selectedStoreIds).toEqual(['store'])
    // もう一度開くと、取り消した選び直しは持ち越さない
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="change-stores"]')!.click()); await flush()
    expect([...sheet()!.querySelectorAll('[data-testid="selected-store-badges"] li')].map((li) => li.textContent)).toEqual(['大塚店'])
  })

  it('変更先で選べなくなる候補は確定前に理由つきで知らせ、確定しても候補は消さずに送信させない', async () => {
    conflictAtStore2 = true
    await renderStores()
    await chooseStore2Only()
    const alert = sheet()!.querySelector('[data-testid="change-stores-unavailable"]')!
    expect(alert.textContent).toContain('この店舗では選べない候補日時があります（1 件）')
    expect(alert.textContent).toContain('夜: 他の公演と重なります')
    expect(alert.textContent).toContain('変更しても候補は消えません')
    await act(async () => inSheet('この店舗に変更する').click()); await flush()
    expect(shownStores()).toEqual(['高田馬場店'])
    expect(host.textContent).toContain('候補日時（1/6件）')
    expect(host.querySelector('[data-testid="candidate-unavailable"]')?.textContent).toContain('この日時は選べません（他の公演と重なります）')
    const button = buttonByText('選べない候補日時を再選択してください')
    expect(button.disabled).toBe(true)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('店舗を 1 つも選ばないと確定できない', async () => {
    await renderStores()
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="change-stores"]')!.click()); await flush()
    await act(async () => inSheet('大塚店を解除').click()); await flush()
    expect(sheet()!.querySelector('[data-testid="change-stores-empty"]')).not.toBeNull()
    expect(inSheet('この店舗に変更する').disabled).toBe(true)
  })
})

describe('料金: 組織の独自休日が分からないとき（2026-10-25 社長報告・Codex レビュー）', () => {
  // 30 日以上先の平日（祝日でない日）
  const weekday = (() => { for (let i = 30; ; i++) { const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10); const dow = new Date(d + 'T00:00:00Z').getUTCDay(); if (dow >= 1 && dow <= 5 && !isWeekendOrHoliday(d)) return d } })()
  // 平日 4,000 円・土日祝 4,500 円の作品（独自休日かどうかで料金が変わる）
  const costs = [{ time_slot: 'normal', amount: 4000, type: 'fixed' as const }, { time_slot: 'weekend', amount: 4500, type: 'fixed' as const }, { time_slot: 'holiday', amount: 4500, type: 'fixed' as const }]
  const weekdayProps = { ...props, participationCosts: costs, selectedTimeSlots: [{ date: weekday, slot: { label: '夜', startTime: '19:30', endTime: '22:30' } }] }
  const renderWeekday = async () => { await act(async () => root.render(<QueryClientProvider client={client}><PrivateBookingRequest {...weekdayProps} /></QueryClientProvider>)); await flush() }
  afterEach(() => { holidayLoad.isLoading = false; holidayLoad.error = null })
  it('読み込めなかったときは平日の候補の料金を出さず、再読み込みを案内する', async () => {
    holidayLoad.error = '休日設定を取得できません。画面を再読み込みしてください。'
    await renderWeekday()
    expect(host.textContent).toContain('確認できません')
    expect(host.textContent).not.toContain('¥24,000')
    expect(host.querySelector('[data-testid="private-request-fee-error"]')?.textContent).toContain('再読み込み')
  })
  it('読み込み中は「確認中」、読めたら平日の料金', async () => {
    holidayLoad.isLoading = true
    await renderWeekday()
    expect(host.textContent).toContain('確認中')
    expect(host.textContent).not.toContain('¥24,000')
    holidayLoad.isLoading = false
    await renderWeekday()
    expect(host.textContent).toContain('¥24,000')
  })
})
