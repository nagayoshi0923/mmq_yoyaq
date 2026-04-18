import { useState, useCallback, useMemo } from 'react'
import { useLocalState } from '@/hooks/useLocalState'
import { salesApi } from '@/lib/api'
import { logger } from '@/utils/logger'
import {
  getThisMonthRangeJST,
  getLastMonthRangeJST,
  getThisWeekRangeJST,
  getLastWeekRangeJST,
  getPastDaysRangeJST,
  getThisYearRangeJST,
  getLastYearRangeJST
} from '@/utils/dateUtils'

export interface OpenEventItem {
  id: string
  date: string
  start_time: string | null
  scenario: string | null
  scenario_master_id: string | null
  capacity: number | null
  max_participants: number | null
  current_participants: number | null
  is_cancelled: boolean
  created_at: string
  store_id: string | null
}

/** max_participants が未設定の場合は capacity にフォールバック */
function effectiveMax(event: OpenEventItem): number | null {
  return event.max_participants ?? event.capacity
}

interface ReservationItem {
  id: string
  schedule_event_id: string
  created_at: string
  participant_count: number | null
  status: string
}

export interface OpenEventStats {
  totalEvents: number
  fullEvents: number     // 満席になった公演数
  fullRate: number       // 満席率 (%)
  avgFillRate: number    // 平均充填率 (%)
  avgDaysToFull: number  // 平均満席日数（満席イベントのみ）
}

export interface MonthlyBreakdown {
  month: string          // YYYY-MM
  totalEvents: number
  fullEvents: number
  fullRate: number
}

export interface WeekdayBreakdown {
  weekday: string        // 月〜日
  totalEvents: number
  fullEvents: number
  fullRate: number
}

export interface TimeSlotBreakdown {
  slot: string           // 朝・昼・夜など
  totalEvents: number
  fullEvents: number
  fullRate: number
}

export interface ScenarioBadge {
  label: string
  color: 'blue' | 'green' | 'amber' | 'purple' | 'rose' | 'slate'
}

export interface ScenarioBreakdown {
  scenarioTitle: string
  totalEvents: number
  fullEvents: number
  fullRate: number
  avgDaysToFull: number
  badges: ScenarioBadge[]
  // スロット別満席率（-1 = データなし）
  weekdayAfternoonRate: number
  weekdayAfternoonTotal: number
  weekdayEveningRate: number
  weekdayEveningTotal: number
  weekendRate: number
  weekendTotal: number
}

export interface SlotRecommendation {
  scenarioTitle: string
  slotFullRate: number   // 該当スロットの満席率
  slotTotal: number      // 該当スロットのイベント数
  overallFullRate: number
  avgDaysToFull: number
  badges: ScenarioBadge[]
}

export interface Recommendations {
  weekdayAfternoon: SlotRecommendation[]  // 平日昼
  weekdayEvening: SlotRecommendation[]    // 平日夜
  weekend: SlotRecommendation[]           // 土日
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function isEventFullByCount(event: OpenEventItem, actualCount: number): boolean {
  const max = effectiveMax(event)
  return max != null && max > 0 && actualCount >= max
}

function getTimeSlot(timeStr: string | null): string {
  if (!timeStr) return 'その他'
  const hour = parseInt(timeStr.split(':')[0], 10)
  if (hour < 12) return '午前'
  if (hour < 17) return '午後'
  return '夜間'
}

function daysBetween(from: string, to: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay)
}

