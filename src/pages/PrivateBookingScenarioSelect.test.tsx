// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), scenarios: vi.fn(), stores: vi.fn(), rpc: vi.fn() }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ search: window.location.search }),
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('./ScenarioDetailPage/components/BookingNotice', () => ({ BookingNotice: () => <div data-testid="notice" /> }))
vi.mock('@/hooks/useScrollRestoration', () => ({ saveScrollPositionForCurrentUrl: vi.fn() }))
vi.mock('@/contexts/RouteScrollRestorationContext', () => ({ useReportRouteScrollRestoration: vi.fn() }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getPublic: mocks.scenarios, getAll: mocks.scenarios }, storeApi: { getAllPublicForCustomer: mocks.stores, getAll: mocks.stores } }))
vi.mock('./PrivateBookingStart', () => ({ PrivateBookingStart: ({ organizationSlug }: { organizationSlug?: string }) => <div data-testid="private-start" data-org={organizationSlug} /> }))
vi.mock('@/lib/organization', () => ({ resolveOrganizationFromPathSegment: vi.fn(async () => ({ id: 'org' })) }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() } }))
import { PrivateBookingScenarioSelect } from './PrivateBookingScenarioSelect'

const storeId = '30000000-0000-0000-0000-000000000001'
const tempId = '30000000-0000-0000-0000-000000000002'
const otherId = '30000000-0000-0000-0000-000000000003'
const rpcState: { reasons: Array<{ scenario_id: string; reason: string }>; slot: Record<string, unknown>; slotArgs: Array<Record<string, unknown>> } = { reasons: [], slot: {}, slotArgs: [] }
const scenarios = [
  { id: 'sc1', slug: 'factor', title: 'ファクター', author: '作者A', duration: 210, player_count_min: 6, player_count_max: 8, participation_fee: 4500, accepts_private_booking: true },
  { id: 'sc2', slug: null, title: '二人の夜', author: '作者B', duration: 120, player_count_min: 2, player_count_max: 2, participation_fee: 3000, accepts_private_booking: true },
  { id: 'sc3', slug: 'off', title: '受付停止', author: '作者C', duration: 120, player_count_min: 4, player_count_max: 4, accepts_private_booking: false },
]
let root: Root, host: HTMLDivElement
async function render(search: string) {
  window.history.replaceState({}, '', `/queens-waltz/private-booking-select${search}`)
  await act(async () => root.render(<PrivateBookingScenarioSelect organizationSlug="queens-waltz" />))
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const slotCheck = () => host.querySelector('[data-testid="private-select-slot-check"]') as HTMLElement | null
const cards = () => [...host.querySelectorAll('[data-testid="private-scenario-grid"] > [aria-label]')] as HTMLElement[]
const proceedButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent === '貸切リクエスト確認へ')

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks()
  mocks.scenarios.mockResolvedValue(scenarios)
  mocks.stores.mockResolvedValue([
    { id: storeId, name: '大塚店', status: 'active', ownership_type: 'corporate', is_temporary: false },
    { id: tempId, name: '特設会場 1', status: 'active', ownership_type: null, is_temporary: true },
    { id: otherId, name: '馬場オフィス', status: 'active', ownership_type: 'corporate', is_temporary: false },
  ])
  rpcState.reasons = []
  rpcState.slot = { available: true, reason: null, start_time: '18:30', end_time: '23:00', detail: null }
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'private_booking_scenario_date_reasons') return { data: rpcState.reasons, error: null }
    if (name === 'private_booking_candidate_slot_availability') {
      rpcState.slotArgs.push(args)
      return { data: [{ date: args.p_from, time_slot: 'evening', adjusted: false, ...rpcState.slot }], error: null }
    }
    return { data: null, error: { message: 'unexpected' } }
  })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('日付・時間帯なし（店舗トップの「貸切できる作品を見る」から）', () => {
  it('貸切を始めるページを、その組織を選んだ状態で開く', async () => {
    await render('')
    expect(host.querySelector('[data-testid="private-start"]')?.getAttribute('data-org')).toBe('queens-waltz')
    expect(proceedButton()).toBeUndefined()
  })
  it('日付だけ（時間帯なし）でも同じ', async () => {
    await render('?date=2026-10-20')
    expect(host.querySelector('[data-testid="private-start"]')).not.toBeNull()
  })
})

