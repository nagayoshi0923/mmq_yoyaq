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
  max_participants: number | null
  current_participants: number | null
  is_cancelled: boolean
  created_at: string
  store_id: string | null
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

export interface ScenarioBreakdown {
  scenarioTitle: string
  totalEvents: number
  fullEvents: number
  fullRate: number
  avgDaysToFull: number
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function isEventFull(event: OpenEventItem): boolean {
  return event.max_participants != null &&
    event.current_participants != null &&
    event.current_participants >= event.max_participants
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
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' })

  const loadOpenEventData = useCallback(async (selectedPeriod: string, storeIds: string[]) => {
    setLoading(true)
    setPeriod(selectedPeriod)

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

    const range = { startDate: rangeResult.startDateStr, endDate: rangeResult.endDateStr }
    setDateRange(range)

    try {
      logger.log('📊 オープン公演分析データ取得開始:', { period: selectedPeriod, storeIds, range })
      const data = await salesApi.getOpenEventAnalysis(
        range.startDate,
        range.endDate,
        storeIds.length > 0 ? storeIds : undefined
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

  // イベントごとに満席日数を計算するマップ
  const daysToFullMap = useMemo(() => {
    const map = new Map<string, number>()
    // イベントIDごとに予約を集約
    const reservationsByEvent = new Map<string, ReservationItem[]>()
    for (const r of reservations) {
      const list = reservationsByEvent.get(r.schedule_event_id) || []
      list.push(r)
      reservationsByEvent.set(r.schedule_event_id, list)
    }

    for (const event of events) {
      if (!isEventFull(event)) continue

      const eventReservations = reservationsByEvent.get(event.id) || []
      if (eventReservations.length === 0) continue

      // 最後の予約日時を満席日とする
      const latestReservation = eventReservations.reduce((latest, r) =>
        r.created_at > latest.created_at ? r : latest
      )
      const days = daysBetween(event.created_at, latestReservation.created_at)
      map.set(event.id, Math.max(0, days))
    }
    return map
  }, [events, reservations])

  // サマリー統計
  const stats = useMemo<OpenEventStats>(() => {
    const totalEvents = events.length
    const fullEvents = events.filter(isEventFull).length

    const fillRates = events
      .filter(e => e.max_participants != null && e.max_participants > 0)
      .map(e => (e.current_participants ?? 0) / e.max_participants! * 100)

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
  }, [events, daysToFullMap])

  // 月別推移
  const monthlyBreakdown = useMemo<MonthlyBreakdown[]>(() => {
    const map = new Map<string, { total: number; full: number }>()
    for (const event of events) {
      const month = event.date.slice(0, 7) // YYYY-MM
      const entry = map.get(month) || { total: 0, full: 0 }
      entry.total += 1
      if (isEventFull(event)) entry.full += 1
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
  }, [events])

  // 曜日別
  const weekdayBreakdown = useMemo<WeekdayBreakdown[]>(() => {
    const map = new Map<number, { total: number; full: number }>()
    for (let i = 0; i < 7; i++) map.set(i, { total: 0, full: 0 })

    for (const event of events) {
      const dow = new Date(`${event.date}T12:00:00+09:00`).getDay()
      const entry = map.get(dow)!
      entry.total += 1
      if (isEventFull(event)) entry.full += 1
    }

    return Array.from(map.entries()).map(([dow, { total, full }]) => ({
      weekday: WEEKDAY_LABELS[dow],
      totalEvents: total,
      fullEvents: full,
      fullRate: total > 0 ? (full / total) * 100 : 0
    }))
  }, [events])

  // 時間帯別
  const timeSlotBreakdown = useMemo<TimeSlotBreakdown[]>(() => {
    const map = new Map<string, { total: number; full: number }>()
    for (const event of events) {
      const slot = getTimeSlot(event.start_time)
      const entry = map.get(slot) || { total: 0, full: 0 }
      entry.total += 1
      if (isEventFull(event)) entry.full += 1
      map.set(slot, entry)
    }
    return Array.from(map.entries()).map(([slot, { total, full }]) => ({
      slot,
      totalEvents: total,
      fullEvents: full,
      fullRate: total > 0 ? (full / total) * 100 : 0
    }))
  }, [events])

  // シナリオ別
  const scenarioBreakdown = useMemo<ScenarioBreakdown[]>(() => {
    const map = new Map<string, { total: number; full: number; daysArr: number[] }>()
    for (const event of events) {
      const title = event.scenario || '（不明）'
      const entry = map.get(title) || { total: 0, full: 0, daysArr: [] }
      entry.total += 1
      if (isEventFull(event)) {
        entry.full += 1
        const days = daysToFullMap.get(event.id)
        if (days !== undefined) entry.daysArr.push(days)
      }
      map.set(title, entry)
    }
    return Array.from(map.entries())
      .map(([title, { total, full, daysArr }]) => ({
        scenarioTitle: title,
        totalEvents: total,
        fullEvents: full,
        fullRate: total > 0 ? (full / total) * 100 : 0,
        avgDaysToFull: daysArr.length > 0 ? daysArr.reduce((a, b) => a + b, 0) / daysArr.length : 0
      }))
      .sort((a, b) => b.totalEvents - a.totalEvents)
  }, [events, daysToFullMap])

  return {
    loading,
    period,
    dateRange,
    stats,
    monthlyBreakdown,
    weekdayBreakdown,
    timeSlotBreakdown,
    scenarioBreakdown,
    loadOpenEventData
  }
}
