import { describe, expect, it } from 'vitest'
import {
  calendarDaySummaries,
  datePresetRange,
  describeDateRange,
  formatDurationJa,
  isBookableNow,
  nearlyFullPerformances,
  performanceDetailPath,
  searchPerformances,
  seatState,
  type PublicPerformance,
} from './publicPerformanceSearch'

function perf(over: Partial<PublicPerformance>): PublicPerformance {
  return {
    id: 'e1', date: '2026-10-17', start_time: '13:30', end_time: '17:30', store_id: 's1', store_name: '高田馬場店',
    prefecture: '東京都', organization_id: 'o1', organization_slug: 'queens-waltz', organization_name: 'クインズワルツ',
    scenario_id: 'm1', scenario_slug: 'white-rabbit', title: '白いウサギ', key_visual_url: null,
    player_count_min: 6, player_count_max: 8, duration_minutes: 240, fee: 5000, available_seats: 6,
    current_participants: 2, reservation_deadline_hours: 0, genres: [], beginner_friendly: false, ...over,
  }
}

// 2026-10-11(日) 12:00 JST
const NOW = new Date('2026-10-11T12:00:00+09:00').getTime()

describe('日付チップの範囲', () => {
  it('平日の「今週末」は次の土日', () => {
    expect(datePresetRange('weekend', '2026-10-14')).toEqual({ from: '2026-10-17', to: '2026-10-18' })
  })
  it('土曜は今日と明日、日曜は次の土日', () => {
    expect(datePresetRange('weekend', '2026-10-17')).toEqual({ from: '2026-10-17', to: '2026-10-18' })
    expect(datePresetRange('weekend', '2026-10-11')).toEqual({ from: '2026-10-17', to: '2026-10-18' })
  })
  it('来週は次の月曜〜日曜', () => {
    expect(datePresetRange('nextweek', '2026-10-14')).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    expect(datePresetRange('nextweek', '2026-10-11')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
  })
  it('日付を選ぶ（過去日は今日に寄せる）', () => {
    expect(datePresetRange('date', '2026-10-11', '2026-10-20')).toEqual({ from: '2026-10-20', to: '2026-10-20' })
    expect(datePresetRange('date', '2026-10-11', '2026-10-01')).toEqual({ from: '2026-10-11', to: '2026-10-11' })
  })
  it('見出し', () => {
    expect(describeDateRange({ from: '2026-10-17', to: '2026-10-18' })).toBe('10/17(土)・10/18(日)')
    expect(describeDateRange({ from: '2026-10-19', to: '2026-10-25' })).toBe('10/19(月)〜10/25(日)')
  })
})

describe('残席の言い方', () => {
  it('満席・成立間近・残りわずか', () => {
    expect(seatState(perf({ available_seats: 0 })).label).toBe('満席・キャンセル待ち')
    expect(seatState(perf({ available_seats: 2, current_participants: 4, player_count_min: 6 })).label).toBe('残 2・成立間近')
    expect(seatState(perf({ available_seats: 3, current_participants: 7, player_count_min: 6, player_count_max: 10 })).kind).toBe('few')
    expect(seatState(perf({ available_seats: 6 })).kind).toBe('available')
  })
})

describe('公演の検索', () => {
  const list = [
    perf({ id: 'b', date: '2026-10-18', start_time: '10:00', available_seats: 1 }),
    perf({ id: 'a', date: '2026-10-17', start_time: '19:30', store_id: 's2' }),
    perf({ id: 'c', date: '2026-10-17', start_time: '13:30', beginner_friendly: true }),
    perf({ id: 'past', date: '2026-10-11', start_time: '11:00' }),
    perf({ id: 'deadline', date: '2026-10-11', start_time: '14:00', reservation_deadline_hours: 3 }),
  ]
  const range = { from: '2026-10-17', to: '2026-10-18' }
  it('日付順、空席あり・人数で絞る', () => {
    expect(searchPerformances(list, { range, people: 2, onlyAvailable: true }, NOW).map((p) => p.id)).toEqual(['c', 'a'])
    expect(searchPerformances(list, { range, people: 2, onlyAvailable: false }, NOW).map((p) => p.id)).toEqual(['c', 'a', 'b'])
  })
  it('店舗・初心者向けで絞る', () => {
    expect(searchPerformances(list, { range, people: 1, onlyAvailable: true, storeIds: ['s2'] }, NOW).map((p) => p.id)).toEqual(['a'])
    expect(searchPerformances(list, { range, people: 1, onlyAvailable: true, beginnerOnly: true }, NOW).map((p) => p.id)).toEqual(['c'])
  })
  it('開始・予約締切を過ぎた公演は出さない', () => {
    expect(isBookableNow(perf({ date: '2026-10-11', start_time: '11:00' }), NOW)).toBe(false)
    expect(isBookableNow(perf({ date: '2026-10-11', start_time: '14:00', reservation_deadline_hours: 3 }), NOW)).toBe(false)
    expect(isBookableNow(perf({ date: '2026-10-11', start_time: '16:00', reservation_deadline_hours: 3 }), NOW)).toBe(true)
  })
  it('残りわずかは日付順（満席は出さない）', () => {
    const nearly = nearlyFullPerformances([
      perf({ id: 'late', date: '2026-10-22', available_seats: 1 }),
      perf({ id: 'full', date: '2026-10-12', available_seats: 0 }),
      perf({ id: 'early', date: '2026-10-12', available_seats: 3 }),
      perf({ id: 'roomy', date: '2026-10-12', available_seats: 6 }),
    ], NOW)
    expect(nearly.map((p) => p.id)).toEqual(['early', 'late'])
  })
})

describe('作品ページへの URL', () => {
  it('公演と人数を付ける（人数は残席まで）', () => {
    expect(performanceDetailPath(perf({ id: 'e9', available_seats: 2 }), 4)).toBe('/queens-waltz/scenario/white-rabbit?event=e9&count=2')
    expect(performanceDetailPath(perf({ id: 'e9', available_seats: 0 }), 3)).toBe('/queens-waltz/scenario/white-rabbit?event=e9&count=3')
  })
  it('所要時間', () => {
    expect(formatDurationJa(240)).toBe('4 時間')
    expect(formatDurationJa(210)).toBe('3.5 時間')
    expect(formatDurationJa(160)).toBe('2 時間 40 分')
  })
})

describe('カレンダー表示の日ごとのまとめ', () => {
  it('満席も数え、空きのある公演数を分ける。店舗の絞り込みも効く', () => {
    const list = [
      perf({ id: 'a', date: '2026-10-17', available_seats: 4 }),
      perf({ id: 'b', date: '2026-10-17', available_seats: 0 }),
      perf({ id: 'c', date: '2026-10-18', available_seats: 1 }),
      perf({ id: 'd', date: '2026-10-18', available_seats: 5, store_id: 's2' }),
    ]
    const range = { from: '2026-10-01', to: '2026-10-31' }
    const all = calendarDaySummaries(list, { range, people: 2 }, NOW)
    expect(all.get('2026-10-17')).toEqual({ count: 2, open: 1 })
    expect(all.get('2026-10-18')).toEqual({ count: 2, open: 1 })
    const s1 = calendarDaySummaries(list, { range, people: 2, storeIds: ['s1'] }, NOW)
    expect(s1.get('2026-10-18')).toEqual({ count: 1, open: 0 })
  })
})
