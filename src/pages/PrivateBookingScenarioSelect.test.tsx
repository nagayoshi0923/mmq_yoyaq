// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), scenarios: vi.fn(), stores: vi.fn() }))
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
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(cards()[0].getAttribute('aria-pressed')).toBe('true')
    expect(proceedButton()?.disabled).toBe(false)
    await act(async () => proceedButton()!.click())
    expect(mocks.navigate).toHaveBeenCalledWith(`/queens-waltz/private-booking-request?scenario=sc1&date=2026-10-20&store=${storeId}&slot=evening&participants=8&time=19%3A00`)
  })
})
