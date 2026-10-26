// @vitest-environment jsdom
/**
 * ログインから作品ページへ戻ったときの「預けた貸切の選択」の戻し方（QW-20261023-001・Codex 点検）。
 *
 * 作品ページ（ScenarioDetailPage）を実際に描画し、usePrivateBooking・useBookingActions も実物を使う。
 * 模擬しているのは、作品データの読み込み・ログイン状態・受付範囲・空き状況（DB の判定）・確認画面の中身・見た目だけの部品。
 *
 * 安全側の決まり:
 * - 受付の範囲を広げない（無効な店舗を「全店舗」に戻さない）
 * - 最新の空き判定で、預けた候補がすべて選べると分かったときだけ確認画面を開く。分からなければ作品ページの選択で止める
 */
import { act, StrictMode, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { savePrivateBookingLoginDraft, PRIVATE_BOOKING_LOGIN_DRAFT_KEY } from '@/lib/privateBookingLoginDraft'
import type { CandidateSlotAvailabilityRow } from '@/lib/candidateSlotAvailability'

// ---- 作品データ ----------------------------------------------------------
const ORG = '00000000-0000-4000-a000-000000000001'
const STORE_A = '00000000-0000-4000-a000-000000000101'
const STORE_B = '00000000-0000-4000-a000-000000000102'
const STORE_GONE = '00000000-0000-4000-a000-000000000199'
const store = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, short_name: name, status: 'active', ownership_type: 'corporate', organization_id: ORG, ...extra })

type PageData = { scenario: Record<string, unknown>; stores: ReturnType<typeof store>[] }
const pages: Record<string, PageData> = {}
function setScenario(slug: string, over: Record<string, unknown> = {}, stores = [store(STORE_A, 'テスト店舗A'), store(STORE_B, 'テスト店舗B')]) {
  pages[slug] = {
    scenario: {
      scenario_master_id: `master-${slug}`, slug, scenario_title: `作品${slug}`, participation_fee: 4500, player_count_max: 7,
      available_stores: [], accepts_private_booking: true, organization_id: ORG, ...over,
    },
    stores,
  }
}
vi.mock('./hooks/useScenarioDetail', () => ({
  useScenarioDetail: (scenarioId: string) => {
    const d = pages[scenarioId]
    return { scenario: d?.scenario ?? null, events: [], stores: d?.stores ?? [], relatedScenarios: [], organizationId: ORG, isLoading: !d, loadScenarioDetail: () => undefined }
  },
}))

// ---- ログイン・設定 ------------------------------------------------------
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) }, from: () => { throw new Error('DB には接続しない') }, rpc: () => { throw new Error('DB には接続しない') } }, SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_ANON_KEY: 'test' }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'customer', email: 'c@example.invalid' }, isStaff: false }) }))
const requireCompleteProfile = vi.fn(async () => true)
vi.mock('@/hooks/useRequireCompleteProfile', () => ({ useRequireCompleteProfile: () => requireCompleteProfile }))
vi.mock('@/hooks/useCustomHolidays', () => ({ useCustomHolidays: () => ({ isCustomHoliday: () => false }) }))
vi.mock('@/hooks/useOrgThemePreset', () => ({ useOrgThemePreset: () => ({ primary: '#333' }) }))
vi.mock('@/hooks/usePrivateBookingDeadlineDays', () => ({ usePrivateBookingDeadlineDays: () => 14 }))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: () => undefined }))
vi.mock('@/contexts/RouteScrollRestorationContext', () => ({ useReportRouteScrollRestoration: () => undefined }))
vi.mock('@/hooks/useScrollRestoration', () => ({ saveScrollPositionForCurrentUrl: () => undefined }))
vi.mock('@/hooks/useUserPreference', async () => {
  const { useState } = await import('react')
  return {
    usePrivateBookingStorePreference: () => useState<string[]>([]),
    useStoreFilterPreference: (d: string[] = []) => useState<string[]>(d),
  }
})
vi.mock('@/lib/privateBookingHorizon', async (orig) => ({
  ...(await orig<typeof import('@/lib/privateBookingHorizon')>()),
  usePrivateBookingHorizonDays: () => ({ days: 180, loading: false, error: false, retry: () => undefined }),
}))

