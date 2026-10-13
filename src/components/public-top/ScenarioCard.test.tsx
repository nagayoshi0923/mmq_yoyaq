import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { ScenarioCard } from './ScenarioCard'
import { groupPerformancesIntoCards, indexUpcoming, scenarioBrowseCard, scenarioCardRibbon, toCardEvent, type ScenarioCardData } from './scenarioCards'

const NOW = new Date('2026-10-12T10:00:00+09:00').getTime()

function perf(over: Partial<PublicPerformance>): PublicPerformance {
  return {
    id: 'p1', date: '2026-10-20', start_time: '13:00', end_time: null, store_id: 's1', store_name: '大塚店', prefecture: null,
    organization_id: 'o1', organization_slug: 'queens-waltz', organization_name: 'クインズワルツ', scenario_id: 'sc1', scenario_slug: 'sc-slug',
    title: '作品', key_visual_url: null, player_count_min: 6, player_count_max: 8, duration_minutes: 210, fee: 4500,
    available_seats: 6, current_participants: 2, reservation_deadline_hours: 0, genres: [], beginner_friendly: false,
    store_short_name: '大塚', store_color: 'blue',
    ...over,
  }
}

function card(over: Partial<ScenarioCardData> = {}, events: PublicPerformance[] = []): ScenarioCardData {
  return { ...scenarioBrowseCard({ id: 'sc1', title: '作品', key_visual_url: null, player_count_min: 6, player_count_max: 8 }, events, '/x'), ...over }
}

const render = (c: ScenarioCardData) => renderToStaticMarkup(<ScenarioCard card={c} onOpen={() => {}} />)
const NOW_DATE = new Date('2026-10-13T00:00:00+09:00')

describe('作品カードの帯（成立間近！＞募集延長中！＞おすすめ＞ロングセラー＞人気）', () => {
  const nearly = perf({ current_participants: 4 }) // 最低 6 人まであと 2
  const extended = perf({ is_extended: true })
  const old = '2024-01-01'
  it('優先順どおりに 1 つだけ選ぶ', () => {
    const all = { is_recommended: true, release_date: old, favorite_count: 200 }
    expect(scenarioCardRibbon(card(all, [nearly, extended]), NOW_DATE)?.label).toBe('成立間近！')
    expect(scenarioCardRibbon(card(all, [{ ...extended, current_participants: 0 }]), NOW_DATE)?.label).toBe('募集延長中！')
    expect(scenarioCardRibbon(card(all), NOW_DATE)?.label).toBe('おすすめ')
    expect(scenarioCardRibbon(card({ ...all, is_recommended: false }), NOW_DATE)?.label).toBe('ロングセラー')
    expect(scenarioCardRibbon(card({ favorite_count: 100 }), NOW_DATE)?.label).toBe('人気')
    expect(scenarioCardRibbon(card({ favorite_count: 99, release_date: '2026-01-01' }), NOW_DATE)).toBeNull()
  })
  it('帯は画像の左下に本番の色で出す', () => {
    expect(render(card({ is_recommended: true }))).toContain('absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-white bg-booking-primary">おすすめ<')
    expect(render(card({ release_date: old }))).toContain('text-black bg-booking-accent">ロングセラー<')
  })
})

describe('作品カードの中身', () => {
  it('人数・時間・参加費、次回公演 2 件（日付・曜日・時刻・短い店舗名・残席）と「+N件」', () => {
    const events = [
      perf({ id: 'e1', date: '2026-10-17' }),
      perf({ id: 'e2', date: '2026-10-18', available_seats: 0, current_participants: 8 }),
      perf({ id: 'e3', date: '2026-10-19' }),
    ]
    const html = render(card({ duration_minutes: 210, fee: 4500 }, events))
    expect(html).toContain('6-8人')
    expect(html).toContain('3h30m')
    expect(html).toContain('¥4,500〜')
    expect(html).toContain('10/17<span class="ml-0.5 font-normal text-blue-500">(土)')
    expect(html).toContain('10/18<span class="ml-0.5 font-normal text-red-500">(日)')
    expect(html).toContain('>大塚<')
    expect(html).toContain('>満席<')
    expect(html).not.toContain('10/19')
    expect(html).toContain('+1件')
    expect(html).toContain('rounded-none border border-gray-200 bg-white')
  })
})

describe('狭いカード（幅 200px 未満）の決まった形', () => {
  const html = render(card({ duration_minutes: 270, fee: 5000 }, [perf({ id: 'e1', date: '2026-10-18', start_time: '18:30', available_seats: 2 })]))
  it('カードの幅で切り替える（コンテナクエリ）', () => {
    expect(html).toContain('[container-type:inline-size] [container-name:scenario-card]')
  })
  it('人数・時間・参加費はアイコンを外し中黒区切りの 1 行、参加費だけ省略', () => {
    expect(html).toContain('card-narrow:flex-nowrap')
    expect(html).toContain('card-narrow:ts-10')
    expect(html.match(/hidden card-narrow:inline">・</g)).toHaveLength(2)
    expect(html).toContain('card-narrow:min-w-0 card-narrow:truncate')
  })
  it('次回公演は 1 行目に日付・時刻、2 行目に店舗と残席の 2 行', () => {
    expect(html).toContain('card-narrow:grid card-narrow:grid-cols-[minmax(0,1fr)_auto]')
    expect(html).toMatch(/card-narrow:col-span-2">.*10\/18.*18:30<\/span><\/span><span class="min-w-0 truncate text-muted-foreground">大塚<\/span>.*残2/)
  })
})

describe('探す結果のまとめ方', () => {
  const a1 = perf({ id: 'a1', date: '2026-10-14' })
  const a2 = perf({ id: 'a2', date: '2026-10-16' })
  const a3 = perf({ id: 'a3', date: '2026-10-15' })
  const other = perf({ id: 'x', organization_id: 'o2', organization_slug: 'sapporo', organization_name: '札幌店', date: '2026-10-14' })
  const upcoming = indexUpcoming([a1, a2, a3, other], NOW)

  it('同じ組織の同じ作品は 1 枚にまとめ、該当行を先頭にして色付け、押すとその公演を選んだ作品ページへ', () => {
    const cards = groupPerformancesIntoCards([a1, other, a2], upcoming, { highlight: true, meta: () => undefined, showOrganization: true })
    expect(cards.map((c) => c.organization_badge)).toEqual(['クインズワルツ', '札幌店'])
    expect(cards[0].events.map((e) => [e.id, e.highlighted])).toEqual([['a1', true], ['a2', true], ['a3', false]])
    expect(cards[0].path).toBe('/queens-waltz/scenario/sc-slug?event=a1')
    expect(cards[0].total_events_count).toBe(3)
  })

  it('該当行は薄いオレンジ（見本の #fff7ed）で、該当が 3 件以上なら 4 件まで行を出す', () => {
    const many = [1, 2, 3, 4, 5].map((d) => perf({ id: `m${d}`, date: `2026-10-1${d + 3}` }))
    const [c] = groupPerformancesIntoCards(many, indexUpcoming(many, NOW), { highlight: true, meta: () => undefined })
    const html = render(c)
    expect(html.match(/data-highlighted="true" class="[^"]*bg-orange-50/g)).toHaveLength(4)
    expect(html).toContain('+1件')
  })

  it('店舗名はお客様向けの短い名前', () => {
    expect(toCardEvent(perf({ store_short_name: 'フォレスト①' })).store_name).toBe('フォレスト①')
    expect(toCardEvent(perf({ store_short_name: undefined })).store_name).toBe('大塚店')
  })
})
