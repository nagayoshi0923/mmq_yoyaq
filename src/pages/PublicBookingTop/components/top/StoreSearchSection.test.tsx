import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { PerformanceSearchState } from '@/components/public-top/usePerformanceSearchParams'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { StoreSearchSection } from './StoreSearchSection'

vi.mock('./ClassicViews', () => ({ ClassicCalendar: () => null, ClassicList: () => null }))

function perf(over: Partial<PublicPerformance>): PublicPerformance {
  return {
    id: 'p1', date: '2026-10-14', start_time: '13:00:00', end_time: null, store_id: 's1', store_name: '馬場', prefecture: null,
    organization_id: 'o1', organization_slug: 'queens-waltz', organization_name: 'クインズワルツ', scenario_id: 'sc1', scenario_slug: 'sc1',
    title: '作品A', key_visual_url: null, player_count_min: 6, player_count_max: 8, duration_minutes: null, fee: null,
    available_seats: 1, current_participants: 7, reservation_deadline_hours: 0, genres: [], beginner_friendly: false,
    ...over,
  }
}

const base: PerformanceSearchState = {
  preset: 'week', date: null, onlyAvailable: true, beginnerOnly: false, storeIds: [], area: null, view: 'cards',
}
// 2026-10-12(月) 10:00 JST
const NOW = new Date('2026-10-12T10:00:00+09:00').getTime()

function render(performances: PublicPerformance[], state: PerformanceSearchState = base, today = '2026-10-12', isLoading = false): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <StoreSearchSection
        performances={performances}
        isLoading={isLoading}
        state={state}
        onChange={() => {}}
        storeOptions={[]}
        today={today}
        nowMs={NOW}
        primaryColor="#E60012"
        onSelect={() => {}}
        classic={{
          organizationId: 'o1', allEvents: [], blockedSlots: [], stores: [], scenarios: [], organizationSlug: 'queens-waltz',
          organizationName: 'クインズワルツ', privateBookingDeadlineDays: 7, onCardClick: () => {},
        }}
      />
    </MemoryRouter>,
  )
}

function chipLabels(html: string): string[] {
  const group = html.slice(html.indexOf('aria-label="日付・見方"'))
  return [...group.slice(0, group.indexOf('</div>')).matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
}

describe('店舗トップ「空いている公演を探す」', () => {
  it('チップは 今週／来週／今月／カレンダー／リスト で、「今週」が選ばれている', () => {
    const html = render([perf({})])
    expect(chipLabels(html)).toEqual(['今週', '来週', '今月', 'カレンダー', 'リスト'])
    expect(html).toMatch(/aria-pressed="true"[^>]*>今週</)
  })
  it('人数の選択が無く、空き 1 席の公演も出る（今日〜日曜）', () => {
    const html = render([perf({ id: 'one', title: '残り1席' }), perf({ id: 'later', date: '2026-10-20', title: '来週の公演' })])
    expect(html).not.toContain('人数')
    expect(html).toContain('10/12(月)〜10/18(日) に空きのある公演')
    expect(html).toContain('残り1席')
    expect(html).not.toContain('来週の公演')
  })
  it('「今週」が 0 件なら「来週」に切り替える', () => {
    const html = render([perf({ id: 'later', date: '2026-10-20', title: '来週の公演' })])
    expect(html).toContain('10/19(月)〜10/25(日) に空きのある公演')
    expect(html).toContain('来週の公演')
  })
  it('読み込み中は「来週」に切り替えない', () => {
    const html = render([], base, '2026-10-12', true)
    expect(html).toContain('10/12(月)〜10/18(日)')
  })
})