// ---- 空き状況（DB の判定）を模擬。呼び出しごとに保留できる -----------------
type Judge = (date: string, slot: 'morning' | 'afternoon' | 'evening', storeIds: string[]) => { available: boolean; reason?: string }
let judge: Judge = () => ({ available: true })
let holdNext = false
const held: Array<() => void> = []
const fetchCalls: Array<{ from: string; to: string; storeIds: string[] }> = []
vi.mock('@/lib/candidateSlotAvailability', async (orig) => {
  const actual = await orig<typeof import('@/lib/candidateSlotAvailability')>()
  return {
    ...actual,
    fetchCandidateSlotAvailability: (target: { storeIds: string[] }, from: string, to: string) => {
      fetchCalls.push({ from, to, storeIds: [...target.storeIds] })
      const build = (): CandidateSlotAvailabilityRow[] => {
        const rows: CandidateSlotAvailabilityRow[] = []
        const d = new Date(`${from}T00:00:00Z`)
        const end = new Date(`${to}T00:00:00Z`)
        for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
          const ymd = d.toISOString().slice(0, 10)
          for (const [slot, s, e] of [['morning', '10:00', '14:00'], ['afternoon', '14:30', '18:30'], ['evening', '19:00', '23:00']] as const) {
            const j = judge(ymd, slot, target.storeIds)
            rows.push({ date: ymd, time_slot: slot, available: j.available, reason: (j.reason ?? null) as CandidateSlotAvailabilityRow['reason'], start_time: s, end_time: e })
          }
        }
        return rows
      }
      if (holdNext) {
        return new Promise<CandidateSlotAvailabilityRow[]>(resolve => { held.push(() => resolve(build())) })
      }
      return Promise.resolve(build())
    },
  }
})

// ---- 見た目だけの部品・確認画面 ------------------------------------------
const confirmOpens: Array<{ slots: unknown[]; stores: string[] }> = []
const venueStores: string[][] = []
vi.mock('../PrivateBookingRequest/index', () => ({
  PrivateBookingRequest: (props: { selectedTimeSlots: unknown[]; selectedStoreIds: string[] }) => {
    confirmOpens.push({ slots: props.selectedTimeSlots, stores: props.selectedStoreIds })
    return <div data-testid="confirm">貸切リクエスト確認</div>
  },
}))
vi.mock('../BookingConfirmation/index', () => ({ BookingConfirmation: () => null }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))
vi.mock('@/components/layout/NavigationBar', () => ({ NavigationBar: () => null }))
vi.mock('./components/ScenarioHero', () => ({ ScenarioHero: () => null }))
vi.mock('./components/EventList', () => ({ EventList: () => null }))
vi.mock('./components/PrivateBookingForm', () => ({ PrivateBookingForm: () => <div data-testid="private-form" /> }))
vi.mock('./components/BookingPanel', () => ({ BookingPanel: () => null }))
vi.mock('./components/PrivateBookingPanel', () => ({ PrivateBookingPanel: () => <div data-testid="private-panel" /> }))
vi.mock('./components/VenueAccess', () => ({ VenueAccess: (p: { selectedStoreIds: string[] }) => { venueStores.push(p.selectedStoreIds); return null } }))
vi.mock('./components/RelatedScenarios', () => ({ RelatedScenarios: () => null }))
vi.mock('./components/StoreSelector', () => ({ StoreSelector: () => null }))
vi.mock('./components/ScenarioAbout', () => ({ ScenarioAbout: () => null }))
const toasts: string[] = []
vi.mock('@/utils/toast', () => {
  const push = (m: string) => { toasts.push(m) }
  return { showToast: { warning: push, error: push, info: push, success: push } }
})

import { ScenarioDetailPage } from './index'

