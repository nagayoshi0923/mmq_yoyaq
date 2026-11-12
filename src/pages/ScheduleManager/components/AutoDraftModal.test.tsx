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
}))
vi.mock('@/lib/api/autoDraftApi', () => ({
  autoDraftApi: { listSlotRules: mock.listSlotRules, saveStoreSlotRules: mock.saveStoreSlotRules, getData: mock.getData },
}))
vi.mock('@/lib/api/scheduleApi', () => ({ scheduleApi: { create: mock.create } }))
vi.mock('@/hooks/useTimeSlotSettings', () => ({
  useTimeSlotSettings: () => ({ getSlotDefaults: () => ({ start_time: '19:00', end_time: '23:00' }) }),
}))
vi.mock('@/hooks/useCustomHolidays', () => ({ useCustomHolidays: () => ({ customHolidays: [] }) }))
vi.mock('@/utils/toast', () => ({ showToast: { success: vi.fn(), error: vi.fn() } }))
import { AutoDraftModal } from './AutoDraftModal'

let root: Root
let host: HTMLDivElement
const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

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
