import { useState, useMemo, useCallback } from 'react'
import { formatDateJST } from '@/utils/dateUtils'

interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
}

/**
 * カレンダー表示のロジックを管理するフック
 */
export function useCalendarData(allEvents: any[], selectedStoreFilter: string, stores: any[] = []) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  /**
   * 月を変更
   */
  const changeMonth = useCallback((direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1)
      } else {
        newDate.setMonth(newDate.getMonth() + 1)
      }
      return newDate
    })
  }, [])

  /**
   * カレンダーの日付を生成（日曜始まり）
   */
  const calendarDays = useMemo((): CalendarDay[] => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    
    // 月の最初の日と最後の日
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    // 日曜日を0とする曜日（0=日曜, 6=土曜）
    const firstDayOfWeek = firstDay.getDay() // 日曜始まり
    const lastDate = lastDay.getDate()
    
    const days: CalendarDay[] = []
    
    // 前月の日付で埋める
    for (let i = 0; i < firstDayOfWeek; i++) {
      const date = new Date(year, month, -firstDayOfWeek + i + 1)
      days.push({ date, isCurrentMonth: false })
    }
    
    // 当月の日付
    for (let i = 1; i <= lastDate; i++) {
      const date = new Date(year, month, i)
      days.push({ date, isCurrentMonth: true })
    }
    
    // 次月の日付で埋める（7の倍数になるまで）
    const remainingDays = 7 - (days.length % 7)
    if (remainingDays < 7) {
      for (let i = 1; i <= remainingDays; i++) {
        const date = new Date(year, month + 1, i)
        days.push({ date, isCurrentMonth: false })
      }
    }
    
    return days
  }, [currentMonth])

  /**
   * 最適化: イベントを日付でインデックス化（メモ化）
   */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, any[]>()
    allEvents.forEach(event => {
      const dateStr = event.date
      if (!map.has(dateStr)) {
        map.set(dateStr, [])
      }
      map.get(dateStr)!.push(event)
    })
    return map
  }, [allEvents])

  /**
   * 特定日の公演を取得（店舗フィルター適用）
   * 最適化: インデックス化されたイベントを使用（O(1)アクセス）
   */
  const getEventsForDate = useCallback((date: Date) => {
    const dateStr = formatDateJST(date)
    const events = eventsByDate.get(dateStr) || []
    
    // 店舗フィルター適用
    if (selectedStoreFilter !== 'all') {
      const selectedStore = stores.find(s => s.id === selectedStoreFilter)
      return events.filter(event => {
        const eventStoreId = event.store_id || event.venue
        return eventStoreId === selectedStoreFilter || 
               eventStoreId === selectedStore?.short_name || 
               eventStoreId === selectedStore?.name
      })
    }
    
    return events
  }, [eventsByDate, selectedStoreFilter, stores])

  return {
    currentMonth,
    setCurrentMonth,
    calendarDays,
    changeMonth,
    getEventsForDate,
    generateCalendarDays: () => calendarDays
  }
}

