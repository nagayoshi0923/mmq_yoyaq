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
  preset: 'upcoming', date: null, onlyAvailable: true, beginnerOnly: false, storeIds: [], area: null, view: 'cards', windows: 1,
}
// 2026-10-12(月) 10:00 JST
const NOW = new Date('2026-10-12T10:00:00+09:00').getTime()

interface More { windows?: number; moreUntil?: string | null; extraState?: 'ready' | 'loading' | 'error' }
function render(performances: PublicPerformance[], state: PerformanceSearchState = base, today = '2026-10-12', isLoading = false, more: More = {}): string {
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
        windows={more.windows ?? 1}
        onMore={() => {}}
        moreUntil={more.moreUntil ?? null}
        extraState={more.extraState ?? 'ready'}
        onRetryExtra={() => {}}
        classic={{
          organizationId: 'o1', allEvents: [], blockedSlots: [], stores: [], scenarios: [], organizationSlug: 'queens-waltz',
          organizationName: 'クインズワルツ', privateBookingDeadlineDays: 7, onCardClick: () => {},
          lastMonth: null, onVisibleMonthChange: () => {}, monthStatus: () => 'ready', onRetryMonth: () => {},
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
  it('チップは 今週／来週／カレンダー／リスト（「今月」は無い。2026-10-25 社長指示）。初期はどのチップも選ばず今日から 30 日', () => {
    const html = render([perf({})])
    expect(chipLabels(html)).toEqual(['今週', '来週', 'カレンダー', 'リスト'])
    const group = html.slice(html.indexOf('aria-label="日付・見方"'))
    expect(group.slice(0, group.indexOf('</div>'))).not.toMatch(/aria-pressed="true"/)
    expect(html).toContain('10/12(月)〜11/10(火) に空きのある公演')
  })

  it('日付・見方のチップは 1 行の横スクロール（折り返さない。2026-10-14 社長指摘）', () => {
    const html = render([perf({})])
    const tag = html.match(/<div class="([^"]*)" role="group" aria-label="日付・見方">/)
    expect(tag?.[1]).toContain('overflow-x-auto')
    expect(tag?.[1]).not.toContain('flex-wrap')
  })
  it('人数の選択が無く、空き 1 席の公演も出る。今日から 30 日（月をまたいで 11/10 まで）で、31 日目は出さない', () => {
    const html = render([
      perf({ id: 'one', title: '残り1席' }),
      perf({ id: 'late', date: '2026-10-31', title: '月末の公演', scenario_id: 'sc2', scenario_slug: 'sc2' }),
      perf({ id: 'next', date: '2026-11-01', title: '来月の公演', scenario_id: 'sc3', scenario_slug: 'sc3' }),
      perf({ id: 'd30', date: '2026-11-10', title: '30日目の公演', scenario_id: 'sc4', scenario_slug: 'sc4' }),
      perf({ id: 'd31', date: '2026-11-11', title: '31日目の公演', scenario_id: 'sc5', scenario_slug: 'sc5' }),
    ])
    expect(html).not.toContain('人数')
    expect(html).toContain('10/12(月)〜11/10(火) に空きのある公演')
    expect(html).toContain('残り1席')
    expect(html).toContain('月末の公演')
    expect(html).toContain('来月の公演')
    expect(html).toContain('30日目の公演')
    expect(html).not.toContain('31日目の公演')
  })
  it('「もっと見る」は、先に予約を受け付けている公開の公演があるときだけ。押した回数分 30 日ずつ足す（件数では切らない）', () => {
    const list = [perf({ id: 'd31', date: '2026-11-11', title: '31日目の公演', scenario_id: 'sc5', scenario_slug: 'sc5' })]
    expect(render(list, base, '2026-10-12', false, { moreUntil: '2027-02-07' })).toContain('もっと見る（次の 30 日）')
    expect(render(list, base, '2026-10-12', false, { moreUntil: '2026-11-10' })).not.toContain('もっと見る')
    expect(render(list, base, '2026-10-12', false, { moreUntil: null })).not.toContain('もっと見る')
    const two = render(list, base, '2026-10-12', false, { windows: 2, moreUntil: '2027-02-07' })
    expect(two).toContain('10/12(月)〜12/10(木) に空きのある公演')
    expect(two).toContain('31日目の公演')
    // 今週・来週では出さない
    expect(render(list, { ...base, preset: 'week' }, '2026-10-12', false, { moreUntil: '2027-02-07' })).not.toContain('もっと見る')
  })
  it('先の月を読み足している途中は「読み込み中」、読めなかったら再読み込み（空と見せない）', () => {
    expect(render([], base, '2026-10-12', false, { windows: 4, extraState: 'loading' })).toContain('先の公演を読み込み中')
    const err = render([], base, '2026-10-12', false, { windows: 4, extraState: 'error' })
    expect(err).toContain('先の公演を読み込めませんでした')
    expect(err).toContain('もう一度読み込む')
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
  it('月末・年末をまたぐ 30 日（12/20 から 1/18 まで）', () => {
    const html = render([perf({ id: 'ny', date: '2027-01-18', title: '年明けの公演' })], base, '2026-12-20')
    expect(html).toContain('12/20(日)〜1/18(月) に空きのある公演')
    expect(html).toContain('年明けの公演')
  })
  it('「今週」が 0 件なら「来週」に切り替える', () => {
    const html = render([perf({ id: 'later', date: '2026-10-20', title: '来週の公演' })], { ...base, preset: 'week' })
    expect(html).toContain('10/19(月)〜10/25(日) に空きのある公演')
    expect(html).toContain('来週の公演')
  })
  it('読み込み中は切り替えない', () => {
    const html = render([], { ...base, preset: 'week' }, '2026-10-12', true)
    expect(html).toContain('10/12(月)〜10/18(日)')
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
