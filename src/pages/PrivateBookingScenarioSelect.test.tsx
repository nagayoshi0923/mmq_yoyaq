// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), scenarios: vi.fn(), stores: vi.fn() }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('./ScenarioDetailPage/components/BookingNotice', () => ({ BookingNotice: () => <div data-testid="notice" /> }))
vi.mock('@/hooks/useScrollRestoration', () => ({ saveScrollPositionForCurrentUrl: vi.fn() }))
vi.mock('@/contexts/RouteScrollRestorationContext', () => ({ useReportRouteScrollRestoration: vi.fn() }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getPublic: mocks.scenarios, getAll: mocks.scenarios }, storeApi: { getAllPublicForCustomer: mocks.stores, getAll: mocks.stores } }))
vi.mock('@/lib/organization', () => ({ resolveOrganizationFromPathSegment: vi.fn(async () => ({ id: 'org' })) }))
import { PrivateBookingScenarioSelect } from './PrivateBookingScenarioSelect'

const storeId = '30000000-0000-0000-0000-000000000001'
const scenarios = [
  { id: 'sc1', slug: 'factor', title: 'ファクター', author: '作者A', duration: 210, player_count_min: 6, player_count_max: 8, participation_fee: 4500, accepts_private_booking: true },
  { id: 'sc2', slug: null, title: '二人の夜', author: '作者B', duration: 120, player_count_min: 2, player_count_max: 2, participation_fee: 3000, accepts_private_booking: true },
  { id: 'sc3', slug: 'off', title: '受付停止', author: '作者C', duration: 120, player_count_min: 4, player_count_max: 4, accepts_private_booking: false },
]
let root: Root, host: HTMLDivElement
async function render(search: string) {
  window.history.replaceState({}, '', `/queens-waltz/private-booking-select${search}`)
  await act(async () => root.render(<PrivateBookingScenarioSelect organizationSlug="queens-waltz" />))
}
const cards = () => [...host.querySelectorAll('[data-testid="private-scenario-grid"] > [aria-label]')] as HTMLElement[]
const proceedButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent === '貸切リクエスト確認へ')

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks()
  mocks.scenarios.mockResolvedValue(scenarios)
  mocks.stores.mockResolvedValue([{ id: storeId, name: '大塚店', status: 'active', ownership_type: 'owned' }])
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('日付・時間帯なし（トップの「貸切できる作品を見る」から）', () => {
  it('作品カードの一覧を出し、プルダウン・空の日時欄・確認ボタンは出さない', async () => {
    await render('')
    expect(host.textContent).toContain('貸切できる作品')
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['ファクター', '二人の夜'])
    expect(host.textContent).toContain('貸切できます')
    expect(host.textContent).toContain('1 人あたり ¥4,500')
    expect(host.textContent).toContain('6-8人')
    expect(host.querySelector('[role="combobox"]')).toBeNull()
    expect(host.textContent).not.toContain('選択された日時')
    expect(host.querySelector('[data-testid="selected-datetime"]')).toBeNull()
    expect(proceedButton()).toBeUndefined()
  })
  it('カードを押すと作品ページの貸切リクエストのタブへ（slug が無ければ ID）', async () => {
    await render('')
    await act(async () => cards()[0].click())
    expect(mocks.navigate).toHaveBeenCalledWith('/queens-waltz/scenario/factor?tab=private')
    await act(async () => cards()[1].click())
    expect(mocks.navigate).toHaveBeenLastCalledWith('/queens-waltz/scenario/sc2?tab=private')
  })
  it('人数のチップで絞れる', async () => {
    await render('')
    const chip = [...host.querySelectorAll('button')].find((b) => b.textContent === '2人')!
    await act(async () => chip.click())
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['二人の夜'])
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
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(cards()[0].getAttribute('aria-pressed')).toBe('true')
    expect(proceedButton()?.disabled).toBe(false)
    await act(async () => proceedButton()!.click())
    expect(mocks.navigate).toHaveBeenCalledWith(`/queens-waltz/private-booking-request?scenario=sc1&date=2026-10-20&store=${storeId}&slot=evening&participants=8&time=19%3A00`)
  })
})

describe('MMQ 全体トップの「貸切する店舗を選ぶ」から（from=mmq）', () => {
  it('「別の店舗を選ぶ」で全体トップの貸切用の店舗一覧へ戻れる', async () => {
    await render('?from=mmq')
    expect(host.querySelector('[data-testid="choose-another-store"]')?.getAttribute('href')).toBe('/?pick=private')
  })
  it('店舗トップから来たときは出さない', async () => {
    await render('')
    expect(host.querySelector('[data-testid="choose-another-store"]')).toBeNull()
  })
})
