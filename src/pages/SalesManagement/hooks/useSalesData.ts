import { useState, useEffect, useCallback } from 'react'
import { salesApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
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
  ownership_type?: 'corporate' | 'franchise' | 'office'
  franchise_fee?: number
  fixed_costs?: Array<{
    item: string
    amount: number
    frequency?: 'monthly' | 'yearly' | 'one-time'
    startDate?: string
    endDate?: string
  }>
}

// 売上計算用のイベント型（schedule_eventsから取得したデータ）
interface SalesEvent {
  id: string
  date: string
  store_id: string
  scenario_id?: string
  scenario?: string
  category: string
  start_time?: string
  end_time?: string
  current_participants?: number
  max_participants?: number
  capacity?: number
  is_cancelled: boolean
  gms?: string[]
  gm_roles?: Record<string, string> // GM役割 { "GM名": "main" | "sub" | "reception" | "staff" | "observer" }
  venue_rental_fee?: number // 場所貸し公演料金
  actual_participants?: number
  has_demo_participant?: boolean
}

// localStorage キー
const STORAGE_KEY_START_DATE = 'sales-custom-start-date'
const STORAGE_KEY_END_DATE = 'sales-custom-end-date'
const STORAGE_KEY_PERIOD = 'sales-selected-period'

export function useSalesData() {
  const [salesData, setSalesData] = useState<SalesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [stores, setStores] = useState<Store[]>([])
  
  // localStorage から初期値を復元
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_PERIOD) || 'thisMonth'
    }
    return 'thisMonth'
  })
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' })
  const [customStartDate, setCustomStartDate] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_START_DATE) || ''
    }
    return ''
  })
  const [customEndDate, setCustomEndDate] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_END_DATE) || ''
    }
    return ''
  })

  // localStorage に期間設定を保存
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedPeriod) {
      localStorage.setItem(STORAGE_KEY_PERIOD, selectedPeriod)
    }
  }, [selectedPeriod])

  useEffect(() => {
    if (typeof window !== 'undefined' && customStartDate) {
      localStorage.setItem(STORAGE_KEY_START_DATE, customStartDate)
    }
  }, [customStartDate])

  useEffect(() => {
    if (typeof window !== 'undefined' && customEndDate) {
      localStorage.setItem(STORAGE_KEY_END_DATE, customEndDate)
    }
  }, [customEndDate])

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
  const loadSalesData = useCallback(async (period: string, storeId: string, ownershipFilter?: 'corporate' | 'franchise') => {
    logger.log('📊 売上データ取得開始:', { period, storeId, ownershipFilter, storesCount: stores.length })
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
      
      // プリセット期間の場合もcustomStartDateとcustomEndDateを更新
      // これにより、SalesOverviewのcurrentMonthが正しく同期される
      setCustomStartDate(range.startDate)
      setCustomEndDate(range.endDate)
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
      
      // イベントデータと雑収支データを並列取得
      const [eventsData, miscResult] = await Promise.all([
        salesApi.getSalesByPeriod(
        formatDateJST(chartStartDate),
        formatDateJST(chartEndDate)
        ),
        supabase
          .from('miscellaneous_transactions')
          .select('id, date, type, category, amount, scenario_id')
          .gte('date', formatDateJST(chartStartDate))
          .lte('date', formatDateJST(chartEndDate))
          .not('scenario_id', 'is', null)
          .eq('type', 'expense')
      ])
      
      let events = eventsData
      const miscTransactions = miscResult.data || []
      logger.log('📊 データ取得完了:', { 
        events: events.length, 
        miscTransactions: miscTransactions.length 
      })
      
      // 店舗フィルタリング（ownership_type による絞り込み）
      let filteredStores = stores
      if (ownershipFilter) {
        if (ownershipFilter === 'corporate') {
          // 直営店の場合、オフィスも含める
          filteredStores = filteredStores.filter(s => 
            s.ownership_type === 'corporate' || s.ownership_type === 'office'
          )
        } else {
          // フランチャイズの場合、フランチャイズのみ
          filteredStores = filteredStores.filter(s => s.ownership_type === ownershipFilter)
        }
        logger.log('📊 店舗タイプでフィルター:', { ownershipFilter, filteredCount: filteredStores.length })
      }
      
      // フィルタリング対象店舗のIDリストを取得
      const filteredStoreIds = ownershipFilter ? filteredStores.map(s => s.id) : []
      
      // イベントフィルタリング
      if (storeId !== 'all') {
        events = events.filter(e => e.store_id === storeId)
      } else if (ownershipFilter && filteredStoreIds.length > 0) {
        // 店舗タイプでフィルタリングされている場合、そのstore_idのイベントのみに絞り込む
        // 直営店の場合は、直営店＋オフィスのイベント
        // フランチャイズの場合は、フランチャイズのイベント
        events = events.filter(e => filteredStoreIds.includes(e.store_id))
        logger.log('📊 店舗タイプでイベントに絞り込み:', { eventsCount: events.length, filteredStoreIds })
      }
      
      // 店舗フィルタリング（固定費計算用）
      if (storeId !== 'all') {
        filteredStores = filteredStores.filter(s => s.id === storeId)
      }
      
      // 売上データを計算
      logger.log('📊 イベントデータ取得完了:', { eventsCount: events.length, filteredStoresCount: filteredStores.length })
      const data = calculateSalesData(events, filteredStores, startDate, endDate, miscTransactions || [])
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
 * フランチャイズ店舗向けのライセンス金額を取得
 * フランチャイズ料金が設定されていない（null/undefined/0）場合は内部用を使用
 */
function getFranchiseLicenseAmount(
  scenario: {
    franchise_license_amount?: number | null;
    franchise_gm_test_license_amount?: number | null;
    license_amount?: number | null;
    gm_test_license_amount?: number | null;
  },
  isGmTest: boolean
): number {
  if (isGmTest) {
    // 他店GMテスト用 → 他店通常用 → 通常GMテスト用 → 通常
    return (
      (scenario.franchise_gm_test_license_amount != null && scenario.franchise_gm_test_license_amount !== 0) 
        ? scenario.franchise_gm_test_license_amount 
        : (scenario.franchise_license_amount != null && scenario.franchise_license_amount !== 0)
          ? scenario.franchise_license_amount
          : (scenario.gm_test_license_amount != null && scenario.gm_test_license_amount !== 0)
            ? scenario.gm_test_license_amount
            : (scenario.license_amount ?? 0)
    )
  } else {
    // 他店通常用 → 通常
    return (
      (scenario.franchise_license_amount != null && scenario.franchise_license_amount !== 0)
        ? scenario.franchise_license_amount
        : (scenario.license_amount ?? 0)
    )
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
      franchise_license_amount?: number;
      franchise_gm_test_license_amount?: number;
      gm_costs?: Array<{ role: string; reward: number; category?: 'normal' | 'gmtest' }>;
      production_costs?: Array<{ item: string; amount: number; startDate?: string; endDate?: string; status?: string }>;
      required_props?: Array<{ item: string; amount: number; startDate?: string; endDate?: string; status?: string }>;
    };
    category?: string;
  }>,
  stores: Store[],
  startDate: Date,
  endDate: Date,
  miscTransactions: Array<{
    id: string;
    date: string;
    type: 'income' | 'expense';
    category: string;
    amount: number;
    scenario_id?: string;
  }>
): SalesData {
  const totalRevenue = events.reduce((sum, event) => sum + (event.revenue || 0), 0)
  const totalEvents = events.length
  const averageRevenuePerEvent = totalEvents > 0 ? totalRevenue / totalEvents : 0

  // ライセンス金額とGM給与を計算（過去の公演のみ）
  let totalLicenseCost = 0
  let totalGmCost = 0
  let totalFranchiseFee = 0
  
  const now = new Date()
  now.setHours(0, 0, 0, 0) // 今日の0時に設定

  events.forEach(event => {
    const eventDate = new Date(event.date)
    const isPastEvent = eventDate < now // 今日より前の公演のみ
    
    const scenario = event.scenarios
    if (scenario && isPastEvent) {
      // 店舗を検索（フランチャイズ判定用）
      const store = stores.find(s => s.id === event.store_id)
      const isFranchiseStore = store?.ownership_type === 'franchise'
      
      // ライセンス金額の計算（開催済み公演のみ）
      // 優先順位: 他店用 → 他店GMテスト用 → 通常
      const isGmTest = event.category === 'gmtest'
      let licenseAmount = 0

      if (isFranchiseStore) {
        // フランチャイズ店舗の場合（フランチャイズ料金が設定されていない場合は内部用を使用）
        licenseAmount = getFranchiseLicenseAmount(scenario, isGmTest)
      } else {
        // 直営店舗の場合（従来通り）
        licenseAmount = isGmTest 
          ? (scenario.gm_test_license_amount || 0)
          : (scenario.license_amount || 0)
      }
      
      totalLicenseCost += licenseAmount

      // GM給与の計算（時給ベース）
      if (scenario.gm_costs && scenario.gm_costs.length > 0) {
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
        
        // GM数を取得（gm_costsの数 = 必要なGM数）
        const gmCount = applicableGmCosts.length
        
        // 所要時間を取得（分単位）
        const durationMinutes = scenario.duration || 180 // デフォルト3時間
        
        // 時給ベースで1人あたりの給与を計算
        const wagePerGm = calculateHourlyWage(durationMinutes)
        
        // GM数分の給与を計上
        const gmCost = wagePerGm * gmCount
        
        totalGmCost += gmCost
      }
    }
  })

  // 店舗別売上ランキング
  const storeRevenues = new Map<string, { 
    revenue: number; 
    events: number; 
    name: string; 
    id: string;
    licenseCost: number;
    gmCost: number;
    franchiseFee: number;
  }>()
  
  events.forEach(event => {
    const eventDate = new Date(event.date)
    const isPastEvent = eventDate < now // 今日より前の公演のみ
    
    const storeId = event.store_id
    const store = stores.find(s => s.id === storeId)
    const storeName = store?.name || '不明'
    const isFranchiseStore = store?.ownership_type === 'franchise'
    
    if (!storeRevenues.has(storeId)) {
      // フランチャイズ店舗の場合、事務手数料（フランチャイズ手数料）を初期化
      const franchiseFee = (isFranchiseStore && store?.franchise_fee) ? store.franchise_fee : 0
      storeRevenues.set(storeId, { 
        revenue: 0, 
        events: 0, 
        name: storeName, 
        id: storeId,
        licenseCost: 0,
        gmCost: 0,
        franchiseFee
      })
    }
    
    const storeData = storeRevenues.get(storeId)!
    storeData.revenue += event.revenue || 0
    storeData.events += 1

    // 店舗別のライセンス金額とGM給与を計算（開催済み公演のみ）
    const scenario = event.scenarios
    if (scenario && isPastEvent) {
      const isGmTest = event.category === 'gmtest'
      const isFranchiseStore = store?.ownership_type === 'franchise'
      
      // ライセンス金額を取得（優先順位: 他店用 → 他店GMテスト用 → 通常）
      let licenseAmount = 0
      
      if (isFranchiseStore) {
        // フランチャイズ店舗の場合（フランチャイズ料金が設定されていない場合は内部用を使用）
        licenseAmount = getFranchiseLicenseAmount(scenario, isGmTest)
      } else {
        // 直営店舗の場合（従来通り）
        licenseAmount = isGmTest 
          ? (scenario.gm_test_license_amount || 0)
          : (scenario.license_amount || 0)
      }
      
      storeData.licenseCost += licenseAmount

      if (scenario.gm_costs && scenario.gm_costs.length > 0) {
        const actualGmCount = (event as SalesEvent).gms?.length || 0
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
        
        if (actualGmCount > 0) {
          // 実際のGM数がある場合、実際のGM数分だけ計算
          const gmCost = applicableGmCosts
            .slice(0, actualGmCount)
            .reduce((sum, gm) => sum + gm.reward, 0)
          storeData.gmCost += gmCost
        } else {
          // 実際のGM数が0の場合でも、シナリオ設定のgm_costsから計算
          // （シナリオ設定で必要なGM数分の給与を計算）
          const gmCost = applicableGmCosts.reduce((sum, gm) => sum + gm.reward, 0)
          storeData.gmCost += gmCost
        }
      }
    }
  })

  // フランチャイズ手数料の合計を計算（期間内に公演を行ったフランチャイズ店舗の手数料の合計）
  const franchiseStoreIds = new Set(storeRevenues.keys())
  franchiseStoreIds.forEach(storeId => {
    const store = stores.find(s => s.id === storeId)
    const storeData = storeRevenues.get(storeId)
    if (store?.ownership_type === 'franchise' && store.franchise_fee && storeData && storeData.events > 0) {
      // 期間内に公演を行ったフランチャイズ店舗の手数料を合計に加算
      totalFranchiseFee += store.franchise_fee
    }
  })

  const storeRanking = Array.from(storeRevenues.values())
    .map(store => ({
      ...store,
      averageRevenue: store.events > 0 ? store.revenue / store.events : 0,
      netProfit: store.revenue - store.licenseCost - store.gmCost - store.franchiseFee
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
    const eventDate = new Date(event.date)
    const isPastEvent = eventDate < now // 今日より前の公演のみ
    
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

    // シナリオ別のライセンス金額とGM給与を計算（開催済み公演のみ）
    const scenario = event.scenarios
    if (scenario && isPastEvent) {
      const store = stores.find(s => s.id === event.store_id)
      const isFranchiseStore = store?.ownership_type === 'franchise'
      const isGmTest = event.category === 'gmtest'
      
      // ライセンス金額を取得（優先順位: 他店用 → 他店GMテスト用 → 通常）
      let licenseAmount = 0
      
      if (isFranchiseStore) {
        // フランチャイズ店舗の場合（フランチャイズ料金が設定されていない場合は内部用を使用）
        licenseAmount = getFranchiseLicenseAmount(scenario, isGmTest)
      } else {
        // 直営店舗の場合（従来通り）
        licenseAmount = isGmTest 
          ? (scenario.gm_test_license_amount || 0)
          : (scenario.license_amount || 0)
      }
      
      scenarioData.licenseCost += licenseAmount

      if (scenario.gm_costs && scenario.gm_costs.length > 0) {
        const actualGmCount = (event as SalesEvent).gms?.length || 0
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
        
        if (actualGmCount > 0) {
          // 実際のGM数がある場合、実際のGM数分だけ計算
          const gmCost = applicableGmCosts
            .slice(0, actualGmCount)
            .reduce((sum, gm) => sum + gm.reward, 0)
          scenarioData.gmCost += gmCost
        } else {
          // 実際のGM数が0の場合でも、シナリオ設定のgm_costsから計算
          // （シナリオ設定で必要なGM数分の給与を計算）
          const gmCost = applicableGmCosts.reduce((sum, gm) => sum + gm.reward, 0)
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
      const store = stores.find(s => s.id === event.store_id)
      const isFranchiseStore = store?.ownership_type === 'franchise'
      const isGmTest = event.category === 'gmtest'
      
      // ライセンス金額を取得（優先順位: 他店用 → 他店GMテスト用 → 通常）
      let licenseAmount = 0
      
      if (isFranchiseStore) {
        // フランチャイズ店舗の場合（フランチャイズ料金が設定されていない場合は内部用を使用）
        licenseAmount = getFranchiseLicenseAmount(scenario, isGmTest)
      } else {
        // 直営店舗の場合（従来通り）
        licenseAmount = isGmTest 
          ? (scenario.gm_test_license_amount || 0)
          : (scenario.license_amount || 0)
      }
      
      current.licenseCost += licenseAmount

      if (scenario.gm_costs && scenario.gm_costs.length > 0) {
        const actualGmCount = (event as SalesEvent).gms?.length || 0
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
        
        if (actualGmCount > 0) {
          // 実際のGM数がある場合、実際のGM数分だけ計算
          const gmCost = applicableGmCosts
            .slice(0, actualGmCount)
            .reduce((sum, gm) => sum + gm.reward, 0)
          current.gmCost += gmCost
        } else {
          // 実際のGM数が0の場合でも、シナリオ設定のgm_costsから計算
          // （シナリオ設定で必要なGM数分の給与を計算）
          const gmCost = applicableGmCosts.reduce((sum, gm) => sum + gm.reward, 0)
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
    const eventDate = new Date(event.date)
    const isPastEvent = eventDate < now // 今日より前の公演のみ
    
    const scenario = event.scenarios
    let licenseCost = 0
    let gmCost = 0

    const eventStore = stores.find(s => s.id === event.store_id)
    const isFranchiseStore = eventStore?.ownership_type === 'franchise'
    const isGmTest = event.category === 'gmtest'

    // ライセンス金額を取得（シナリオがある場合のみ）
    if (scenario && isPastEvent) {
      // ライセンス金額を取得（優先順位: 他店用 → 他店GMテスト用 → 通常）
      if (isFranchiseStore) {
        // フランチャイズ店舗の場合（フランチャイズ料金が設定されていない場合は内部用を使用）
        licenseCost = getFranchiseLicenseAmount(scenario, isGmTest)
      } else {
        // 直営店舗の場合（従来通り）
        licenseCost = isGmTest 
          ? (scenario.gm_test_license_amount || 0)
          : (scenario.license_amount || 0)
      }
    }

    // GM給与計算: 個別GMの役割(gm_roles)を考慮
    // ※シナリオがなくても受付/スタッフ/見学の給与は計算する
    const gms = (event as SalesEvent).gms || []
    const gmRoles = (event as SalesEvent).gm_roles || {}
    
    // デバッグログ（NOVAK関連のみ）
    if (event.scenario?.includes('NOVAK') || (event as any).scenario_id === null) {
      logger.log('🔍 GM給与計算デバッグ:', {
        scenario: event.scenario,
        gms,
        gmRoles: JSON.stringify(gmRoles),
        isPastEvent,
        eventDate: event.date
      })
    }
    
    if (gms.length > 0 && isPastEvent) {
      // 各GMの役割に基づいて給与を計算
      gms.forEach((gmName, index) => {
        const role = gmRoles[gmName] || 'main' // デフォルトはmain
        
        if (role === 'reception') {
          // 受付は固定2,000円
          gmCost += 2000
          logger.log('🎯 受付GM給与追加:', { gmName, role, gmCost })
        } else if (role === 'staff' || role === 'observer') {
          // スタッフ参加・見学は0円
          gmCost += 0
        } else if (scenario && scenario.gm_costs && scenario.gm_costs.length > 0) {
          // main/subはシナリオのgm_costs設定から計算
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
          
          // 役割に対応するgm_cost設定を取得
          const roleIndex = role === 'sub' ? 1 : index
          const gmCostSetting = applicableGmCosts[roleIndex] || applicableGmCosts[0]
          if (gmCostSetting) {
            gmCost += gmCostSetting.reward
          }
        }
      })
    } else if (scenario && scenario.gm_costs && scenario.gm_costs.length > 0 && isPastEvent) {
      // GMが0人の場合でも、シナリオ設定のgm_costsから計算
      const applicableGmCosts = scenario.gm_costs
        .filter(gm => {
          const gmCategory = gm.category || 'normal'
          return gmCategory === (isGmTest ? 'gmtest' : 'normal')
        })
      gmCost = applicableGmCosts.reduce((sum, gm) => sum + gm.reward, 0)
    }

    const netProfit = (event.revenue || 0) - licenseCost - gmCost

    // 開始時間から終了時間を計算（シナリオのdurationを使用）
    const startTime = (event as SalesEvent).start_time || '10:00'
    let endTime = (event as SalesEvent).end_time || ''
    
    // end_timeが設定されていない場合、durationから計算
    if (!endTime && scenario?.duration && startTime) {
      const [startHour, startMinute] = startTime.split(':').map(Number)
      const startMinutes = startHour * 60 + startMinute
      const endMinutes = startMinutes + (scenario.duration * 60)
      const endHour = Math.floor(endMinutes / 60) % 24
      const endMin = endMinutes % 60
      endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`
    }
    
    if (!endTime) {
      endTime = startTime // フォールバック
    }

    return {
      id: event.id || `${event.date}-${event.store_id}-${event.scenario}`,
      date: event.date,
      store_id: event.store_id,
      store_name: eventStore?.name || '不明',
      scenario_id: event.scenario_id,
      scenario_title: event.scenario || '不明',
      start_time: startTime,
      end_time: endTime,
      gms: (event as SalesEvent).gms || [],
      gm_roles: (event as SalesEvent).gm_roles || {}, // GM役割を追加
      venue_rental_fee: (event as SalesEvent).venue_rental_fee, // 場所貸し公演料金
      revenue: event.revenue || 0,
      license_cost: licenseCost,
      gm_cost: gmCost,
      net_profit: netProfit,
      participant_count: (event as SalesEvent).actual_participants || event.current_participants || 0,
      max_participants: (event as SalesEvent).max_participants || (event as SalesEvent).capacity || 8,
      category: event.category,
      has_demo_participant: (event as SalesEvent).has_demo_participant || false
    }
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // 古い日付順でソート

  // 固定費の計算（期間内の各店舗の固定費を計算）
  let totalFixedCost = 0
  const fixedCostBreakdown: Array<{ item: string; amount: number; store: string }> = []
  
  // 期間内に含まれるカレンダー月数を計算
  const startMonth = startDate.getMonth()
  const endMonth = endDate.getMonth()
  const startYear = startDate.getFullYear()
  const endYear = endDate.getFullYear()
  const monthCount = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
  
  stores.forEach(store => {
    if (store.fixed_costs && Array.isArray(store.fixed_costs)) {
      store.fixed_costs.forEach((cost: any) => {
        // アクティブな固定費のみ計算
        const status = getFixedCostStatus(cost, startDate, endDate)
        if (status === 'active' || status === 'partial') {
          let amount = 0
          
          if (cost.frequency === 'monthly') {
            amount = cost.amount * monthCount
          } else if (cost.frequency === 'yearly') {
            amount = cost.amount * (monthCount / 12)
          } else if (cost.frequency === 'one-time') {
            // 一過性の費用が期間内に含まれるかチェック
            if (cost.startDate) {
              const costDate = new Date(cost.startDate)
              if (costDate >= startDate && costDate <= endDate) {
                amount = cost.amount
              }
            }
          }
          
          if (amount > 0) {
            totalFixedCost += amount
            fixedCostBreakdown.push({
              item: cost.item,
              amount,
              store: store.short_name || store.name
            })
          }
        }
      })
    }
  })

  // 制作費と必要道具の計算（発生月ベース）
  let totalProductionCost = 0
  let totalPropsCost = 0
  const productionCostBreakdown: Array<{ item: string; amount: number; scenario: string }> = []
  const propsCostBreakdown: Array<{ item: string; amount: number; scenario: string }> = []

  // 重複チェック用のSet（同じシナリオ・同じ項目の重複計上を防ぐ）
  const processedProductionCosts = new Set<string>()
  const processedPropsCosts = new Set<string>()

  events.forEach(event => {
    const scenario = event.scenarios
    if (!scenario) return

    // 制作費の計算
    if (scenario.production_costs && Array.isArray(scenario.production_costs)) {
      scenario.production_costs.forEach((cost: any) => {
        // アクティブな制作費のみ計算
        if (cost.status === 'active' && cost.startDate) {
          const costDate = new Date(cost.startDate)
          const costYear = costDate.getFullYear()
          const costMonth = costDate.getMonth()
          
          // 発生月が期間内に含まれるかチェック
          const isInPeriod = 
            (costYear > startYear || (costYear === startYear && costMonth >= startMonth)) &&
            (costYear < endYear || (costYear === endYear && costMonth <= endMonth))
          
          if (isInPeriod) {
            const key = `${event.scenario_id}-${cost.item}-${cost.startDate}`
            if (!processedProductionCosts.has(key)) {
              processedProductionCosts.add(key)
              totalProductionCost += cost.amount
              productionCostBreakdown.push({
                item: cost.item,
                amount: cost.amount,
                scenario: event.scenario || '不明'
              })
            }
          }
        }
      })
    }

    // 必要道具の計算
    if (scenario.required_props && Array.isArray(scenario.required_props)) {
      scenario.required_props.forEach((prop: any) => {
        // アクティブな道具費用のみ計算
        if (prop.status === 'active' && prop.startDate) {
          const propDate = new Date(prop.startDate)
          const propYear = propDate.getFullYear()
          const propMonth = propDate.getMonth()
          
          // 発生月が期間内に含まれるかチェック
          const isInPeriod = 
            (propYear > startYear || (propYear === startYear && propMonth >= startMonth)) &&
            (propYear < endYear || (propYear === endYear && propMonth <= endMonth))
          
          if (isInPeriod) {
            const key = `${event.scenario_id}-${prop.item}-${prop.startDate}`
            if (!processedPropsCosts.has(key)) {
              processedPropsCosts.add(key)
              totalPropsCost += prop.amount
              propsCostBreakdown.push({
                item: prop.item,
                amount: prop.amount,
                scenario: event.scenario || '不明'
              })
            }
          }
        }
      })
    }
  })

  // 雑収支データから制作費・道具費用を追加
  if (miscTransactions && miscTransactions.length > 0) {
    // シナリオIDからシナリオ名へのマップを作成（パフォーマンス最適化）
    const scenarioMap = new Map<string, string>()
    events.forEach(event => {
      if (event.scenario_id && event.scenario) {
        scenarioMap.set(event.scenario_id, event.scenario)
      }
    })
    
    miscTransactions.forEach(transaction => {
      if (transaction.scenario_id) {
        const transactionDate = new Date(transaction.date)
        const transYear = transactionDate.getFullYear()
        const transMonth = transactionDate.getMonth()
        
        // 発生月が期間内に含まれるかチェック
        const isInPeriod = 
          (transYear > startYear || (transYear === startYear && transMonth >= startMonth)) &&
          (transYear < endYear || (transYear === endYear && transMonth <= endMonth))
        
        if (isInPeriod) {
          const key = `misc-${transaction.id}`
          if (!processedProductionCosts.has(key)) {
            processedProductionCosts.add(key)
            totalProductionCost += transaction.amount
            productionCostBreakdown.push({
              item: transaction.category,
              amount: transaction.amount,
              scenario: scenarioMap.get(transaction.scenario_id) || '不明'
            })
          }
        }
      }
    })
  }

  // 変動費の計算（ライセンス費用 + GM給与 + 事務手数料（フランチャイズ手数料）+ 制作費 + 道具費用）
  const totalVariableCost = totalLicenseCost + totalGmCost + totalFranchiseFee + totalProductionCost + totalPropsCost
  const variableCostBreakdown = [
    { category: 'ライセンス費用', amount: totalLicenseCost },
    { category: 'GM給与', amount: totalGmCost },
    ...(totalFranchiseFee > 0 ? [{ category: '事務手数料', amount: totalFranchiseFee }] : []),
    { category: '制作費', amount: totalProductionCost },
    { category: '必要道具', amount: totalPropsCost }
  ]

  // 純利益の再計算（固定費も含める）
  const netProfitWithFixedCost = totalRevenue - totalVariableCost - totalFixedCost

  return {
    totalRevenue,
    totalEvents,
    averageRevenuePerEvent,
    totalLicenseCost,
    totalGmCost,
    totalProductionCost,
    totalPropsCost,
    totalFixedCost,
    fixedCostBreakdown,
    productionCostBreakdown,
    propsCostBreakdown,
    totalVariableCost,
    variableCostBreakdown,
    netProfit: netProfitWithFixedCost,
    storeRanking,
    scenarioRanking,
    chartData,
    eventList
  }
}

/**
 * 固定費のステータスを判定（期間内で有効かどうか）
 */
function getFixedCostStatus(
  cost: any,
  periodStart: Date,
  periodEnd: Date
): 'active' | 'partial' | 'inactive' {
  // 日付指定がない場合は常にアクティブ
  if (!cost.startDate && !cost.endDate) {
    return 'active'
  }
  
  const start = cost.startDate ? new Date(cost.startDate) : null
  const end = cost.endDate ? new Date(cost.endDate) : null
  
  // 終了日が期間開始前、または開始日が期間終了後なら inactive
  if ((end && end < periodStart) || (start && start > periodEnd)) {
    return 'inactive'
  }
  
  // 期間と重複している場合は active または partial
  return 'active'
}
