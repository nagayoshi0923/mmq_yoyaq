import { useState, useMemo } from 'react'
import { getCategoryCounts } from '@/utils/scheduleUtils'
import type { ScheduleEvent } from '@/types/schedule'

/**
 * カテゴリーフィルター管理フック
 */
export function useCategoryFilter(events: ScheduleEvent[]) {
  const [selectedCategory, setSelectedCategory] = useState('all')

  // カテゴリごとの公演数を計算
  const categoryCounts = useMemo(() => getCategoryCounts(events), [events])

  return {
    selectedCategory,
    setSelectedCategory,
    categoryCounts
  }
}

