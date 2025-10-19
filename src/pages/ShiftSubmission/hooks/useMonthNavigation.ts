import { useState, useMemo } from 'react'
import type { DayInfo } from '../types'

/**
 * 月ナビゲーションフック
 */
export function useMonthNavigation() {
  const [currentDate, setCurrentDate] = useState(new Date())

  /**
   * 月の変更
   */
  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }

  /**
   * 月間の日付リストを生成
   */
  const generateMonthDays = (): DayInfo[] => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    
    const days: DayInfo[] = []
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({
        date: dateString,
        dayOfWeek: date.toLocaleDateString('ja-JP', { weekday: 'short' }),
        day: day,
        displayDate: `${month + 1}/${day}`
      })
    }
    
    return days
  }

  /**
   * 月の日付リスト（メモ化）
   */
  const monthDays = useMemo(() => generateMonthDays(), [currentDate])

  /**
   * 月年フォーマット
   */
  const formatMonthYear = () => {
    return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`
  }

  return {
    currentDate,
    changeMonth,
    monthDays,
    formatMonthYear
  }
}