// ---- 道具 ----------------------------------------------------------------
function nextMonthYmd(day: number): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, day))
  return d.toISOString().slice(0, 10)
}
const D1 = nextMonthYmd(10)
const D2 = nextMonthYmd(12)
const SLOTS = [
  { date: D1, slot: { label: '午前', startTime: '10:00', endTime: '14:00' } },
  { date: D2, slot: { label: '午後', startTime: '14:30', endTime: '18:30' } },
]
const pathOf = (slug: string) => `/org/scenario/${slug}`

let root: Root | null = null
let host: HTMLDivElement | null = null
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }

function page(slug: string) {
  return <ScenarioDetailPage scenarioId={slug} organizationSlug="org" onClose={() => undefined} />
}
function wrap(node: ReactNode, strict: boolean) {
  const inner = <MemoryRouter initialEntries={[`${pathOf('usagi')}?tab=private`]}>{node}</MemoryRouter>
  return strict ? <StrictMode>{inner}</StrictMode> : inner
}
async function render(slug: string, { strict = false } = {}) {
  window.history.replaceState(null, '', `${pathOf(slug)}?tab=private`)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(wrap(page(slug), strict)) })
  await flush()
}
async function moveTo(slug: string, { strict = false } = {}) {
  window.history.pushState(null, '', `${pathOf(slug)}?tab=private`)
  act(() => { root!.render(wrap(page(slug), strict)) })
  await flush()
}
function keep(slug: string, storeIds: string[], timeSlots = SLOTS) {
  savePrivateBookingLoginDraft({ pathname: pathOf(slug), timeSlots, storeIds, openRequest: true })
}
const confirmShown = () => !!host?.querySelector('[data-testid="confirm"]')
const lastVenue = () => venueStores[venueStores.length - 1] ?? null

beforeEach(() => {
  for (const k of Object.keys(pages)) delete pages[k]
  setScenario('usagi')
  setScenario('kitsune')
  judge = () => ({ available: true })
  holdNext = false
  held.length = 0
  fetchCalls.length = 0
  confirmOpens.length = 0
  venueStores.length = 0
  toasts.length = 0
  requireCompleteProfile.mockClear()
  sessionStorage.clear()
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  window.history.replaceState(null, '', '/')
})

