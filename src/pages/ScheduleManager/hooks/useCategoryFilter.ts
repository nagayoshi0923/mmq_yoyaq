import { useState, useMemo } from 'react'
import { getCategoryCounts } from '@/utils/scheduleUtils'
import type { ScheduleEvent } from '@/types/schedule'

/**
 * カテゴリーフィルター管理フック（複数選択対応）
 */
export function useCategoryFilter(events: ScheduleEvent[]) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  // カテゴリごとの公演数を計算
  const categoryCounts = useMemo(() => getCategoryCounts(events), [events])

  return {
    selectedCategories,
    setSelectedCategories,
    categoryCounts
  }
}
