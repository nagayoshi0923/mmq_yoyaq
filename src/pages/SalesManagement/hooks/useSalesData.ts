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

export function useSalesData() {
  const [salesData, setSalesData] = useState<SalesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [stores, setStores] = useState<Store[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('thisMonth')
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' })

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

  // 売上データを取得（期間とストアを引数で受け取る）
  const loadSalesData = useCallback(async (period: string, storeId: string) => {
    setLoading(true)
    setSelectedPeriod(period)

    // 日付範囲を計算
    let range: { startDate: string; endDate: string }
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
      case 'last7days':
        range = getPastDaysRangeJST(7)
        break
      case 'last30days':
        range = getPastDaysRangeJST(30)
        break
      case 'thisYear':
        range = getThisYearRangeJST()
        break
      case 'lastYear':
        range = getLastYearRangeJST()
        break
      default:
        range = getThisMonthRangeJST()
    }

    setDateRange(range)

    if (!range.startDate || !range.endDate) {
      setLoading(false)
      return
    }

    try {
      // 期間に応じてグラフ用のデータ取得期間を決定
      const startDate = new Date(range.startDate + 'T00:00:00+09:00')
      const endDate = new Date(range.endDate + 'T23:59:59+09:00')
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
      if (storeId !== 'all') {
        events = events.filter(e => e.store_id === storeId)
      }
      
      // 売上データを計算
      const data = calculateSalesData(events, stores, startDate, endDate)
      setSalesData(data)
    } catch (error) {
      logger.error('売上データの取得に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }, [stores])

  return {
    salesData,
    loading,
    stores,
    dateRange,
    selectedPeriod,
    loadSalesData
  }
}

// 売上データ計算関数
function calculateSalesData(
  events: Array<{ revenue?: number; store_id: string; scenario?: string; scenario_id?: string; date: string }>,
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
    const scenarioId = event.scenario_id || event.scenario || '不明'
    const scenarioTitle = event.scenario || '不明'
    
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

  // チャート用の日別データ
  const dailyRevenues = new Map<string, number>()
  events.forEach(event => {
    const date = event.date
    dailyRevenues.set(date, (dailyRevenues.get(date) || 0) + (event.revenue || 0))
  })

  const chartData = {
    labels: Array.from(dailyRevenues.keys()).sort(),
    datasets: [{
      label: '売上',
      data: Array.from(dailyRevenues.keys()).sort().map(date => dailyRevenues.get(date) || 0),
      borderColor: 'rgb(75, 192, 192)',
      backgroundColor: 'rgba(75, 192, 192, 0.2)',
      tension: 0.1
    }]
  }

  return {
    totalRevenue,
    totalEvents,
    averageRevenuePerEvent,
    storeCount: storeRevenues.size,
    storeRanking,
    scenarioRanking,
    chartData
  }
}