describe('ログインから戻ったときの貸切の選択の戻し方', () => {
  it('基本: 預けた候補と店舗を戻し、最新の空き判定で選べると分かってから確認画面を 1 回開く', async () => {
    keep('usagi', [STORE_A])
    await render('usagi')
    expect(confirmShown()).toBe(true)
    expect(requireCompleteProfile).toHaveBeenCalledTimes(1)
    const last = confirmOpens[confirmOpens.length - 1]
    expect(last.slots).toEqual(SLOTS)
    expect(last.stores).toEqual([STORE_A])
    expect(sessionStorage.getItem(PRIVATE_BOOKING_LOGIN_DRAFT_KEY)).toBeNull()
  })

  it('1a. 作品が貸切の受付を止めていたら、確認画面を開かず知らせる', async () => {
    setScenario('usagi', { accepts_private_booking: false })
    keep('usagi', [STORE_A])
    await render('usagi')
    expect(confirmShown()).toBe(false)
    expect(requireCompleteProfile).not.toHaveBeenCalled()
    expect(toasts.join('\n')).toMatch(/受け付けていません/)
    expect(sessionStorage.getItem(PRIVATE_BOOKING_LOGIN_DRAFT_KEY)).toBeNull()
  })

  it('1b. 預けた候補が受付期間外になっていたら、確認画面を開かず選び直しを促す', async () => {
    judge = (date) => (date === D2 ? { available: false, reason: 'outside_period' } : { available: true })
    keep('usagi', [STORE_A])
    await render('usagi')
    expect(confirmShown()).toBe(false)
    expect(requireCompleteProfile).not.toHaveBeenCalled()
    expect(toasts.join('\n')).toMatch(/選び直し|確認して/)
  })

  it('2. 預けた店舗がすべて無効（停止・組織外・削除済み）なら、全店舗に広げず未選択にして確認画面を開かない', async () => {
    setScenario('usagi', {}, [store(STORE_A, 'テスト店舗A', { status: 'inactive' }), store(STORE_B, 'テスト店舗B')])
    keep('usagi', [STORE_A, STORE_GONE])
    await render('usagi')
    expect(confirmShown()).toBe(false)
    expect(requireCompleteProfile).not.toHaveBeenCalled()
    expect(lastVenue() ?? []).toEqual([])
    expect(fetchCalls.every(c => !c.storeIds.includes(STORE_B))).toBe(true)
    expect(toasts.join('\n')).toMatch(/店舗/)
  })

  it('3. 預けた店舗の一部が無効なら、有効な店舗だけ残して外したことを知らせ、確認画面は開かない', async () => {
    keep('usagi', [STORE_A, STORE_GONE])
    await render('usagi')
    expect(lastVenue()).toEqual([STORE_A])
    expect(toasts.join('\n')).toMatch(/店舗/)
    expect(confirmShown()).toBe(false)
    expect(requireCompleteProfile).not.toHaveBeenCalled()
  })

  it('4. 空き判定を待つ間に別の作品へ移ったら、前の作品の選択で確認画面を開かない', async () => {
    keep('usagi', [STORE_A])
    holdNext = true
    await render('usagi')
    expect(confirmShown()).toBe(false)
    await moveTo('kitsune')
    holdNext = false
    await act(async () => { held.splice(0).forEach(r => r()) })
    await flush()
    expect(confirmShown()).toBe(false)
    expect(requireCompleteProfile).not.toHaveBeenCalled()
  })

  it('4b. 一度戻した後に同じ画面のまま別の作品へ移っても、その作品向けの預かりは戻せる（作品ごとに数え直す）', async () => {
    keep('usagi', [STORE_A])
    await render('usagi')
    expect(confirmShown()).toBe(true)
    requireCompleteProfile.mockClear()
    keep('kitsune', [STORE_B])
    await moveTo('kitsune')
    expect(requireCompleteProfile).toHaveBeenCalledTimes(1)
    expect(confirmShown()).toBe(true)
    expect(confirmOpens[confirmOpens.length - 1].stores).toEqual([STORE_B])
  })

  it('5. StrictMode（effect が 2 回走る）でも、戻すのも確認画面を開くのも 1 回だけ', async () => {
    keep('usagi', [STORE_A])
    await render('usagi', { strict: true })
    expect(confirmShown()).toBe(true)
    expect(requireCompleteProfile).toHaveBeenCalledTimes(1)
  })

  it('6. 戻す前の空き状況では開かず、戻した店舗・月の最新の判定が出てから決める（選べなければ開かない）', async () => {
    keep('usagi', [STORE_A])
    holdNext = true
    await render('usagi')
    // 戻した店舗・月の読み取りが保留中
    expect(confirmShown()).toBe(false)
    expect(requireCompleteProfile).not.toHaveBeenCalled()
    judge = () => ({ available: false, reason: 'conflict' })
    holdNext = false
    await act(async () => { held.splice(0).forEach(r => r()) })
    await flush()
    expect(confirmShown()).toBe(false)
    expect(requireCompleteProfile).not.toHaveBeenCalled()
  })

  it('6b. 預けた候補が表示中の月に収まらない（判定を確かめられない）ときは開かない', async () => {
    const far = (() => { const now = new Date(); return new Date(Date.UTC(now.getFullYear(), now.getMonth() + 2, 5)).toISOString().slice(0, 10) })()
    keep('usagi', [STORE_A], [SLOTS[0], { date: far, slot: { label: '夜', startTime: '19:00', endTime: '23:00' } }])
    await render('usagi')
    expect(confirmShown()).toBe(false)
    expect(requireCompleteProfile).not.toHaveBeenCalled()
  })
})
