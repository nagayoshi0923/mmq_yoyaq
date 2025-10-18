import { useState, useEffect, useCallback } from 'react'
import { salesApi } from '@/lib/api'
import { SalesData } from '@/types'
import { logger } from '@/utils/logger'
import {
  getThisMonthRangeJST,
  getLastMonthRangeJST,
  getThisWeekRangeJST,
  getLastWeekRangeJST,
  getPastDaysRangeJST,
  getThisYearRangeJST,
  getLastYearRangeJST,
  getDaysDiff,
  formatDateJST
} from '@/utils/dateUtils'

interface Store {
  id: string
  name: string
  short_name: string
}

interface UseSalesDataProps {
  selectedPeriod: string
  selectedStore: string
  dateRange: { startDate: string; endDate: string }
}

export function useSalesData({ selectedPeriod, selectedStore, dateRange }: UseSalesDataProps) {
  const [salesData, setSalesData] = useState<SalesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [stores, setStores] = useState<Store[]>([])

  // 店舗一覧を取得
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const storeData = await salesApi.getStores()
        setStores(storeData)
      } catch (error) {
        logger.error('店舗データの取得に失敗しました:', error)
      }
    }
    fetchStores()
  }, [])

  // 売上データを取得
  const fetchSalesData = useCallback(async () => {
    if (!dateRange.startDate || !dateRange.endDate) return

    setLoading(true)
    try {
      // 期間に応じてグラフ用のデータ取得期間を決定
      const startDate = new Date(dateRange.startDate + 'T00:00:00+09:00')
      const endDate = new Date(dateRange.endDate + 'T23:59:59+09:00')
      const daysDiff = getDaysDiff(startDate, endDate)
      
      let chartStartDate: Date
      let chartEndDate: Date
      
      if (daysDiff <= 31) {
        // 31日以内の場合は日別グラフ（選択期間のデータ）
        chartStartDate = new Date(startDate)
        chartEndDate = new Date(endDate)
      } else {
        // 32日以上の場合は月別グラフ（1年分）
        chartStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
        chartEndDate = new Date(startDate.getFullYear() + 1, startDate.getMonth(), 0)
      }
      
      let events = await salesApi.getSalesByPeriod(
        formatDateJST(chartStartDate),
        formatDateJST(chartEndDate)
      )
      
      // 店舗フィルタリング
      if (selectedStore !== 'all') {
        events = events.filter(e => e.store_id === selectedStore)
      }
      
      // 売上データを計算
      const data = calculateSalesData(events, stores, startDate, endDate)
      setSalesData(data)
    } catch (error) {
      logger.error('売上データの取得に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }, [dateRange.startDate, dateRange.endDate, selectedStore, stores])

  // 期間または店舗が変更されたらデータを再取得
  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      fetchSalesData()
    }
  }, [fetchSalesData])

  return {
    salesData,
    loading,
    stores,
    refetch: fetchSalesData
  }
}

// 売上データ計算関数
function calculateSalesData(
  events: any[],
  stores: Store[],
  startDate: Date,
  endDate: Date
): SalesData {
  const totalRevenue = events.reduce((sum, event) => sum + (event.revenue || 0), 0)
  const totalEvents = events.length
  const averageRevenuePerEvent = totalEvents > 0 ? totalRevenue / totalEvents : 0

  // 店舗別売上ランキング
  const storeRevenues = new Map<string, { revenue: number; events: number; name: string; id: string }>()
  
  events.forEach(event => {
    const storeId = event.store_id
    const store = stores.find(s => s.id === storeId)
    const storeName = store?.name || '不明'
    
    if (!storeRevenues.has(storeId)) {
      storeRevenues.set(storeId, { revenue: 0, events: 0, name: storeName, id: storeId })
    }
    
    const storeData = storeRevenues.get(storeId)!
    storeData.revenue += event.revenue || 0
    storeData.events += 1
  })

  const storeRanking = Array.from(storeRevenues.values())
    .map(store => ({
      ...store,
      averageRevenue: store.events > 0 ? store.revenue / store.events : 0
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // シナリオ別売上ランキング
  const scenarioRevenues = new Map<string, { revenue: number; events: number; title: string; id: string }>()
  
  events.forEach(event => {
    const scenarioId = event.scenario_id || 'unknown'
    const scenarioTitle = event.scenario_title || '不明'
    
    if (!scenarioRevenues.has(scenarioId)) {
      scenarioRevenues.set(scenarioId, { revenue: 0, events: 0, title: scenarioTitle, id: scenarioId })
    }
    
    const scenarioData = scenarioRevenues.get(scenarioId)!
    scenarioData.revenue += event.revenue || 0
    scenarioData.events += 1
  })

  const scenarioRanking = Array.from(scenarioRevenues.values())
    .map(scenario => ({
      ...scenario,
      averageRevenue: scenario.events > 0 ? scenario.revenue / scenario.events : 0
    }))
    .sort((a, b) => b.revenue - a.revenue)

  return {
    totalRevenue,
    totalEvents,
    averageRevenuePerEvent,
    storeRanking,
    scenarioRanking,
    periodStart: startDate.toISOString(),
    periodEnd: endDate.toISOString()
  }
}

