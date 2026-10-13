import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { PerformanceSearchState } from '@/components/public-top/usePerformanceSearchParams'
import { indexUpcoming } from '@/components/public-top/scenarioCards'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { platformStoreOptions } from '../utils/platformStoreOptions'
import { PlatformSearchSection } from './PlatformSearchSection'

const NOW = new Date('2026-10-14T10:00:00+09:00').getTime()

function perf(over: Partial<PublicPerformance>): PublicPerformance {
  return {
    id: 'p1', date: '2026-10-17', start_time: '13:30', end_time: null, store_id: 's1', store_name: '高田馬場店', prefecture: '東京都',
    organization_id: 'o1', organization_slug: 'queens-waltz', organization_name: 'クインズワルツ', scenario_id: 'sc1', scenario_slug: 'sc1',
    title: '作品A', key_visual_url: null, player_count_min: 6, player_count_max: 8, duration_minutes: null, fee: null,
    available_seats: 5, current_participants: 1, reservation_deadline_hours: 0, genres: [], beginner_friendly: true,
    store_short_name: '高田馬場',
    ...over,
  }
}

const base: PerformanceSearchState = {
  preset: 'month', date: null, onlyAvailable: true, beginnerOnly: false, storeIds: [], area: null, view: 'cards',
}

const list = [
  perf({}),
  perf({ id: 'p2', store_id: 's2', store_name: '札幌店', store_short_name: '札幌', prefecture: '北海道', organization_id: 'o2', organization_name: '札幌店', scenario_id: 'sc2', title: '作品B' }),
]

function render(state: PerformanceSearchState = base): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PlatformSearchSection
        performances={list}
        results={list}
        range={{ from: '2026-10-14', to: '2026-10-31' }}
        isLoading={false}
        state={state}
        onChange={() => {}}
        prefectures={['東京都', '北海道']}
        today="2026-10-14"
        maxDate="2026-12-08"
        markedDates={new Set()}
        primaryColor="#E60012"
        source={{ upcoming: indexUpcoming(list, NOW), meta: () => undefined, showOrganization: true }}
        onOpen={() => {}}
      />
    </MemoryRouter>,
  )
}

const text = (html: string) => html.replace(/<[^>]+>/g, '')

describe('MMQ 全体トップ「空いている公演を探す」（見本 TopMMQ.dc.html・2026-10-14 社長指摘）', () => {
  it('独立した枠で、見出しは「空いている公演を探す」。古い「今月に入れる公演」は使わない', () => {
    const html = render()
    expect(html).toContain('id="results"')
    expect(text(html)).toContain('空いている公演を探す')
    expect(text(html)).not.toContain('に入れる公演')
  })

  it('1 行目は 今週／来週／今月／日付 の横スクロール（折り返さない）で、初期は「今月」', () => {
    const html = render()
    const row = html.match(/<div class="([^"]*)" role="group" aria-label="日付">(.*?)<\/div>/)
    expect(row?.[1]).toContain('overflow-x-auto')
    expect(row?.[1]).not.toContain('flex-wrap')
    expect([...(row?.[2] ?? '').matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]))).toEqual(['今週', '来週', '今月', '日付'])
    expect(html).toMatch(/aria-pressed="true"[^>]*>今月</)
  })

  it('2 行目は エリア／店舗／空席あり／初心者向け（折り返し可）', () => {
    const t = text(render())
    for (const label of ['エリア', '店舗 すべて', '空席あり', '初心者向け']) expect(t).toContain(label)
    expect(text(render({ ...base, area: '東京都' }))).toContain('エリア 東京都')
  })

  it('「期間 に空きのある公演 N 件」と作品カードを 2 列（PC 4 列）で全部', () => {
    const html = render()
    expect(text(html)).toContain('10/14(水)〜10/31(土) に空きのある公演 2 件')
    expect(html).toContain('grid grid-cols-2 gap-2 md:grid-cols-4')
    expect(text(html)).toContain('作品A')
    expect(text(html)).toContain('作品B')
  })

  it('店舗の選択肢は「組織 店舗」で、エリアを選ぶとそのエリアの店舗だけ', () => {
    expect(platformStoreOptions(list, null).map((o) => o.label)).toEqual(['クインズワルツ 高田馬場', '札幌店 札幌'])
    expect(platformStoreOptions(list, '北海道').map((o) => o.id)).toEqual(['s2'])
  })
})
