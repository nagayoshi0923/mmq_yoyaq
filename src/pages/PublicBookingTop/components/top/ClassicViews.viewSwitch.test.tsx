// @vitest-environment jsdom
// B07（QW-20261023-001）: カレンダー ↔ リストの表示形式を切り替えても、選んだ月を保つ
// （本番: カレンダーで 12 月 → 再読み込みで 12 月のまま → リストへ切り替えると 11 月に戻っていた）
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const seen = vi.hoisted(() => ({
  calendar: [] as string[], list: [] as string[],
  calendarChange: null as null | ((d: Date) => void), listChange: null as null | ((d: Date) => void),
}))
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/hooks/usePlayedScenarios', () => ({ usePlayedScenarios: () => ({ playedScenarioIds: new Set() }) }))
vi.mock('../CalendarView', () => ({ CalendarView: (p: { currentMonth: Date; onMonthChange: (d: Date) => void }) => { seen.calendar.push(ym(p.currentMonth)); seen.calendarChange = p.onMonthChange; return null } }))
vi.mock('../ListView', () => ({ ListView: (p: { listViewMonth: Date; onMonthChange: (d: Date) => void }) => { seen.list.push(ym(p.listViewMonth)); seen.listChange = p.onMonthChange; return null } }))
import { ClassicCalendar, ClassicList } from './ClassicViews'

const base = {
  allEvents: [], blockedSlots: [], stores: [], storeOptions: [], scenarios: [], organizationId: 'org-q', organizationSlug: 'kaku-queens', organizationName: '架空のクインズ',
  privateBookingDeadlineDays: 7, selectedStoreIds: [], onStoreIdsChange: () => {}, hideSoldOut: false, onHideSoldOutChange: () => {}, hidePlayed: false, onHidePlayedChange: () => {},
  primaryColor: '#E60012', onCardClick: () => {}, onVisibleMonthChange: () => {}, monthStatus: () => 'ready' as const, onRetryMonth: () => {},
  lastMonth: new Date(2027, 2, 1), limitReady: true,
}
let root: ReturnType<typeof createRoot>, host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-03T10:00:00+09:00'))
  seen.calendar.length = 0; seen.list.length = 0; sessionStorage.clear()
  host = document.createElement('div'); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.useRealTimers() })

