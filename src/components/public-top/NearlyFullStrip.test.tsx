import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { NearlyFullStrip } from './NearlyFullStrip'
import { indexUpcoming } from './scenarioCards'

const NOW = new Date('2026-10-12T10:00:00+09:00').getTime()

function perf(over: Partial<PublicPerformance>): PublicPerformance {
  return {
    id: 'p1', date: '2026-10-20', start_time: '13:00', end_time: null, store_id: 's1', store_name: '高田馬場店', prefecture: null,
    organization_id: 'o1', organization_slug: 'queens-waltz', organization_name: 'クインズワルツ', scenario_id: 'sc1', scenario_slug: 'sc1',
    title: '作品', key_visual_url: null, player_count_min: 6, player_count_max: 8, duration_minutes: 240, fee: 5000,
    available_seats: 3, current_participants: 5, reservation_deadline_hours: 0, genres: [], beginner_friendly: false,
    store_short_name: '馬場',
    ...over,
  }
}

function render(nearly: PublicPerformance[], all: PublicPerformance[] = nearly, showOrganization = false): string {
  return renderToStaticMarkup(
    <NearlyFullStrip performances={nearly} source={{ upcoming: indexUpcoming(all, NOW), meta: () => ({ author: 'とんとん' }), showOrganization }} onOpen={() => {}} />,
  )
}

/** 本番の作品カードと同じ角なしの小さな太字チップ（本番と同じ 10px の ts-10。デザインガードのため） */
const CHIP = 'ts-10 font-bold px-1.5 py-0.5 card-narrow:px-[5px]'

describe('残りわずか（本番の作品カード）', () => {
  it('横スクロールに幅 150px の作品カードを並べ、作者・人数・時間・参加費・短い店舗名を出す', () => {
    const html = render([perf({})])
    expect(html).toContain('flex gap-2 overflow-x-auto')
    expect(html).toContain('w-[150px] shrink-0')
    expect(html).toContain('>とんとん<')
    expect(html).toContain('8人')
    expect(html).toContain('4h')
    expect(html).toContain('¥5,000〜')
    expect(html).toContain('>馬場<')
    expect(html).not.toContain('高田馬場店')
  })

  it('次回公演の行は、その残りわずかの公演が先頭（日付の早い別の公演より前）で、色付けはしない', () => {
    const nearly = perf({ id: 'near', date: '2026-10-25', available_seats: 1, current_participants: 7 })
    const earlier = perf({ id: 'early', date: '2026-10-14', available_seats: 8, current_participants: 0 })
    const html = render([nearly], [earlier, nearly])
    expect(html.indexOf('10/25')).toBeLessThan(html.indexOf('10/14'))
    expect(html).not.toContain('data-highlighted')
  })

  it('残 2 以下は「残N」を残少の色、残 3 以上は通常の色で出す', () => {
    expect(render([perf({ available_seats: 2, current_participants: 2, player_count_max: 4, player_count_min: 4 })]))
      .toContain(`${CHIP} rounded-none bg-booking-seat-low-bg text-booking-seat-low-text card-narrow:text-red-700">残2<`)
    expect(render([perf({ available_seats: 5, current_participants: 0 })]))
      .toContain(`${CHIP} rounded-none bg-booking-accent-light text-booking-accent card-narrow:bg-green-100 card-narrow:text-green-700">残5<`)
  })

  it('最低人数に達していて満席でなければ「開催決定」を出す', () => {
    const html = render([perf({ available_seats: 2, current_participants: 6 })])
    expect(html).toContain(`${CHIP} bg-booking-confirmed-bg text-booking-confirmed-text rounded-none">開催決定<`)
    expect(html).not.toContain('成立間近')
  })

  it('最低人数まで残り 1〜しきい値なら画像の左下に「成立間近！」の帯を出す', () => {
    const html = render([perf({ available_seats: 5, current_participants: 3 })])
    expect(html).toContain('absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-white bg-booking-danger">成立間近！<')
  })

  it('全体トップでは画像の左上に組織名の帯を出す（店舗トップでは出さない）', () => {
    expect(render([perf({})], undefined, true)).toContain('bg-black/55 px-2 py-0.5 ts-10 font-bold text-white">クインズワルツ<')
    expect(render([perf({})])).not.toContain('bg-black/55')
  })
})
