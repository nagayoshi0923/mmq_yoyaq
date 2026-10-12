import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { NearlyFullStrip } from './NearlyFullStrip'

function perf(over: Partial<PublicPerformance>): PublicPerformance {
  return {
    id: 'p1', date: '2026-10-20', start_time: '13:00:00', end_time: null, store_id: 's1', store_name: '馬場', prefecture: null,
    organization_id: 'o1', organization_slug: 'queens-waltz', organization_name: 'クインズワルツ', scenario_id: 'sc1', scenario_slug: 'sc1',
    title: '作品', key_visual_url: null, player_count_min: 6, player_count_max: 8, duration_minutes: null, fee: null,
    available_seats: 3, current_participants: 5, reservation_deadline_hours: 0, genres: [], beginner_friendly: false,
    ...over,
  }
}

function render(p: PublicPerformance): string {
  return renderToStaticMarkup(<NearlyFullStrip performances={[p]} onSelect={() => {}} />)
}

/** 本番の作品カードと同じ角なしの小さな太字チップ */
const CHIP = 'text-[10px] font-bold px-1.5 py-0.5'

describe('NearlyFullStrip の残席チップ（本番の作品カードの見た目）', () => {
  it('満席は「満席」のチップ（満席の色）で、開催決定・成立間近は出さない', () => {
    const html = render(perf({ available_seats: 0, current_participants: 8 }))
    expect(html).toContain(`${CHIP} rounded-none bg-booking-seat-full-bg text-booking-seat-full-text">満席<`)
    expect(html).not.toContain('開催決定')
    expect(html).not.toContain('成立間近')
    expect(html).not.toContain('キャンセル待ち')
  })

  it('残 2 以下は「残N」を残少の色で出す', () => {
    const html = render(perf({ available_seats: 2, current_participants: 2, player_count_max: 4, player_count_min: 4 }))
    expect(html).toContain(`${CHIP} rounded-none bg-booking-seat-low-bg text-booking-seat-low-text">残2<`)
  })

  it('残 3 以上は「残N」を通常の色で出す', () => {
    const html = render(perf({ available_seats: 5, current_participants: 0 }))
    expect(html).toContain(`${CHIP} rounded-none bg-booking-accent-light text-booking-accent">残5<`)
    expect(html).not.toContain('開催決定')
    expect(html).not.toContain('成立間近')
  })

  it('最低人数に達していて満席でなければ「開催決定」を出す', () => {
    const html = render(perf({ available_seats: 2, current_participants: 6 }))
    expect(html).toContain(`${CHIP} bg-booking-confirmed-bg text-booking-confirmed-text rounded-none">開催決定<`)
    expect(html).toContain('>残2<')
    expect(html).not.toContain('成立間近')
  })

  it('最低人数まで残り 1〜しきい値なら画像の左下に「成立間近！」の帯を出す', () => {
    // 最低 6 人（しきい値 3）で 3 人予約済み → あと 3 人
    const html = render(perf({ available_seats: 5, current_participants: 3 }))
    expect(html).toContain('absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-white bg-booking-danger">成立間近！<')
    expect(html).not.toContain('開催決定')
    // 最低 4 人（しきい値 2）で 1 人予約済み → あと 3 人は対象外
    expect(render(perf({ player_count_min: 4, player_count_max: 6, available_seats: 5, current_participants: 1 }))).not.toContain('成立間近')
  })
})
