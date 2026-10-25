import { describe, expect, it } from 'vitest'
import {
  DATE_PRESETS,
  datePresetRange,
  datesWithOpenings,
  describeDateRange,
  endOfJstMonth,
  DEFAULT_DATE_PRESET,
  parseDatePreset,
  upcomingRange,
  resolvePresetRange,
  formatDurationJa,
  isBookableNow,
  nearlyFullPerformances,
  performanceDetailPath,
  searchPerformances,
  seatState,
  todayJst,
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
  it('チップは 今週／来週（「今月」は 2026-10-25 社長指示で外した）、初期は今日から 30 日', () => {
    expect(DATE_PRESETS.map((d) => d.label)).toEqual(['今週', '来週'])
    expect(DEFAULT_DATE_PRESET).toBe('upcoming')
  })
  it('今週は今日からその週の日曜まで（両端を含む）', () => {
    // 2026-10-12 は月曜
    expect(datePresetRange('week', '2026-10-12')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(datePresetRange('week', '2026-10-14')).toEqual({ from: '2026-10-14', to: '2026-10-18' })
    expect(datePresetRange('week', '2026-10-17')).toEqual({ from: '2026-10-17', to: '2026-10-18' })
  })
  it('今週: 日曜に開くと当日だけ', () => {
    expect(datePresetRange('week', '2026-10-18')).toEqual({ from: '2026-10-18', to: '2026-10-18' })
  })
  it('今週: JST で日付が変わる（日曜 23:30 UTC は月曜 JST）', () => {
    const today = todayJst(new Date('2026-10-18T15:30:00Z'))
    expect(today).toBe('2026-10-19')
    expect(datePresetRange('week', today)).toEqual({ from: '2026-10-19', to: '2026-10-25' })
  })
  it('来週は次の月曜〜日曜（月曜・水曜・日曜に開いた場合）', () => {
    expect(datePresetRange('nextweek', '2026-10-12')).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    expect(datePresetRange('nextweek', '2026-10-14')).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    expect(datePresetRange('nextweek', '2026-10-18')).toEqual({ from: '2026-10-19', to: '2026-10-25' })
  })
  it('「今週」が 0 件なら「来週」に切り替える', () => {
    expect(resolvePresetRange('week', '2026-10-14', null, () => 3)).toEqual({ from: '2026-10-14', to: '2026-10-18' })
    expect(resolvePresetRange('week', '2026-10-14', null, () => 0)).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    // 日曜の夜: 当日の公演は締切済みで 0 件 → 来週
    const sundayNight = new Date('2026-10-18T22:00:00+09:00').getTime()
    const ps = [perf({ id: 'sun', date: '2026-10-18', start_time: '13:30' }), perf({ id: 'tue', date: '2026-10-20' })]
    const count = (r: { from: string; to: string }) => searchPerformances(ps, { range: r, onlyAvailable: true }, sundayNight).length
    expect(resolvePresetRange('week', '2026-10-18', null, count)).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    // 来週・日付は切り替えない
    expect(resolvePresetRange('nextweek', '2026-10-14', null, () => 0)).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    expect(resolvePresetRange('date', '2026-10-14', '2026-10-20', () => 0)).toEqual({ from: '2026-10-20', to: '2026-10-20' })
  })
  it('今日から 30 日（今日を含む）。「もっと見る」1 回ごとに 30 日足す。月末・年末・うるう年をまたぐ（JST の暦日）', () => {
    expect(datePresetRange('upcoming', '2026-10-25')).toEqual({ from: '2026-10-25', to: '2026-11-23' })
    expect(upcomingRange('2026-10-25', 2)).toEqual({ from: '2026-10-25', to: '2026-12-23' })
    expect(upcomingRange('2026-12-20', 1)).toEqual({ from: '2026-12-20', to: '2027-01-18' })
    expect(upcomingRange('2028-02-01', 1)).toEqual({ from: '2028-02-01', to: '2028-03-01' })
    expect(upcomingRange('2026-10-25', 0)).toEqual({ from: '2026-10-25', to: '2026-11-23' })
    expect(resolvePresetRange('upcoming', '2026-10-25', null, () => 0, 3)).toEqual({ from: '2026-10-25', to: '2027-01-22' })
  })
  it('「今月」が 0 件なら来月（1 日〜月末）に切り替える', () => {
    expect(resolvePresetRange('month', '2026-10-11', null, () => 3)).toEqual({ from: '2026-10-11', to: '2026-10-31' })
    expect(resolvePresetRange('month', '2026-10-31', null, () => 0)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(resolvePresetRange('month', '2026-12-31', null, () => 0)).toEqual({ from: '2027-01-01', to: '2027-01-31' })
    expect(resolvePresetRange('month', '2027-01-31', null, () => 0)).toEqual({ from: '2027-02-01', to: '2027-02-28' })
  })
  it('古い URL の ?when= は「今週」として読む', () => {
    expect(parseDatePreset('weekend')).toBe('week')
    expect(parseDatePreset('today')).toBe('week')
    expect(parseDatePreset('tomorrow')).toBe('week')
    expect(parseDatePreset('week')).toBe('week')
    expect(parseDatePreset('nextweek')).toBe('nextweek')
    // 古い ?when=month は既定（今日から 30 日）で開く
    expect(parseDatePreset('month')).toBe('upcoming')
    expect(parseDatePreset('upcoming')).toBe('upcoming')
    expect(parseDatePreset('date')).toBe('date')
    expect(parseDatePreset('xyz')).toBeNull()
    expect(parseDatePreset(null)).toBeNull()
  })
  it('今月は今日から今月末（両端を含む）', () => {
    expect(datePresetRange('month', '2026-10-12')).toEqual({ from: '2026-10-12', to: '2026-10-31' })
    expect(datePresetRange('month', '2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(datePresetRange('month', '2027-02-10')).toEqual({ from: '2027-02-10', to: '2027-02-28' })
    expect(endOfJstMonth('2028-02-03')).toBe('2028-02-29')
  })
  it('今月: 月末に開くと今日だけ', () => {
    expect(datePresetRange('month', '2026-10-31')).toEqual({ from: '2026-10-31', to: '2026-10-31' })
    expect(datePresetRange('month', '2026-12-31')).toEqual({ from: '2026-12-31', to: '2026-12-31' })
  })
  it('今月: JST で月が変わる（UTC ではまだ前月の 11/1 00:30 JST は 11 月）', () => {
    const today = todayJst(new Date('2026-10-31T15:30:00Z'))
    expect(today).toBe('2026-11-01')
    expect(datePresetRange('month', today)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    const late = todayJst(new Date('2026-10-31T14:59:00Z'))
    expect(datePresetRange('month', late)).toEqual({ from: '2026-10-31', to: '2026-10-31' })
  })
  it('来週: 日曜に開くと明日の月曜から', () => {
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
    expect(seatState(perf({ available_seats: 2, current_participants: 4, player_count_min: 6 })).label).toBe('4/6・残少・成立間近')
    expect(seatState(perf({ available_seats: 3, current_participants: 5, player_count_min: 4 })).label).toBe('5/8・残少')
    expect(seatState(perf({ available_seats: 6, current_participants: 2 })).label).toBe('2/8')
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
  it('日付順。空席ありは 1 名以上の空きがあれば出す（人数では絞らない）', () => {
    expect(searchPerformances(list, { range, onlyAvailable: true }, NOW).map((p) => p.id)).toEqual(['c', 'a', 'b'])
    expect(searchPerformances([...list, perf({ id: 'full', available_seats: 0 })], { range, onlyAvailable: true }, NOW).map((p) => p.id)).toEqual(['c', 'a', 'b'])
    expect(searchPerformances([...list, perf({ id: 'full', available_seats: 0 })], { range, onlyAvailable: false }, NOW).map((p) => p.id)).toEqual(['c', 'full', 'a', 'b'])
  })
  it('空き 1 席の公演も出る', () => {
    const one = perf({ id: 'one', available_seats: 1, current_participants: 7 })
    expect(searchPerformances([one], { range, onlyAvailable: true }, NOW).map((p) => p.id)).toEqual(['one'])
    expect(datesWithOpenings([one, perf({ id: 'x', date: '2026-10-20', available_seats: 0 })], NOW)).toEqual(new Set(['2026-10-17']))
  })
  it('店舗・初心者向けで絞る', () => {
    expect(searchPerformances(list, { range, onlyAvailable: true, storeIds: ['s2'] }, NOW).map((p) => p.id)).toEqual(['a'])
    expect(searchPerformances(list, { range, onlyAvailable: true, beginnerOnly: true }, NOW).map((p) => p.id)).toEqual(['c'])
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
  it('公演だけを付ける（人数は作品ページの既定に任せる）', () => {
    expect(performanceDetailPath(perf({ id: 'e9', available_seats: 2 }))).toBe('/queens-waltz/scenario/white-rabbit?event=e9')
  })
  it('所要時間', () => {
    expect(formatDurationJa(240)).toBe('4 時間')
    expect(formatDurationJa(210)).toBe('3.5 時間')
    expect(formatDurationJa(160)).toBe('2 時間 40 分')
  })
})
