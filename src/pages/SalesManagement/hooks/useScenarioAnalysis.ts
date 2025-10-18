import { useState, useEffect, useCallback } from 'react'
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

interface ScenarioPerformance {
  id: string
  title: string
  events: number
}

export function useScenarioAnalysis() {
  const [scenarioData, setScenarioData] = useState<ScenarioPerformance[]>([])
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState('thisMonth')
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' })

  const loadScenarioData = useCallback(async (selectedPeriod: string, storeId: string) => {
    setLoading(true)
    setPeriod(selectedPeriod)

    // 日付範囲を計算
    let rangeResult
    switch (selectedPeriod) {
      case 'thisMonth':
        rangeResult = getThisMonthRangeJST()
        break
      case 'lastMonth':
        rangeResult = getLastMonthRangeJST()
        break
      case 'thisWeek':
        rangeResult = getThisWeekRangeJST()
        break
      case 'lastWeek':
        rangeResult = getLastWeekRangeJST()
        break
      case 'past7days':
        rangeResult = getPastDaysRangeJST(7)
        break
      case 'past30days':
        rangeResult = getPastDaysRangeJST(30)
        break
      case 'past90days':
        rangeResult = getPastDaysRangeJST(90)
        break
      case 'past180days':
        rangeResult = getPastDaysRangeJST(180)
        break
      case 'thisYear':
        rangeResult = getThisYearRangeJST()
        break
      case 'lastYear':
        rangeResult = getLastYearRangeJST()
        break
      default:
        rangeResult = getThisMonthRangeJST()
    }

    const range = {
      startDate: rangeResult.startDateStr,
      endDate: rangeResult.endDateStr
    }

    setDateRange(range)

    try {
      logger.log('📊 シナリオ分析データ取得開始:', { period: selectedPeriod, storeId, range })
      const data = await salesApi.getScenarioPerformance(
        range.startDate,
        range.endDate,
        storeId === 'all' ? undefined : storeId
      )
      logger.log('📊 シナリオ分析データ取得完了:', { dataCount: data.length })
      setScenarioData(data)
    } catch (error) {
      logger.error('❌ シナリオ分析データの取得に失敗しました:', error)
      setScenarioData([])
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    scenarioData,
    loading,
    period,
    dateRange,
    loadScenarioData
  }
}

