// @vitest-environment jsdom
// カレンダー・リストで、選べる最後の月より先にいたら最後の月へ戻す（2026-10-26: クインズワルツで 2 月を開いたまま札幌へ切り替えると
// 2 月のまま「読み込み中」が終わらなかった）。前回の月（sessionStorage）が残っていたときも同じ
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const seen = vi.hoisted(() => ({ calendar: [] as string[], list: [] as string[] }))
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/hooks/usePlayedScenarios', () => ({ usePlayedScenarios: () => ({ playedScenarioIds: new Set() }) }))
vi.mock('../CalendarView', () => ({ CalendarView: (p: { currentMonth: Date }) => { seen.calendar.push(ym(p.currentMonth)); return null } }))
vi.mock('../ListView', () => ({ ListView: (p: { listViewMonth: Date }) => { seen.list.push(ym(p.listViewMonth)); return null } }))
import { ClassicCalendar, ClassicList } from './ClassicViews'

const base = {
  allEvents: [], blockedSlots: [], stores: [], storeOptions: [], scenarios: [], organizationId: 'org-s', organizationSlug: 'kaku-sapporo', organizationName: '架空の札幌',
  privateBookingDeadlineDays: 7, selectedStoreIds: [], onStoreIdsChange: () => {}, hideSoldOut: false, onHideSoldOutChange: () => {}, hidePlayed: false, onHidePlayedChange: () => {},
  primaryColor: '#E60012', onCardClick: () => {}, onVisibleMonthChange: () => {}, monthStatus: () => 'ready' as const, onRetryMonth: () => {},
}
let root: ReturnType<typeof createRoot>, host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-26T10:00:00+09:00'))
  seen.calendar.length = 0; seen.list.length = 0; sessionStorage.clear()
  host = document.createElement('div'); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers() })

describe('選べる最後の月より先にいたら最後の月へ戻す', () => {
  it('カレンダー: 前回の 2027-02 が残っていても、最後の月が 2026-12 なら 12 月にする', async () => {
    sessionStorage.setItem('booking-kaku-sapporo-calendar-month', '2027-02')
    await act(async () => root.render(<ClassicCalendar {...base} lastMonth={new Date(2026, 11, 1)} />))
    expect(seen.calendar[0]).toBe('2027-02')
    expect(seen.calendar.at(-1)).toBe('2026-12')
  })
  it('リストも同じ', async () => {
    sessionStorage.setItem('booking-kaku-sapporo-list-month', '2027-02')
    await act(async () => root.render(<ClassicList {...base} lastMonth={new Date(2026, 11, 1)} />))
    expect(seen.list.at(-1)).toBe('2026-12')
  })
  it('上限がまだ分からない（再読み込み直後・最新の取得の前）間は、前回の 2 月を仮の上限 12 月へ戻さない', async () => {
    sessionStorage.setItem('booking-kaku-sapporo-calendar-month', '2027-02')
    await act(async () => root.render(<ClassicCalendar {...base} lastMonth={new Date(2026, 11, 1)} limitReady={false} />))
    expect(new Set(seen.calendar)).toEqual(new Set(['2027-02']))
    // 最新の取得で上限が 2 月と分かれば、そのまま
    await act(async () => root.render(<ClassicCalendar {...base} lastMonth={new Date(2027, 1, 1)} limitReady />))
    expect(seen.calendar.at(-1)).toBe('2027-02')
  })
  it('最後の月以内なら動かさない（2027-02 で最後が 2027-02）', async () => {
    sessionStorage.setItem('booking-kaku-sapporo-calendar-month', '2027-02')
    await act(async () => root.render(<ClassicCalendar {...base} lastMonth={new Date(2027, 1, 1)} />))
    expect(new Set(seen.calendar)).toEqual(new Set(['2027-02']))
  })
})
