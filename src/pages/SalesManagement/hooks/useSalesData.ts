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
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

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
    let range
    
    if (period === 'custom') {
      // カスタム期間の場合は、customStartDateとcustomEndDateを使用
      if (!customStartDate || !customEndDate) {
        logger.warn('⚠️ カスタム期間が未設定です')
        setLoading(false)
        return
      }
      range = {
        startDate: customStartDate,
        endDate: customEndDate
      }
    } else {
      // プリセット期間の場合
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
      
      range = {
        startDate: rangeResult.startDateStr,
        endDate: rangeResult.endDateStr
      }
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
      
      // 売上データを計算
      logger.log('📊 イベントデータ取得完了:', { eventsCount: events.length })
      const data = calculateSalesData(events, stores, startDate, endDate)
      logger.log('📊 売上データ計算完了:', { totalRevenue: data.totalRevenue })
      setSalesData(data)
    } catch (error) {
      logger.error('❌ 売上データの取得に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }, [stores, customStartDate, customEndDate])

  return {
    salesData,
    loading,
    stores,
    dateRange,
    selectedPeriod,
    customStartDate,
    customEndDate,
    setCustomStartDate,
    setCustomEndDate,
    loadSalesData
  }
}

/**
 * 時給ベースのGM給与を計算（30分単位）
 * - 5時間まで: 時給1750円（30分あたり875円）
 * - 5時間超: 30分あたり500円
 */
function calculateHourlyWage(durationMinutes: number): number {
  // 30分単位に切り上げ
  const roundedMinutes = Math.ceil(durationMinutes / 30) * 30
  const halfHourUnits = roundedMinutes / 30
  
  const RATE_PER_30MIN_FIRST_5H = 875   // 最初の5時間の30分あたり料金（1750円 / 2）
  const RATE_PER_30MIN_AFTER_5H = 500   // 5時間超の30分あたり料金（1000円 / 2）
  const THRESHOLD_UNITS = 10            // 閾値（5時間 = 10単位）
  
  if (halfHourUnits <= THRESHOLD_UNITS) {
    // 5時間以内（10単位以内）
    return RATE_PER_30MIN_FIRST_5H * halfHourUnits
  } else {
    // 5時間超
    const first5Hours = RATE_PER_30MIN_FIRST_5H * THRESHOLD_UNITS  // 8,750円
    const additionalUnits = halfHourUnits - THRESHOLD_UNITS
    const additionalPay = RATE_PER_30MIN_AFTER_5H * additionalUnits
    return first5Hours + additionalPay
  }
}

// 売上データ計算関数
function calculateSalesData(
  events: Array<{ 
    id?: string;
    revenue?: number; 
    store_id: string; 
    scenario?: string; 
    scenario_id?: string; 
    date: string;
    current_participants?: number;
    gms?: string[];
    scenarios?: {
      duration?: number;
      license_amount?: number;
      gm_test_license_amount?: number;
      gm_costs?: Array<{ role: string; reward: number; category?: 'normal' | 'gmtest' }>;
    };
    category?: string;
  }>,
  stores: Store[],
  startDate: Date,
  endDate: Date
): SalesData {
  const totalRevenue = events.reduce((sum, event) => sum + (event.revenue || 0), 0)
  const totalEvents = events.length
  const averageRevenuePerEvent = totalEvents > 0 ? totalRevenue / totalEvents : 0

  // ライセンス金額とGM給与を計算
  let totalLicenseCost = 0
  let totalGmCost = 0

  console.log('💰 売上計算開始:', { eventsCount: events.length })

  events.forEach(event => {
    const scenario = event.scenarios
    if (scenario) {
      // ライセンス金額の計算
      const isGmTest = event.category === 'gmtest'
      const licenseAmount = isGmTest 
        ? (scenario.gm_test_license_amount || 0)
        : (scenario.license_amount || 0)
      totalLicenseCost += licenseAmount

      // GM給与の計算（時給ベース）
      if (scenario.gm_costs && scenario.gm_costs.length > 0) {
        console.log('💵 GM報酬データ発見:', { 
          scenario: event.scenario, 
          gm_costs: scenario.gm_costs,
          category: event.category,
          duration: scenario.duration
        })
        
        // カテゴリに応じてフィルタリングし、役割でソート
        const applicableGmCosts = scenario.gm_costs
          .filter(gm => {
            const gmCategory = gm.category || 'normal'
            return gmCategory === (isGmTest ? 'gmtest' : 'normal')
          })
          .sort((a, b) => {
            // main, sub, gm3... の順にソート
            const roleOrder: Record<string, number> = { main: 0, sub: 1, gm3: 2, gm4: 3 }
            const aOrder = roleOrder[a.role.toLowerCase()] ?? 999
            const bOrder = roleOrder[b.role.toLowerCase()] ?? 999
            return aOrder - bOrder
          })
        
        console.log('💵 適用可能なGM報酬:', { applicableGmCosts })
        
        // GM数を取得（gm_costsの数 = 必要なGM数）
        const gmCount = applicableGmCosts.length
        
        // 所要時間を取得（分単位）
        const durationMinutes = scenario.duration || 180 // デフォルト3時間
        
        // 時給ベースで1人あたりの給与を計算
        const wagePerGm = calculateHourlyWage(durationMinutes)
        
        // GM数分の給与を計上
        const gmCost = wagePerGm * gmCount
        
        console.log('💵 GM給与計算:', { 
          scenario: event.scenario,
          duration: durationMinutes,
          hours: (durationMinutes / 60).toFixed(2),
          wagePerGm,
          gmCount,
          totalGmCost: gmCost
        })
        
        totalGmCost += gmCost
      } else {
        console.log('⚠️ GM報酬データなし:', { 
          scenario: event.scenario, 
          gm_costs: scenario.gm_costs 
        })
      }
    } else {
      console.log('⚠️ シナリオ情報なし:', { event })
    }
  })

  console.log('💰 売上計算完了:', { 
    totalRevenue, 
    totalLicenseCost, 
    totalGmCost,
    netProfit: totalRevenue - totalLicenseCost - totalGmCost
  })

  const netProfit = totalRevenue - totalLicenseCost - totalGmCost

  // 店舗別売上ランキング
  const storeRevenues = new Map<string, { 
    revenue: number; 
    events: number; 
    name: string; 
    id: string;
    licenseCost: number;
    gmCost: number;
  }>()
  
  events.forEach(event => {
    const storeId = event.store_id
    const store = stores.find(s => s.id === storeId)
    const storeName = store?.name || '不明'
    
    if (!storeRevenues.has(storeId)) {
      storeRevenues.set(storeId, { 
        revenue: 0, 
        events: 0, 
        name: storeName, 
        id: storeId,
        licenseCost: 0,
        gmCost: 0
      })
    }
    
    const storeData = storeRevenues.get(storeId)!
    storeData.revenue += event.revenue || 0
    storeData.events += 1

    // 店舗別のライセンス金額とGM給与を計算
    const scenario = event.scenarios
    if (scenario) {
      const isGmTest = event.category === 'gmtest'
      const licenseAmount = isGmTest 
        ? (scenario.gm_test_license_amount || 0)
        : (scenario.license_amount || 0)
      storeData.licenseCost += licenseAmount

      if (scenario.gm_costs && scenario.gm_costs.length > 0) {
        const actualGmCount = (event as any).gms?.length || 0
        
        if (actualGmCount > 0) {
          const applicableGmCosts = scenario.gm_costs
            .filter(gm => {
              const gmCategory = gm.category || 'normal'
              return gmCategory === (isGmTest ? 'gmtest' : 'normal')
            })
            .sort((a, b) => {
              const roleOrder: Record<string, number> = { main: 0, sub: 1, gm3: 2, gm4: 3 }
              const aOrder = roleOrder[a.role.toLowerCase()] ?? 999
              const bOrder = roleOrder[b.role.toLowerCase()] ?? 999
              return aOrder - bOrder
            })
          
          const gmCost = applicableGmCosts
            .slice(0, actualGmCount)
            .reduce((sum, gm) => sum + gm.reward, 0)
          storeData.gmCost += gmCost
        }
      }
    }
  })

  const storeRanking = Array.from(storeRevenues.values())
    .map(store => ({
      ...store,
      averageRevenue: store.events > 0 ? store.revenue / store.events : 0,
      netProfit: store.revenue - store.licenseCost - store.gmCost
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // シナリオ別売上ランキング
  const scenarioRevenues = new Map<string, { 
    revenue: number; 
    events: number; 
    title: string; 
    id: string;
    licenseCost: number;
    gmCost: number;
  }>()
  
  events.forEach(event => {
    const scenarioId = event.scenario_id || event.scenario || '不明'
    const scenarioTitle = event.scenario || '不明'
    
    if (!scenarioRevenues.has(scenarioId)) {
      scenarioRevenues.set(scenarioId, { 
        revenue: 0, 
        events: 0, 
        title: scenarioTitle, 
        id: scenarioId,
        licenseCost: 0,
        gmCost: 0
      })
    }
    
    const scenarioData = scenarioRevenues.get(scenarioId)!
    scenarioData.revenue += event.revenue || 0
    scenarioData.events += 1

    // シナリオ別のライセンス金額とGM給与を計算
    const scenario = event.scenarios
    if (scenario) {
      const isGmTest = event.category === 'gmtest'
      const licenseAmount = isGmTest 
        ? (scenario.gm_test_license_amount || 0)
        : (scenario.license_amount || 0)
      scenarioData.licenseCost += licenseAmount

      if (scenario.gm_costs && scenario.gm_costs.length > 0) {
        const actualGmCount = (event as any).gms?.length || 0
        
        if (actualGmCount > 0) {
          const applicableGmCosts = scenario.gm_costs
            .filter(gm => {
              const gmCategory = gm.category || 'normal'
              return gmCategory === (isGmTest ? 'gmtest' : 'normal')
            })
            .sort((a, b) => {
              const roleOrder: Record<string, number> = { main: 0, sub: 1, gm3: 2, gm4: 3 }
              const aOrder = roleOrder[a.role.toLowerCase()] ?? 999
              const bOrder = roleOrder[b.role.toLowerCase()] ?? 999
              return aOrder - bOrder
            })
          
          const gmCost = applicableGmCosts
            .slice(0, actualGmCount)
            .reduce((sum, gm) => sum + gm.reward, 0)
          scenarioData.gmCost += gmCost
        }
      }
    }
  })

  const scenarioRanking = Array.from(scenarioRevenues.values())
    .map(scenario => ({
      ...scenario,
      averageRevenue: scenario.events > 0 ? scenario.revenue / scenario.events : 0,
      netProfit: scenario.revenue - scenario.licenseCost - scenario.gmCost
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // チャート用の日別データ
  const dailyRevenues = new Map<string, { revenue: number; licenseCost: number; gmCost: number; netProfit: number }>()
  events.forEach(event => {
    const date = event.date
    const current = dailyRevenues.get(date) || { revenue: 0, licenseCost: 0, gmCost: 0, netProfit: 0 }
    
    current.revenue += event.revenue || 0
    
    const scenario = event.scenarios
    if (scenario) {
      const isGmTest = event.category === 'gmtest'
      const licenseAmount = isGmTest 
        ? (scenario.gm_test_license_amount || 0)
        : (scenario.license_amount || 0)
      current.licenseCost += licenseAmount

      if (scenario.gm_costs && scenario.gm_costs.length > 0) {
        const actualGmCount = (event as any).gms?.length || 0
        
        if (actualGmCount > 0) {
          const applicableGmCosts = scenario.gm_costs
            .filter(gm => {
              const gmCategory = gm.category || 'normal'
              return gmCategory === (isGmTest ? 'gmtest' : 'normal')
            })
            .sort((a, b) => {
              const roleOrder: Record<string, number> = { main: 0, sub: 1, gm3: 2, gm4: 3 }
              const aOrder = roleOrder[a.role.toLowerCase()] ?? 999
              const bOrder = roleOrder[b.role.toLowerCase()] ?? 999
              return aOrder - bOrder
            })
          
          const gmCost = applicableGmCosts
            .slice(0, actualGmCount)
            .reduce((sum, gm) => sum + gm.reward, 0)
          current.gmCost += gmCost
        }
      }
    }
    
    current.netProfit = current.revenue - current.licenseCost - current.gmCost
    dailyRevenues.set(date, current)
  })

  const chartData = {
    labels: Array.from(dailyRevenues.keys()).sort(),
    datasets: [{
      label: '売上',
      data: Array.from(dailyRevenues.keys()).sort().map(date => dailyRevenues.get(date)?.revenue || 0),
      borderColor: 'rgb(75, 192, 192)',
      backgroundColor: 'rgba(75, 192, 192, 0.2)',
      tension: 0.1
    }]
  }

  // 実施公演リスト用のデータを作成
  const eventList = events.map(event => {
    const scenario = event.scenarios
    let licenseCost = 0
    let gmCost = 0

    if (scenario) {
      const isGmTest = event.category === 'gmtest'
      licenseCost = isGmTest 
        ? (scenario.gm_test_license_amount || 0)
        : (scenario.license_amount || 0)

      if (scenario.gm_costs && scenario.gm_costs.length > 0) {
        const actualGmCount = (event as any).gms?.length || 0
        
        if (actualGmCount > 0) {
          const applicableGmCosts = scenario.gm_costs
            .filter(gm => {
              const gmCategory = gm.category || 'normal'
              return gmCategory === (isGmTest ? 'gmtest' : 'normal')
            })
            .sort((a, b) => {
              const roleOrder: Record<string, number> = { main: 0, sub: 1, gm3: 2, gm4: 3 }
              const aOrder = roleOrder[a.role.toLowerCase()] ?? 999
              const bOrder = roleOrder[b.role.toLowerCase()] ?? 999
              return aOrder - bOrder
            })
          
          gmCost = applicableGmCosts
            .slice(0, actualGmCount)
            .reduce((sum, gm) => sum + gm.reward, 0)
        }
      }
    }

    const store = stores.find(s => s.id === event.store_id)
    const netProfit = (event.revenue || 0) - licenseCost - gmCost

    return {
      id: event.id || `${event.date}-${event.store_id}-${event.scenario}`,
      date: event.date,
      store_name: store?.name || '不明',
      scenario_title: event.scenario || '不明',
      revenue: event.revenue || 0,
      license_cost: licenseCost,
      gm_cost: gmCost,
      net_profit: netProfit,
      participant_count: (event as any).actual_participants || event.current_participants || 0,
      category: event.category,
      has_demo_participant: (event as any).has_demo_participant || false
    }
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // 古い日付順でソート

  return {
    totalRevenue,
    totalEvents,
    averageRevenuePerEvent,
    totalLicenseCost,
    totalGmCost,
    netProfit,
    storeRanking,
    scenarioRanking,
    chartData,
    eventList
  }
}
