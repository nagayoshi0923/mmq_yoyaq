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
        logger.log('🏪 店舗データ取得開始')
        const storeData = await salesApi.getStores()
        logger.log('🏪 店舗データ取得完了:', { storesCount: storeData.length })
        setStores(storeData)
      } catch (error) {
        logger.error('❌ 店舗データの取得に失敗しました:', error)
      }
    }
    fetchStores()
  }, [])

  // 売上データを取得（期間とストアを引数で受け取る）
  const loadSalesData = useCallback(async (period: string, storeId: string) => {
    logger.log('📊 売上データ取得開始:', { period, storeId, storesCount: stores.length })
    setLoading(true)
    setSelectedPeriod(period)

    // 日付範囲を計算
    let rangeResult
    switch (period) {
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
      case 'last7days':
        rangeResult = getPastDaysRangeJST(7)
        break
      case 'last30days':
        rangeResult = getPastDaysRangeJST(30)
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
    logger.log('📊 計算された日付範囲:', { range })

    if (!range.startDate || !range.endDate) {
      logger.error('❌ 日付範囲が不正です:', { range })
      setLoading(false)
      return
    }

    try {
      // 期間に応じてグラフ用のデータ取得期間を決定
      logger.log('📊 日付変換:', { rangeStart: range.startDate, rangeEnd: range.endDate })
      const startDate = new Date(range.startDate + 'T00:00:00+09:00')
      const endDate = new Date(range.endDate + 'T23:59:59+09:00')
      logger.log('📊 日付オブジェクト作成:', { startDate, endDate })
      const daysDiff = getDaysDiff(startDate, endDate)
      logger.log('📊 日数差:', { daysDiff })
      
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
      
      logger.log('📊 API呼び出し:', { 
        start: formatDateJST(chartStartDate), 
        end: formatDateJST(chartEndDate) 
      })
      
      let events = await salesApi.getSalesByPeriod(
        formatDateJST(chartStartDate),
        formatDateJST(chartEndDate)
      )
      
      // 店舗フィルタリング
      if (storeId !== 'all') {
        events = events.filter(e => e.store_id === storeId)
      }
      
      // キャンセル済みイベントが除外されているか確認
      const cancelledCount = events.filter(e => e.is_cancelled).length
      
      // 売上データを計算
      logger.log('📊 イベントデータ取得完了:', { 
        eventsCount: events.length,
        cancelledCount,
        message: cancelledCount > 0 ? '⚠️ キャンセル済みイベントが含まれています！' : '✅ キャンセル済みイベントは除外されています'
      })
      const data = calculateSalesData(events, stores, startDate, endDate)
      logger.log('📊 売上データ計算完了:', { totalRevenue: data.totalRevenue })
      setSalesData(data)
    } catch (error) {
      logger.error('❌ 売上データの取得に失敗しました:', error)
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