export function useOpenEventAnalysis() {
  const [events, setEvents] = useState<OpenEventItem[]>([])
  const [reservations, setReservations] = useState<ReservationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useLocalState('openEventAnalysisPeriod', 'past90days')
  const [includeGmTest, setIncludeGmTest] = useLocalState('openEventAnalysisIncludeGmTest', false)
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' })

  const loadOpenEventData = useCallback(async (selectedPeriod: string, storeIds: string[], gmTest?: boolean) => {
    setLoading(true)
    setPeriod(selectedPeriod)

    let range: { startDate: string; endDate: string }

    if (selectedPeriod.startsWith('month:')) {
      // "month:YYYY-MM" 形式 → その月の1日〜末日
      const ym = selectedPeriod.slice(6)
      const [y, m] = ym.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      range = { startDate: `${ym}-01`, endDate: `${ym}-${String(lastDay).padStart(2, '0')}` }
    } else if (selectedPeriod.startsWith('custom:')) {
      // "custom:YYYY-MM-DD:YYYY-MM-DD" 形式
      const parts = selectedPeriod.slice(7).split(':')
      range = { startDate: parts[0], endDate: parts[1] }
    } else {
      let rangeResult
      switch (selectedPeriod) {
        case 'thisMonth':   rangeResult = getThisMonthRangeJST(); break
        case 'lastMonth':   rangeResult = getLastMonthRangeJST(); break
        case 'thisWeek':    rangeResult = getThisWeekRangeJST(); break
        case 'lastWeek':    rangeResult = getLastWeekRangeJST(); break
        case 'past7days':   rangeResult = getPastDaysRangeJST(7); break
        case 'past30days':  rangeResult = getPastDaysRangeJST(30); break
        case 'past90days':  rangeResult = getPastDaysRangeJST(90); break
        case 'past180days': rangeResult = getPastDaysRangeJST(180); break
        case 'thisYear':    rangeResult = getThisYearRangeJST(); break
        case 'lastYear':    rangeResult = getLastYearRangeJST(); break
        default:            rangeResult = getPastDaysRangeJST(90)
      }
      range = { startDate: rangeResult.startDateStr, endDate: rangeResult.endDateStr }
    }
    setDateRange(range)

    const useGmTest = gmTest ?? includeGmTest
    if (gmTest !== undefined) setIncludeGmTest(gmTest)

    try {
      logger.log('📊 オープン公演分析データ取得開始:', { period: selectedPeriod, storeIds, range, useGmTest })
      const data = await salesApi.getOpenEventAnalysis(
        range.startDate,
        range.endDate,
        storeIds.length > 0 ? storeIds : undefined,
        useGmTest
      )
      setEvents(data.events as OpenEventItem[])
      setReservations(data.reservations as ReservationItem[])
      logger.log('📊 オープン公演分析データ取得完了:', { eventCount: data.events.length })
    } catch (error) {
      logger.error('❌ オープン公演分析データの取得に失敗しました:', error)
      setEvents([])
      setReservations([])
    } finally {
      setLoading(false)
    }
  }, [])

  // イベントごとの実際の参加者数（有効な予約から直接集計）
  // current_participants はキャンセル済み予約を含む場合があるため使用しない
  const actualCountByEvent = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of reservations) {
      map.set(r.schedule_event_id, (map.get(r.schedule_event_id) || 0) + (r.participant_count || 0))
    }
    return map
  }, [reservations])

  // イベントごとに満席日数を計算するマップ
  // 予約を時系列順に並べ、累積参加者数が max_participants に達した瞬間の日時を使う
  const daysToFullMap = useMemo(() => {
    const map = new Map<string, number>()
    const reservationsByEvent = new Map<string, ReservationItem[]>()
    for (const r of reservations) {
      const list = reservationsByEvent.get(r.schedule_event_id) || []
      list.push(r)
      reservationsByEvent.set(r.schedule_event_id, list)
    }

    for (const event of events) {
      const max = effectiveMax(event)
      if (!max) continue
      const actualCount = actualCountByEvent.get(event.id) || 0
      if (!isEventFullByCount(event, actualCount)) continue

      // 時系列順に並べて累積が max に達した予約を特定
      const sorted = (reservationsByEvent.get(event.id) || [])
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))

      let cumulative = 0
      for (const r of sorted) {
        cumulative += r.participant_count || 0
        if (cumulative >= max) {
          map.set(event.id, Math.max(0, daysBetween(event.created_at, r.created_at)))
          break
        }
      }
    }
    return map
  }, [events, reservations, actualCountByEvent])

  // サマリー統計
  const stats = useMemo<OpenEventStats>(() => {
    const totalEvents = events.length
    const fullEventsList = events.filter(e => isEventFullByCount(e, actualCountByEvent.get(e.id) || 0))
    const fullEvents = fullEventsList.length

    const fillRates = events
      .filter(e => effectiveMax(e) != null && effectiveMax(e)! > 0)
      .map(e => Math.min(100, (actualCountByEvent.get(e.id) || 0) / effectiveMax(e)! * 100))

    const avgFillRate = fillRates.length > 0
      ? fillRates.reduce((a, b) => a + b, 0) / fillRates.length
      : 0

    const daysArr = Array.from(daysToFullMap.values())
    const avgDaysToFull = daysArr.length > 0
      ? daysArr.reduce((a, b) => a + b, 0) / daysArr.length
      : 0

    return {
      totalEvents,
      fullEvents,
      fullRate: totalEvents > 0 ? (fullEvents / totalEvents) * 100 : 0,
      avgFillRate,
      avgDaysToFull
    }
  }, [events, daysToFullMap, actualCountByEvent])

  // 月別推移
  const monthlyBreakdown = useMemo<MonthlyBreakdown[]>(() => {
    const map = new Map<string, { total: number; full: number }>()
    for (const event of events) {
      const month = event.date.slice(0, 7) // YYYY-MM
      const entry = map.get(month) || { total: 0, full: 0 }
      entry.total += 1
      if (isEventFullByCount(event, actualCountByEvent.get(event.id) || 0)) entry.full += 1
      map.set(month, entry)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { total, full }]) => ({
        month,
        totalEvents: total,
        fullEvents: full,
        fullRate: total > 0 ? (full / total) * 100 : 0
      }))
  }, [events, actualCountByEvent])

  // 曜日別
  const weekdayBreakdown = useMemo<WeekdayBreakdown[]>(() => {
    const map = new Map<number, { total: number; full: number }>()
    for (let i = 0; i < 7; i++) map.set(i, { total: 0, full: 0 })

    for (const event of events) {
      const dow = new Date(`${event.date}T12:00:00+09:00`).getDay()
      const entry = map.get(dow)!
      entry.total += 1
      if (isEventFullByCount(event, actualCountByEvent.get(event.id) || 0)) entry.full += 1
    }

    return Array.from(map.entries()).map(([dow, { total, full }]) => ({
      weekday: WEEKDAY_LABELS[dow],
      totalEvents: total,
      fullEvents: full,
      fullRate: total > 0 ? (full / total) * 100 : 0
    }))
  }, [events, actualCountByEvent])

  // 時間帯別
  const timeSlotBreakdown = useMemo<TimeSlotBreakdown[]>(() => {
    const map = new Map<string, { total: number; full: number }>()
    for (const event of events) {
      const slot = getTimeSlot(event.start_time)
      const entry = map.get(slot) || { total: 0, full: 0 }
      entry.total += 1
      if (isEventFullByCount(event, actualCountByEvent.get(event.id) || 0)) entry.full += 1
      map.set(slot, entry)
    }
    return Array.from(map.entries()).map(([slot, { total, full }]) => ({
      slot,
      totalEvents: total,
      fullEvents: full,
      fullRate: total > 0 ? (full / total) * 100 : 0
    }))
  }, [events, actualCountByEvent])

  // シナリオ別
  const scenarioBreakdown = useMemo<ScenarioBreakdown[]>(() => {
    interface ScenarioEntry {
      total: number
      full: number
      daysArr: number[]
      weekdayTotal: number  // 月〜金
      weekdayFull: number
      weekendTotal: number  // 土・日
      weekendFull: number
      slotTotal: Record<string, number>
      slotFull: Record<string, number>
      weekdaySlotTotal: Record<string, number>  // 平日×時間帯
      weekdaySlotFull: Record<string, number>
    }

    const map = new Map<string, ScenarioEntry>()
    const emptyEntry = (): ScenarioEntry => ({
      total: 0, full: 0, daysArr: [],
      weekdayTotal: 0, weekdayFull: 0,
      weekendTotal: 0, weekendFull: 0,
      slotTotal: {}, slotFull: {},
      weekdaySlotTotal: {}, weekdaySlotFull: {}
    })

    for (const event of events) {
      const title = event.scenario || '（不明）'
      const entry = map.get(title) || emptyEntry()
      const isFull = isEventFullByCount(event, actualCountByEvent.get(event.id) || 0)

      entry.total += 1

      // 曜日判定（JST）
      const dow = new Date(`${event.date}T12:00:00+09:00`).getDay()
      const isWeekend = dow === 0 || dow === 6

      // 時間帯判定
      const slot = getTimeSlot(event.start_time)
      entry.slotTotal[slot] = (entry.slotTotal[slot] || 0) + 1

      if (isWeekend) {
        entry.weekendTotal += 1
        if (isFull) entry.weekendFull += 1
      } else {
        entry.weekdayTotal += 1
        if (isFull) entry.weekdayFull += 1
        // 平日×時間帯
        entry.weekdaySlotTotal[slot] = (entry.weekdaySlotTotal[slot] || 0) + 1
        if (isFull) entry.weekdaySlotFull[slot] = (entry.weekdaySlotFull[slot] || 0) + 1
      }

      if (isFull) {
        entry.full += 1
        entry.slotFull[slot] = (entry.slotFull[slot] || 0) + 1
        const days = daysToFullMap.get(event.id)
        if (days !== undefined) entry.daysArr.push(days)
      }

      map.set(title, entry)
    }

    return Array.from(map.entries())
      .map(([title, entry]) => {
        const { total, full, daysArr, weekdayTotal, weekdayFull, weekendTotal, weekendFull, slotTotal, slotFull, weekdaySlotTotal, weekdaySlotFull } = entry
        const fullRate = total > 0 ? (full / total) * 100 : 0
        const avgDaysToFull = daysArr.length > 0 ? daysArr.reduce((a, b) => a + b, 0) / daysArr.length : 0

        const weekdayRate = weekdayTotal > 0 ? (weekdayFull / weekdayTotal) * 100 : 0
        const weekendRate = weekendTotal > 0 ? (weekendFull / weekendTotal) * 100 : 0

        // 時間帯別満席率（-1 = データなし）
        const slotRate = (t: number, f: number) => t > 0 ? (f / t) * 100 : -1
        const rGozen = slotRate(slotTotal['午前'] || 0, slotFull['午前'] || 0)
        const rGogo  = slotRate(slotTotal['午後'] || 0, slotFull['午後'] || 0)
        const rYoru  = slotRate(slotTotal['夜間'] || 0, slotFull['夜間'] || 0)

        // 平日昼（午後）満席率
        const wdGogo = slotRate(weekdaySlotTotal['午後'] || 0, weekdaySlotFull['午後'] || 0)

        const badges: ScenarioBadge[] = []

        // 土日強い / 平日強い（各1公演以上あれば判定、10pt差）
        if (weekendTotal >= 1 && weekdayTotal >= 1) {
          if (weekendRate >= weekdayRate + 10) {
            badges.push({ label: '土日強い', color: 'blue' })
          } else if (weekdayRate >= weekendRate + 10) {
            badges.push({ label: '平日強い', color: 'green' })
          }
        }

        // 平日昼強い（平日午後1公演以上、全体満席率より10pt以上高い）
        if (wdGogo >= 0 && (weekdaySlotTotal['午後'] || 0) >= 1 && wdGogo >= fullRate + 10) {
          badges.push({ label: '平日昼強い', color: 'green' })
        }

        // 夜人気（夜間1公演以上、他の時間帯より10pt以上高い）
        if (rYoru >= 0 && (slotTotal['夜間'] || 0) >= 1 &&
            (rGozen < 0 || rYoru >= rGozen + 10) &&
            (rGogo < 0 || rYoru >= rGogo + 10)) {
          badges.push({ label: '夜人気', color: 'purple' })
        }

        // すぐ満席（満席1件以上かつ平均3日以内）
        if (daysArr.length >= 1 && avgDaysToFull <= 3) {
          badges.push({ label: 'すぐ満席', color: 'rose' })
        } else if (daysArr.length >= 1 && avgDaysToFull <= 7) {
          // 直前人気（満席1件以上かつ平均7日以内）
          badges.push({ label: '直前人気', color: 'amber' })
        }

        // じっくり埋まる（満席1件以上かつ平均21日以上）
        if (daysArr.length >= 1 && avgDaysToFull >= 21) {
          badges.push({ label: 'じっくり埋まる', color: 'slate' })
        }

        // 人気定番（3公演以上かつ満席率60%以上）
        if (total >= 3 && fullRate >= 60) {
          badges.push({ label: '人気定番', color: 'green' })
        }

        const wdAfternoonRate = slotRate(weekdaySlotTotal['午後'] || 0, weekdaySlotFull['午後'] || 0)
        const wdEveningRate  = slotRate(weekdaySlotTotal['夜間'] || 0, weekdaySlotFull['夜間'] || 0)
        const weRate = weekendTotal > 0 ? (weekendFull / weekendTotal) * 100 : -1

        return {
          scenarioTitle: title,
          totalEvents: total,
          fullEvents: full,
          fullRate,
          avgDaysToFull,
          badges,
          weekdayAfternoonRate: wdAfternoonRate,
          weekdayAfternoonTotal: weekdaySlotTotal['午後'] || 0,
          weekdayEveningRate: wdEveningRate,
          weekdayEveningTotal: weekdaySlotTotal['夜間'] || 0,
          weekendRate: weRate,
          weekendTotal,
        }
      })
      .sort((a, b) => b.totalEvents - a.totalEvents)
  }, [events, daysToFullMap, actualCountByEvent])

  // スロット別おすすめシナリオ（上位3件）
  const recommendations = useMemo<Recommendations>(() => {
    const toRec = (s: ScenarioBreakdown, rate: number, total: number): SlotRecommendation => ({
      scenarioTitle: s.scenarioTitle,
      slotFullRate: rate,
      slotTotal: total,
      overallFullRate: s.fullRate,
      avgDaysToFull: s.avgDaysToFull,
      badges: s.badges,
    })

    const topN = (
      getRate: (s: ScenarioBreakdown) => number,
      getTotal: (s: ScenarioBreakdown) => number,
      n = 3
    ): SlotRecommendation[] =>
      scenarioBreakdown
        .filter(s => getTotal(s) > 0 && getRate(s) >= 0)
        .sort((a, b) => getRate(b) - getRate(a))
        .slice(0, n)
        .map(s => toRec(s, getRate(s), getTotal(s)))

    return {
      weekdayAfternoon: topN(s => s.weekdayAfternoonRate, s => s.weekdayAfternoonTotal),
      weekdayEvening:   topN(s => s.weekdayEveningRate,   s => s.weekdayEveningTotal),
      weekend:          topN(s => s.weekendRate,           s => s.weekendTotal),
    }
  }, [scenarioBreakdown])

  return {
    loading,
    period,
    dateRange,
    includeGmTest,
    stats,
    monthlyBreakdown,
    weekdayBreakdown,
    timeSlotBreakdown,
    scenarioBreakdown,
    recommendations,
    loadOpenEventData
  }
}
