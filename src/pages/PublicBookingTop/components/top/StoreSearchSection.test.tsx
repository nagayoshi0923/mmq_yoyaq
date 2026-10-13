import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { PerformanceSearchState } from '@/components/public-top/usePerformanceSearchParams'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { indexUpcoming } from '@/components/public-top/scenarioCards'
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
  preset: 'month', date: null, onlyAvailable: true, beginnerOnly: false, storeIds: [], area: null, view: 'cards',
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
        source={{ upcoming: indexUpcoming(performances, NOW), meta: () => undefined }}
        onOpen={() => {}}
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
  it('チップは 今週／来週／今月／カレンダー／リスト で、初期は「今月」が選ばれている（2026-10-13 社長指示）', () => {
    const html = render([perf({})])
    expect(chipLabels(html)).toEqual(['今週', '来週', '今月', 'カレンダー', 'リスト'])
    expect(html).toMatch(/aria-pressed="true"[^>]*>今月</)
  })
  it('人数の選択が無く、空き 1 席の公演も出る（今日〜月末）', () => {
    const html = render([
      perf({ id: 'one', title: '残り1席' }),
      perf({ id: 'late', date: '2026-10-31', title: '月末の公演', scenario_id: 'sc2', scenario_slug: 'sc2' }),
      perf({ id: 'next', date: '2026-11-01', title: '来月の公演', scenario_id: 'sc3', scenario_slug: 'sc3' }),
    ])
    expect(html).not.toContain('人数')
    expect(html).toContain('10/12(月)〜10/31(土) に空きのある公演')
    expect(html).toContain('残り1席')
    expect(html).toContain('月末の公演')
    expect(html).not.toContain('来月の公演')
  })
  it('結果は折りたたまず全部並べる（「あと N 件を見る」は無い）', () => {
    const many = Array.from({ length: 30 }, (_, i) => perf({
      id: `p${i}`, title: `作品${i}`, scenario_id: `sc${i}`, scenario_slug: `sc${i}`, date: `2026-10-${String(13 + (i % 18)).padStart(2, '0')}`,
    }))
    const html = render(many)
    expect(html).toContain('<b class="text-sm text-foreground">30 件</b>')
    for (let i = 0; i < 30; i++) expect(html).toContain(`>作品${i}<`)
    expect(html).not.toContain('件を見る')
  })
  it('「今月」が 0 件なら来月に切り替える', () => {
    const html = render([perf({ id: 'next', date: '2026-11-03', title: '来月の公演' })], base, '2026-10-31')
    expect(html).toContain('11/1(日)〜11/30(月) に空きのある公演')
    expect(html).toContain('来月の公演')
  })
  it('「今週」が 0 件なら「来週」に切り替える', () => {
    const html = render([perf({ id: 'later', date: '2026-10-20', title: '来週の公演' })], { ...base, preset: 'week' })
    expect(html).toContain('10/19(月)〜10/25(日) に空きのある公演')
    expect(html).toContain('来週の公演')
  })
  it('読み込み中は切り替えない', () => {
    const html = render([], base, '2026-10-12', true)
    expect(html).toContain('10/12(月)〜10/31(土)')
  })
  it('結果は本番の作品カードを 2 列で出し、同じ作品の該当公演は 1 枚にまとめて行を色付けする', () => {
    const html = render([
      perf({ id: 'a1', title: '作品A', date: '2026-10-14' }),
      perf({ id: 'a2', title: '作品A', date: '2026-10-16', start_time: '19:00' }),
      perf({ id: 'a3', title: '作品A', date: '2026-10-28' }),
      perf({ id: 'b1', title: '作品B', scenario_id: 'sc2', scenario_slug: 'sc2', date: '2026-10-15' }),
    ], { ...base, preset: 'week' })
    expect(html).toContain('grid grid-cols-2 gap-2 md:grid-cols-4')
    expect(html.match(/>作品A</g)).toHaveLength(1)
    expect(html.match(/>作品B</g)).toHaveLength(1)
    // 作品A は該当 2 件（色付き）（行は 2 件まで。同じ作品の 10/28 は「+1件」）
    expect(html.match(/data-highlighted="true"/g)).toHaveLength(3)
    expect(html).not.toContain('10/28')
    expect(html).toContain('+1件')
    expect(html).toContain('カードを押すと作品ページが、色付きの公演を選んだ状態で開きます。')
  })
})
