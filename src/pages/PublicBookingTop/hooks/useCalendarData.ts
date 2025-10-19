import { useState, useMemo, useCallback } from 'react'

interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
}

/**
 * カレンダー表示のロジックを管理するフック
 */
export function useCalendarData(allEvents: any[], selectedStoreFilter: string) {
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
   * カレンダーの日付を生成（月曜始まり）
   */
  const calendarDays = useMemo((): CalendarDay[] => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    
    // 月の最初の日と最後の日
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    // 月曜日を0とする曜日（0=月曜, 6=日曜）
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7 // 月曜始まりに調整
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
   * 特定日の公演を取得（店舗フィルター適用）
   */
  const getEventsForDate = useCallback((date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    let filtered = allEvents.filter(event => event.date === dateStr)
    
    // 店舗フィルター適用
    if (selectedStoreFilter !== 'all') {
      filtered = filtered.filter(event => 
        event.store_id === selectedStoreFilter || 
        event.venue === selectedStoreFilter
      )
    }
    
    return filtered
  }, [allEvents, selectedStoreFilter])

  return {
    currentMonth,
    setCurrentMonth,
    calendarDays,
    changeMonth,
    getEventsForDate,
    generateCalendarDays: () => calendarDays
  }
}

