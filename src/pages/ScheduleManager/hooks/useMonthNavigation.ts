import { useState, useEffect, useCallback, useMemo } from 'react'
import { generateMonthDays } from '@/utils/scheduleUtils'
import { logger } from '@/utils/logger'

/**
 * 月ナビゲーション管理フック
 */
export function useMonthNavigation(clearScrollPosition?: () => void) {
  // 現在の日付状態（localStorageから復元）
  const [currentDate, setCurrentDate] = useState(() => {
    try {
      const saved = localStorage.getItem('scheduleCurrentDate')
      if (saved) {
        return new Date(saved)
      }
    } catch {
      // エラー時は現在の日付を使用
    }
    return new Date()
  })

  // currentDateの変更をlocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem('scheduleCurrentDate', currentDate.toISOString())
    } catch (error) {
      logger.error('Failed to save current date:', error)
    }
  }, [currentDate])

  // 月の変更
  const changeMonth = useCallback((direction: 'prev' | 'next') => {
    // 月切り替え時はスクロール位置をクリア（一番上に戻る）
    if (clearScrollPosition) {
      clearScrollPosition()
    }

    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }, [clearScrollPosition])

  // 月間の日付リストを生成
  const monthDays = useMemo(() => generateMonthDays(currentDate), [currentDate])

  return {
    currentDate,
    setCurrentDate,
    changeMonth,
    monthDays
  }
}

