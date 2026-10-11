import { describe, expect, it } from 'vitest'
import { buildTimetableDay, timetableSeatTone } from './publicTimetable'
import type { PublicPerformance } from './publicPerformanceSearch'

function perf(over: Partial<PublicPerformance>): PublicPerformance {
  return {
    id: 'e', date: '2026-10-17', start_time: '13:30', end_time: null, store_id: 's1', store_name: '高田馬場店',
    prefecture: null, organization_id: 'o', organization_slug: 'qw', organization_name: 'QW', scenario_id: 'm', scenario_slug: 'm',
    title: '作品', key_visual_url: null, player_count_min: 4, player_count_max: 8, duration_minutes: 240, fee: 5000,
    available_seats: 4, current_participants: 0, reservation_deadline_hours: 0, genres: [], beginner_friendly: false, ...over,
  }
}

describe('時間割（店舗 × 朝昼夜）', () => {
  const stores = [{ id: 's1', label: '高田馬場店' }, { id: 's2', label: 'フォレスト①' }, { id: 's3', label: '大塚店' }, { id: 's4', label: '大久保店' }]
  it('朝昼夜に分け、貸切の枠を入れ、何も無い店舗は畳む', () => {
    const day = buildTimetableDay('2026-10-17', [
      perf({ id: 'a', start_time: '09:30' }),
      perf({ id: 'b', start_time: '19:00', available_seats: 0 }),
      perf({ id: 'c', start_time: '14:00', store_id: 's3', store_name: '大塚店' }),
      perf({ id: 'x', date: '2026-10-18' }),
      perf({ id: 't', start_time: '12:00', store_id: 'tmp', store_name: '別会場' }),
    ], [{ store_id: 's2', date: '2026-10-17', start_time: '10:00' }], stores, 2)
    expect(day.rows.map((r) => r.label)).toEqual(['高田馬場店', 'フォレスト①', '大塚店', '別会場'])
    expect(day.rows[0].slots.morning).toHaveLength(1)
    expect(day.rows[0].slots.evening).toHaveLength(1)
    expect(day.rows[1].slots.morning[0]).toEqual({ kind: 'private' })
    expect(day.hidden_store_count).toBe(1)
    expect(day.total).toBe(4)
    expect(day.open).toBe(3)
  })
  it('残席の色', () => {
    expect(timetableSeatTone(5)).toBe('open')
    expect(timetableSeatTone(2)).toBe('few')
    expect(timetableSeatTone(0)).toBe('full')
  })
})
