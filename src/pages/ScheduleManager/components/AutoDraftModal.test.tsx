// @vitest-environment jsdom
/**
 * 公演の下書き自動作成（QW-20261113-001）の画面。
 * 固定枠の保存は管理者だけ。下書きは「オープン・GM未定・予約受付OFF」で作る。
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const OKUBO = '11111111-1111-4111-8111-111111111111'
const mock = vi.hoisted(() => ({
  listSlotRules: vi.fn(),
  saveStoreSlotRules: vi.fn(),
  getData: vi.fn(),
  create: vi.fn(),
  settings: {
    weekday: { morning: { start_time: '10:00', end_time: '14:00' }, afternoon: { start_time: '14:30', end_time: '18:30' }, evening: { start_time: '19:00', end_time: '23:00' } },
    holiday: { morning: { start_time: '09:00', end_time: '13:00' }, afternoon: { start_time: '14:00', end_time: '18:00' }, evening: { start_time: '18:30', end_time: '22:30' } },
  },
}))
vi.mock('@/lib/api/autoDraftApi', () => ({
  autoDraftApi: { listSlotRules: mock.listSlotRules, saveStoreSlotRules: mock.saveStoreSlotRules, getData: mock.getData },
}))
vi.mock('@/lib/api/scheduleApi', () => ({ scheduleApi: { create: mock.create } }))
vi.mock('@/lib/apiClient', () => ({
  ApiClientError: class extends Error {
    constructor(public status: number, message: string, public detail?: string, public body?: Record<string, unknown>) { super(message) }
  },
}))
vi.mock('@/hooks/useTimeSlotSettings', () => ({
  useTimeSlotSettings: () => ({ settings: mock.settings }),
}))
vi.mock('@/hooks/useCustomHolidays', () => ({ useCustomHolidays: () => ({ customHolidays: [] }) }))
vi.mock('@/utils/toast', () => ({ showToast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/select', async () => {
  // 画面の選択肢をテストから選べるよう、ふつうの select に置き換える
  const React = await import('react')
  type Props = { value?: string; onValueChange?: (v: string) => void; children?: React.ReactNode }
  const Ctx = React.createContext<Props>({})
  return {
    Select: ({ value, onValueChange, children }: Props) => React.createElement(Ctx.Provider, { value: { value, onValueChange } }, children),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: Props) => {
      const ctx = React.useContext(Ctx)
      return React.createElement('select', { 'data-testid': 'select', value: ctx.value, onChange: (e: { target: { value: string } }) => ctx.onValueChange?.(e.target.value) }, children)
    },
    SelectItem: ({ value, children }: Props) => React.createElement('option', { value }, children),
  }
})
import { AutoDraftModal } from './AutoDraftModal'

let root: Root
let host: HTMLDivElement
const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function scenarioRow(id: string, title: string, duration: number) {
  return {
    id, org_scenario_id: `os-${id}`, title, status: 'available', player_count_max: 6,
    duration, weekend_duration: null, available_stores: [], kit_count: 1, scenario_kind: 'regular',
    available_from: null, available_until: null, created_at: '2025-01-01T00:00:00+09:00',
  }
}

const fridayEvening = [{ store_id: OKUBO, weekday: 5, time_slot: 'evening', is_open: true }]

async function render(props: Partial<Parameters<typeof AutoDraftModal>[0]> = {}) {
  await act(async () => {
    root.render(
      <AutoDraftModal
        open
        onClose={() => {}}
        organizationId="org-1"
        stores={[{ id: 'baba', name: '高田馬場店' }, { id: OKUBO, name: 'クインズワルツ大久保店' }]}
        canEditRules
        defaultYear={2026}
        defaultMonth={12}
        onCreated={() => {}}
        {...props}
      />,
    )
    await flush()
  })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T09:00:00+09:00'))
  vi.clearAllMocks()
  mock.listSlotRules.mockResolvedValue(fridayEvening)
  mock.saveStoreSlotRules.mockResolvedValue(fridayEvening)
  mock.getData.mockResolvedValue({
    rules: fridayEvening,
    scenarios: [{
      id: 'master-a', org_scenario_id: 'os-a', title: '検証作品A', status: 'available', player_count_max: 6,
      duration: 150, weekend_duration: null, available_stores: [], kit_count: 1, scenario_kind: 'regular',
      available_from: null, available_until: null, created_at: '2025-01-01T00:00:00+09:00',
    }],
    main_gm_counts: { 'master-a': 2 },
    nearby_events: [],
    demand_events: [],
    blocked_slots: [],
  })
  mock.create.mockResolvedValue({ id: 'new-event' })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})

it('大久保店を初期表示し、保存済みの固定枠を出す', async () => {
  await render()
  expect(document.body.textContent).toContain('クインズワルツ大久保店')
  expect(document.querySelector('[aria-label="金曜 夜"]')?.textContent).toBe('開ける')
  expect(document.querySelector('[aria-label="月曜 夜"]')?.textContent).toBe('—')
})

it('枠を押すと 未設定→開ける→開けない→未設定 と変わり、保存は店舗ごとに 24 枠まとめて送る', async () => {
  await render()
  const monday = () => document.querySelector('[aria-label="月曜 朝"]') as HTMLButtonElement
  await act(async () => monday().click())
  expect(monday().textContent).toBe('開ける')
  await act(async () => monday().click())
  expect(monday().textContent).toBe('開けない')
  await act(async () => { button('固定枠を保存')!.click(); await flush() })
  expect(mock.saveStoreSlotRules).toHaveBeenCalledOnce()
  const [storeId, cells] = mock.saveStoreSlotRules.mock.calls[0]
  expect(storeId).toBe(OKUBO)
  expect(cells).toHaveLength(24)
  expect(cells).toContainEqual({ weekday: 1, time_slot: 'morning', is_open: false })
  expect(cells).toContainEqual({ weekday: 5, time_slot: 'evening', is_open: true })
  expect(cells).toContainEqual({ weekday: 7, time_slot: 'evening', is_open: null })
})

it('管理者でなければ固定枠は押せず、保存ボタンも出さない', async () => {
  await render({ canEditRules: false })
  expect((document.querySelector('[aria-label="金曜 夜"]') as HTMLButtonElement).disabled).toBe(true)
  expect(button('固定枠を保存')).toBeUndefined()
  expect(document.body.textContent).toContain('固定枠の変更は管理者だけができます')
})

it('下書き案を作って登録すると、オープン・GM未定・予約受付OFFで公演を作る', async () => {
  const onCreated = vi.fn()
  await render({ onCreated })
  await act(async () => { button('下書き案を作る')!.click(); await flush() })
  // 12 月の金曜は 4・11・18・25 日。同じ店舗でも 7 日あいていれば同じ作品を入れられるので 4 件
  expect(mock.getData).toHaveBeenCalledWith({ start: '2026-11-24', end: '2027-01-07', demandFrom: '2026-07-16', demandTo: '2026-11-13' })
  expect(document.body.textContent).toContain('検証作品A')
  const registerButton = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('件を下書きとして登録'))!
  expect(registerButton.textContent).toBe('選んだ4件を下書きとして登録')
  await act(async () => { registerButton.click(); await flush() })
  expect(mock.create).toHaveBeenCalledTimes(4)
  expect(mock.create.mock.calls[0][0]).toMatchObject({
    date: '2026-12-04',
    store_id: OKUBO,
    venue: 'クインズワルツ大久保店',
    scenario: '検証作品A',
    scenario_master_id: 'master-a',
    organization_scenario_id: 'os-a',
    category: 'open',
    start_time: '19:00',
    end_time: '21:30',
    capacity: 6,
    gms: [],
    staff_assignment: { gms: [], gm_roles: {}, entries: [] },
    time_slot: '夜',
    is_reservation_enabled: false,
  })
  expect(onCreated).toHaveBeenCalledOnce()
})

async function chooseScenario(rowIndex: number, scenarioId: string) {
  // 1 つめの select は店舗、2 つめは月。そのあとが案ごとの作品
  const select = document.querySelectorAll('select')[2 + rowIndex] as HTMLSelectElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, scenarioId)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

const registerButton = () => [...document.querySelectorAll('button')].find(b => b.textContent?.includes('件を下書きとして登録'))!

it('作品を入れ替えると、入れ替えた作品の公演時間で終了時刻を出し直して登録する', async () => {
  mock.getData.mockResolvedValue({
    rules: fridayEvening,
    scenarios: [scenarioRow('master-a', '検証作品A', 150), scenarioRow('master-b', '検証作品B', 210)],
    main_gm_counts: { 'master-a': 2, 'master-b': 2 },
    nearby_events: [], demand_events: [], blocked_slots: [],
  })
  await render()
  await act(async () => { button('下書き案を作る')!.click(); await flush() })
  const firstIsA = mock.create.mock.calls.length === 0 && document.body.textContent!.includes('19:00〜21:30')
  expect(firstIsA).toBe(true)
  await chooseScenario(0, 'master-b')
  expect(document.body.textContent).toContain('19:00〜22:30')
  await act(async () => { registerButton().click(); await flush() })
  const firstCall = mock.create.mock.calls.find(c => c[0].date === '2026-12-04')![0]
  expect(firstCall).toMatchObject({ scenario_master_id: 'master-b', end_time: '22:30' })
})

it('入れ替えで同じ店舗に 7 日以内の同じ作品ができたら、その案は登録しない', async () => {
  mock.getData.mockResolvedValue({
    rules: [{ store_id: OKUBO, weekday: 5, time_slot: 'evening', is_open: true }, { store_id: OKUBO, weekday: 6, time_slot: 'evening', is_open: true }],
    scenarios: [scenarioRow('master-a', '検証作品A', 150), scenarioRow('master-b', '検証作品B', 150)],
    main_gm_counts: { 'master-a': 2, 'master-b': 2 },
    nearby_events: [], demand_events: [], blocked_slots: [],
  })
  await render()
  await act(async () => { button('下書き案を作る')!.click(); await flush() })
  // 12/4（金）と 12/5（土）は別の作品が入る。12/4 を 12/5 と同じ作品に変える
  const selects = [...document.querySelectorAll('select')].slice(2) as HTMLSelectElement[]
  const second = selects[1].value
  await chooseScenario(0, second)
  expect(document.body.textContent).toContain('同じ店舗で7日以内に同じ作品があります')
  const before = Number(registerButton().textContent!.match(/選んだ(\d+)件/)![1])
  await act(async () => { registerButton().click(); await flush() })
  expect(mock.create.mock.calls).toHaveLength(before)
  const dates = mock.create.mock.calls.filter(c => c[0].scenario_master_id === second).map(c => c[0].date)
  expect(dates).not.toContain('2026-12-05')
})

it('作成されたか分からなかった案は、登録し直すとき同じ要求 ID で送る', async () => {
  mock.create.mockRejectedValueOnce(new Error('network'))
  await render()
  await act(async () => { button('下書き案を作る')!.click(); await flush() })
  await act(async () => { registerButton().click(); await flush() })
  const firstId = mock.create.mock.calls[0][0].client_request_id
  expect(registerButton().textContent).toBe('選んだ1件を下書きとして登録')
  await act(async () => { registerButton().click(); await flush() })
  expect(mock.create.mock.calls.at(-1)![0].client_request_id).toBe(firstId)
})

it('祝日（独自休日を含む）は休日の時間帯設定で枠の時刻を決める', async () => {
  mock.getData.mockResolvedValue({
    rules: [{ store_id: OKUBO, weekday: 5, time_slot: 'evening', is_open: true }],
    scenarios: [scenarioRow('master-a', '検証作品A', 150)],
    main_gm_counts: { 'master-a': 2 },
    nearby_events: [], demand_events: [], blocked_slots: [],
  })
  await render({ defaultYear: 2027, defaultMonth: 1 })
  await act(async () => { button('下書き案を作る')!.click(); await flush() })
  // 2027-01-01（金・元日）は休日の設定（夜 18:30）、1/8（金）は平日の設定（夜 19:00）
  await act(async () => { registerButton().click(); await flush() })
  const byDate = Object.fromEntries(mock.create.mock.calls.map(c => [c[0].date, c[0].start_time]))
  expect(byDate['2027-01-01']).toBe('18:30')
  expect(byDate['2027-01-08']).toBe('19:00')
})

it('入れ替えた作品の登録に失敗しても、登録し直すときは入れ替えた作品のまま送る', async () => {
  mock.getData.mockResolvedValue({
    rules: fridayEvening,
    scenarios: [scenarioRow('master-a', '検証作品A', 150), scenarioRow('master-b', '検証作品B', 210)],
    main_gm_counts: { 'master-a': 2, 'master-b': 2 },
    nearby_events: [], demand_events: [], blocked_slots: [],
  })
  mock.create.mockImplementation(async (e: { date: string }) => {
    if (e.date === '2026-12-04' && mock.create.mock.calls.length === 1) throw new Error('一時的な失敗')
    return { id: 'new-event' }
  })
  await render()
  await act(async () => { button('下書き案を作る')!.click(); await flush() })
  await chooseScenario(0, 'master-b')
  await act(async () => { registerButton().click(); await flush() })
  expect(registerButton().textContent).toBe('選んだ1件を下書きとして登録')
  await act(async () => { registerButton().click(); await flush() })
  expect(mock.create.mock.calls.at(-1)![0]).toMatchObject({ date: '2026-12-04', scenario_master_id: 'master-b', end_time: '22:30' })
})