describe('表示形式を切り替えても選んだ月を保つ', () => {
  it('カレンダーで 12 月 → リストへ切り替えても 12 月、リストで 1 月 → カレンダーへ戻しても 1 月', async () => {
    await act(async () => root.render(<ClassicCalendar {...base} />))
    expect(seen.calendar.at(-1)).toBe('2026-11')
    await act(async () => seen.calendarChange!(new Date(2026, 11, 1)))
    expect(seen.calendar.at(-1)).toBe('2026-12')

    await act(async () => root.render(<ClassicList {...base} />))
    expect(seen.list[0]).toBe('2026-12')
    expect(new Set(seen.list)).toEqual(new Set(['2026-12']))

    await act(async () => seen.listChange!(new Date(2027, 0, 1)))
    seen.calendar.length = 0
    await act(async () => root.render(<ClassicCalendar {...base} />))
    expect(new Set(seen.calendar)).toEqual(new Set(['2027-01']))
  })

  it('再読み込み（作り直し）でも同じ月で、そこからリストへ切り替えても同じ月', async () => {
    sessionStorage.setItem('booking-kaku-queens-month', '2026-12')
    await act(async () => root.render(<ClassicCalendar {...base} />))
    expect(seen.calendar[0]).toBe('2026-12')
    await act(async () => root.render(<ClassicList {...base} />))
    expect(new Set(seen.list)).toEqual(new Set(['2026-12']))
  })

  it('上限がまだ分からない間に切り替えても、今月へ戻さない', async () => {
    sessionStorage.setItem('booking-kaku-queens-month', '2027-02')
    await act(async () => root.render(<ClassicList {...base} lastMonth={new Date(2026, 11, 1)} limitReady={false} />))
    expect(new Set(seen.list)).toEqual(new Set(['2027-02']))
    await act(async () => root.render(<ClassicCalendar {...base} lastMonth={new Date(2026, 11, 1)} limitReady={false} />))
    expect(new Set(seen.calendar)).toEqual(new Set(['2027-02']))
  })

  it('別の組織の月は持ち込まない', async () => {
    sessionStorage.setItem('booking-kaku-queens-month', '2027-01')
    await act(async () => root.render(<ClassicList {...base} organizationSlug="kaku-sapporo" organizationId="org-s" />))
    expect(seen.list[0]).toBe('2026-11')
  })

  it('保存先（sessionStorage）が使えなくても、同じタブ内の切り替えでは月を保つ', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    await act(async () => root.render(<ClassicCalendar {...base} organizationSlug="kaku-private" />))
    await act(async () => seen.calendarChange!(new Date(2027, 1, 1)))
    await act(async () => root.render(<ClassicList {...base} organizationSlug="kaku-private" />))
    expect(new Set(seen.list)).toEqual(new Set(['2027-02']))
  })

  it('書き込みだけ失敗する（容量超過など）とき、保存済みの古い月へ巻き戻さない', async () => {
    sessionStorage.setItem('booking-kaku-quota-month', '2026-11')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    await act(async () => root.render(<ClassicCalendar {...base} organizationSlug="kaku-quota" />))
    await act(async () => seen.calendarChange!(new Date(2026, 11, 1)))
    expect(sessionStorage.getItem('booking-kaku-quota-month')).toBe('2026-11')
    await act(async () => root.render(<ClassicList {...base} organizationSlug="kaku-quota" />))
    expect(new Set(seen.list)).toEqual(new Set(['2026-12']))
    // 書けるようになったら保存先が新しい月になり、控えより保存先を使う
    vi.mocked(Storage.prototype.setItem).mockRestore()
    await act(async () => seen.listChange!(new Date(2027, 0, 1)))
    expect(sessionStorage.getItem('booking-kaku-quota-month')).toBe('2027-01')
    seen.calendar.length = 0
    await act(async () => root.render(<ClassicCalendar {...base} organizationSlug="kaku-quota" />))
    expect(new Set(seen.calendar)).toEqual(new Set(['2027-01']))
  })

  describe('公開前の旧キー（表示形式ごと）からの引き継ぎ', () => {
    it('共通キーがまだ無ければ、表示中の形式の旧キーの月で始め、切り替えても保つ', async () => {
      sessionStorage.setItem('booking-kaku-queens-calendar-month', '2026-12')
      await act(async () => root.render(<ClassicCalendar {...base} />))
      expect(seen.calendar[0]).toBe('2026-12')
      expect(sessionStorage.getItem('booking-kaku-queens-month')).toBe('2026-12')
      await act(async () => root.render(<ClassicList {...base} />))
      expect(new Set(seen.list)).toEqual(new Set(['2026-12']))
    })
    it('リストの旧キーも同じ', async () => {
      sessionStorage.setItem('booking-kaku-queens-list-month', '2027-01')
      await act(async () => root.render(<ClassicList {...base} />))
      expect(seen.list[0]).toBe('2027-01')
    })
    it('共通キーがあれば旧キーより共通キーを使う', async () => {
      sessionStorage.setItem('booking-kaku-queens-month', '2027-02')
      sessionStorage.setItem('booking-kaku-queens-calendar-month', '2026-12')
      await act(async () => root.render(<ClassicCalendar {...base} />))
      expect(new Set(seen.calendar)).toEqual(new Set(['2027-02']))
    })
    it('旧カレンダーと旧リストの月が違うときは、別の形式の月を使わず表示中の形式の旧キーを使う', async () => {
      sessionStorage.setItem('booking-kaku-queens-calendar-month', '2026-12')
      sessionStorage.setItem('booking-kaku-queens-list-month', '2027-02')
      await act(async () => root.render(<ClassicList {...base} />))
      expect(seen.list[0]).toBe('2027-02')
      sessionStorage.clear()
      sessionStorage.setItem('booking-kaku-queens-calendar-month', '2026-12')
      sessionStorage.setItem('booking-kaku-queens-list-month', '2027-02')
      seen.calendar.length = 0
      await act(async () => root.render(<ClassicCalendar {...base} />))
      expect(seen.calendar[0]).toBe('2026-12')
    })
    it('別の組織の旧キーは引き継がない', async () => {
      sessionStorage.setItem('booking-kaku-queens-calendar-month', '2027-01')
      await act(async () => root.render(<ClassicCalendar {...base} organizationSlug="kaku-sapporo" organizationId="org-s" />))
      expect(seen.calendar[0]).toBe('2026-11')
    })
  })
})