describe('日付・時間帯あり（カレンダー・リストの貸切申込チップから）', () => {
  it('選んだ日時を出し、作品を選ぶと確認ボタンが押せる', async () => {
    await render(`?date=2026-10-20&store=${storeId}&slot=evening&time=19:00`)
    expect(host.querySelector('[data-testid="selected-datetime"]')?.textContent).toContain('夜')
    expect(host.textContent).toContain('の貸切: 作品を選ぶ')
    expect(host.querySelector('[role="combobox"]')).toBeNull()
    expect(proceedButton()?.disabled).toBe(true)
    await act(async () => cards()[0].click())
    await flush()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(cards()[0].getAttribute('aria-pressed')).toBe('true')
    expect(proceedButton()?.disabled).toBe(false)
    // 押したチップは 19:00〜。DB の判定で 18:30 開始になることをボタンの上に出す
    expect(slotCheck()?.dataset.kind).toBe('available')
    expect(slotCheck()?.textContent).toContain('この作品の開始時刻 18:30 で申し込みます')
    expect(slotCheck()?.textContent).toContain('選んだ 19:00〜 とは開始時刻が変わります')
    expect(rpcState.slotArgs.at(-1)).toMatchObject({ p_organization_id: 'org', p_scenario_id: 'sc1', p_store_ids: [storeId], p_from: '2026-10-20', p_to: '2026-10-20' })
    await act(async () => proceedButton()!.click())
    expect(mocks.navigate).toHaveBeenCalledWith(`/queens-waltz/private-booking-request?scenario=sc1&date=2026-10-20&store=${storeId}&slot=evening&participants=8&time=18%3A30`)
  })

  it('その日に申し込めない作品（公演期間外など）は理由付きで押せない', async () => {
    rpcState.reasons = [{ scenario_id: 'sc2', reason: 'outside_period' }]
    await render(`?date=2026-10-20&store=${storeId}&slot=evening&time=19:00`)
    const closed = cards()[1]
    expect(closed.textContent).toContain('この日は申し込めません（作品の公演期間外です）')
    expect(cards()[0].textContent).toContain('貸切できます')
    await act(async () => closed.click())
    expect(closed.getAttribute('aria-pressed')).not.toBe('true')
    expect(proceedButton()?.disabled).toBe(true)
  })

  it('選んだ作品が DB の判定で申し込めなければ、理由を日本語でボタンの上に出して進めない', async () => {
    rpcState.slot = { available: false, reason: 'outside_period', start_time: null, end_time: null, detail: null }
    await render(`?date=2026-10-20&store=${storeId}&slot=evening&time=19:00`)
    await act(async () => cards()[0].click())
    await flush()
    expect(slotCheck()?.dataset.kind).toBe('unavailable')
    expect(slotCheck()?.textContent).toContain('作品の公演期間外です')
    expect(slotCheck()?.textContent).not.toMatch(/[A-Z_]{6,}/)
    expect(proceedButton()?.disabled).toBe(true)
  })

  it('希望店舗には、その作品を上演できる店舗だけを出す（臨時会場・上演店舗の指定外は出さない）', async () => {
    mocks.scenarios.mockResolvedValue([{ ...scenarios[0], available_stores: [storeId] }, scenarios[1]])
    await render(`?date=2026-10-20&store=${storeId}&slot=evening&time=19:00`)
    await act(async () => cards()[0].click())
    await flush()
    expect(host.textContent).toContain('大塚店')
    expect(host.textContent).not.toContain('特設会場 1')
    expect(host.textContent).not.toContain('馬場オフィス')
    expect(host.textContent).not.toContain('対応不可')
    // 上演店舗の指定が無い作品: 臨時会場だけ出さない
    await act(async () => cards()[1].click())
    await flush()
    expect(host.textContent).toContain('馬場オフィス')
    expect(host.textContent).not.toContain('特設会場 1')
  })
})
