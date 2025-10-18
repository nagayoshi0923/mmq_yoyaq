import { useCallback } from 'react'
import {
  getThisMonthRangeJST,
  getLastMonthRangeJST,
  getThisWeekRangeJST,
  getLastWeekRangeJST,
  getPastDaysRangeJST,
  getThisYearRangeJST,
  getLastYearRangeJST
} from '@/utils/dateUtils'

export function usePeriodSelector(
  setDateRange: (range: { startDate: string; endDate: string }) => void
) {
  const handlePeriodChange = useCallback((period: string) => {
    let range: { start: Date; end: Date; startDateStr: string; endDateStr: string }

    switch (period) {
      case 'thisMonth':
        range = getThisMonthRangeJST()
        break
      case 'lastMonth':
        range = getLastMonthRangeJST()
        break
      case 'thisWeek':
        range = getThisWeekRangeJST()
        break
      case 'lastWeek':
        range = getLastWeekRangeJST()
        break
      case 'past7days':
        range = getPastDaysRangeJST(7)
        break
      case 'past30days':
        range = getPastDaysRangeJST(30)
        break
      case 'past90days':
        range = getPastDaysRangeJST(90)
        break
      case 'past180days':
        range = getPastDaysRangeJST(180)
        break
      case 'thisYear':
        range = getThisYearRangeJST()
        break
      case 'lastYear':
        range = getLastYearRangeJST()
        break
      default:
        return // カスタムの場合は何もしない
    }

    setDateRange({
      startDate: range.startDateStr,
      endDate: range.endDateStr
    })
  }, [setDateRange])

  return { handlePeriodChange }
}

