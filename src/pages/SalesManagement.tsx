import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { salesApi } from '@/lib/api'
import { SalesData } from '@/types'
import { supabase } from '@/lib/supabase'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import SalesSidebar from '@/components/layout/SalesSidebar'
import AuthorReport from './AuthorReport'
import { Calendar, TrendingUp, Store, BookOpen, DollarSign, Download, BarChart3, Users, Search, Filter } from 'lucide-react'
import { SortableTableHeader } from '@/components/ui/sortable-table-header'
import { useSortableTable } from '@/hooks/useSortableTable'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
)


interface Store {
  id: string
  name: string
  short_name: string
}

const SalesManagement: React.FC = () => {
  const [salesData, setSalesData] = useState<SalesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState('thisMonth')
  const [selectedStore, setSelectedStore] = useState('all')
  const [stores, setStores] = useState<Store[]>([])
  const [chartRef, setChartRef] = useState<any>(null)
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  })
  const [activeTab, setActiveTab] = useState('overview')

  // コンテンツの条件分岐表示
  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverviewContent()
      case 'scenario-performance':
        return renderScenarioPerformanceContent()
      case 'author-report':
        return renderAuthorReportContent()
      default:
        return renderOverviewContent()
    }
  }

  // 売上概要コンテンツ
  const renderOverviewContent = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">売上管理</h1>
        <div className="flex items-center gap-4">
          <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thisMonth">今月</SelectItem>
              <SelectItem value="lastMonth">先月</SelectItem>
              <SelectItem value="thisWeek">今週</SelectItem>
              <SelectItem value="lastWeek">先週</SelectItem>
              <SelectItem value="past7days">過去7日間</SelectItem>
              <SelectItem value="past30days">過去30日間</SelectItem>
              <SelectItem value="past90days">過去90日間</SelectItem>
              <SelectItem value="past180days">過去180日間</SelectItem>
              <SelectItem value="thisYear">今年</SelectItem>
              <SelectItem value="lastYear">昨年</SelectItem>
              <SelectItem value="custom">カスタム</SelectItem>
            </SelectContent>
          </Select>
          {selectedPeriod === 'custom' && (
            <div className="flex items-center gap-2">
              <Label htmlFor="startDate">開始日</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-40"
              />
              <Label htmlFor="endDate">終了日</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-40"
              />
            </div>
          )}
        </div>
      </div>

      {/* 期間表示 */}
      <div className="text-sm text-muted-foreground">
        期間: {dateRange.startDate} ～ {dateRange.endDate}
      </div>

      {/* 店舗選択 */}
      <div className="flex items-center gap-4">
        <Label htmlFor="storeSelect">店舗選択</Label>
        <Select value={selectedStore} onValueChange={setSelectedStore}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="店舗を選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全店舗</SelectItem>
            {stores.map((store) => (
              <SelectItem key={store.id} value={store.id.toString()}>
                {store.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 売上概要カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総売上</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(salesData?.totalRevenue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {salesData?.totalEvents || 0}回の公演
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均売上</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(salesData?.averageRevenuePerEvent || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              1公演あたり
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総公演数</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {salesData?.totalEvents || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              期間内の公演数
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">店舗数</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stores.length}
            </div>
            <p className="text-xs text-muted-foreground">
              登録店舗数
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ランキング表示（2カラム） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 店舗別売上ランキング */}
        <Card>
          <CardHeader>
            <CardTitle>店舗別売上ランキング</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {salesData?.storeRanking?.slice(0, 3).map((store, index) => (
                <div key={store.id || `store-${index}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium">{store.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {store.events}回の公演
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatCurrency(store.revenue)}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatCurrency(store.averageRevenue)}/回
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* シナリオ別売上ランキング */}
        <Card>
          <CardHeader>
            <CardTitle>シナリオ別売上ランキング</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {salesData?.scenarioRanking?.slice(0, 3).map((scenario, index) => (
                <div key={scenario.id || `scenario-${index}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium">{scenario.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {scenario.events}回の公演
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatCurrency(scenario.revenue)}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatCurrency(scenario.averageRevenue)}/回
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 売上推移グラフ */}
      <Card>
        <CardHeader>
          <CardTitle>売上推移</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            <Line data={prepareChartData() || { labels: [], datasets: [] }} options={chartOptions} ref={setChartRef} />
          </div>
        </CardContent>
      </Card>

      {/* データエクスポート */}
      <Card>
        <CardHeader>
          <CardTitle>データエクスポート</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button onClick={exportToCSV} disabled={loading}>
              CSVエクスポート
            </Button>
            <Button onClick={exportToExcel} disabled={loading}>
              Excelエクスポート
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )


  // シナリオ別公演数の状態管理
  const [scenarioData, setScenarioData] = useState<any[]>([])
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scenarioPeriod, setScenarioPeriod] = useState('thisMonth')
  const [scenarioStore, setScenarioStore] = useState('all')
  const [allScenarios, setAllScenarios] = useState<any[]>([])
  const [scenariosLoading, setScenariosLoading] = useState(false)
  const [scenarioSearch, setScenarioSearch] = useState('')
  const [scenarioCategory, setScenarioCategory] = useState('all')

  // ソート機能の設定（トップレベルで定義）
  type ScenarioSortField = 'title' | 'events' | 'totalRevenue' | 'totalCost' | 'operatingProfit' | 'productionCost' | 'netProfit' | 'recoveryRate' | 'breakEvenPoint'
  const { sortState, handleSort } = useSortableTable<ScenarioSortField>({
    storageKey: 'scenario-performance-sort',
    defaultField: 'title',
    defaultDirection: 'desc'
  })

  const fetchScenarioData = useCallback(async () => {
    if (!dateRange.startDate || !dateRange.endDate) return
    
    setScenarioLoading(true)
    try {
      const data = await salesApi.getScenarioPerformance(
        dateRange.startDate,
        dateRange.endDate,
        scenarioStore
      )
      setScenarioData(data)
    } catch (error) {
      console.error('シナリオ別公演データの取得に失敗しました:', error)
    } finally {
      setScenarioLoading(false)
    }
  }, [dateRange.startDate, dateRange.endDate, scenarioStore])

  // 期間選択の同期
  const handleScenarioPeriodChange = (period: string) => {
    setScenarioPeriod(period)
    handlePeriodChange(period)
  }

  // 全シナリオ一覧を取得
  const fetchAllScenarios = useCallback(async () => {
    setScenariosLoading(true)
    try {
      const { data, error } = await supabase
        .from('scenarios')
        .select('*')
        .order('title')
      
      if (error) throw error
      setAllScenarios(data || [])
    } catch (error) {
      console.error('シナリオ一覧の取得に失敗しました:', error)
    } finally {
      setScenariosLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'scenario-performance') {
      fetchScenarioData()
      fetchAllScenarios()
    }
  }, [activeTab, fetchScenarioData, fetchAllScenarios])

  // シナリオ別公演数コンテンツ
  const renderScenarioPerformanceContent = () => {
    const totalEvents = scenarioData.reduce((sum, scenario) => sum + scenario.events, 0)
    const totalScenarios = scenarioData.length
    const averageEventsPerScenario = totalScenarios > 0 ? Math.round(totalEvents / totalScenarios * 10) / 10 : 0
    const topScenario = scenarioData.length > 0 ? scenarioData[0] : null

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">シナリオ分析</h1>
        </div>

        {/* 期間表示 */}
        <div className="text-sm text-muted-foreground">
          期間: {dateRange.startDate} ～ {dateRange.endDate}
        </div>


        {/* 統計カード */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">期間営業利益</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(() => {
                const totalOperatingProfit = allScenarios
                  .map(scenario => {
                    const performanceData = scenarioData.find(s => s.title === scenario.title)
                    if (!performanceData) return 0
                    const events = performanceData.events as number
                    const avgParticipants = 6
                    const revenuePerEvent = scenario.participation_fee * avgParticipants
                    const totalRevenue = revenuePerEvent * events
                    const gmCost = scenario.gm_assignments?.[0]?.reward || 0
                    const licenseCost = scenario.license_costs?.find((c: any) => c.time_slot === '通常')?.amount || 0
                    const variableCostPerEvent = gmCost + licenseCost
                    const totalVariableCost = variableCostPerEvent * events
                    return totalRevenue - totalVariableCost
                  })
                  .reduce((sum, profit) => sum + profit, 0)
                return totalOperatingProfit >= 0 ? 'text-green-600' : 'text-red-600'
              })()}`}>
                ¥{(() => {
                  const totalOperatingProfit = allScenarios
                    .map(scenario => {
                      const performanceData = scenarioData.find(s => s.title === scenario.title)
                      if (!performanceData) return 0
                      const events = performanceData.events as number
                      const avgParticipants = 6
                      const revenuePerEvent = scenario.participation_fee * avgParticipants
                      const totalRevenue = revenuePerEvent * events
                      const gmCost = scenario.gm_assignments?.[0]?.reward || 0
                      const licenseCost = scenario.license_costs?.find((c: any) => c.time_slot === '通常')?.amount || 0
                      const variableCostPerEvent = gmCost + licenseCost
                      const totalVariableCost = variableCostPerEvent * events
                      return totalRevenue - totalVariableCost
                    })
                    .reduce((sum, profit) => sum + profit, 0)
                  return totalOperatingProfit.toLocaleString()
                })()}
              </div>
              <p className="text-xs text-muted-foreground">
                {dateRange.startDate} ～ {dateRange.endDate}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">期間純利益</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(() => {
                const totalNetProfit = allScenarios
                  .map(scenario => {
                    const performanceData = scenarioData.find(s => s.title === scenario.title)
                    if (!performanceData) return 0
                    const events = performanceData.events as number
                    const avgParticipants = 6
                    const revenuePerEvent = scenario.participation_fee * avgParticipants
                    const totalRevenue = revenuePerEvent * events
                    const gmCost = scenario.gm_assignments?.[0]?.reward || 0
                    const licenseCost = scenario.license_costs?.find((c: any) => c.time_slot === '通常')?.amount || 0
                    const productionCost = scenario.production_cost || 0
                    const variableCostPerEvent = gmCost + licenseCost
                    const totalVariableCost = variableCostPerEvent * events
                    const operatingProfit = totalRevenue - totalVariableCost
                    return operatingProfit - productionCost
                  })
                  .reduce((sum, profit) => sum + profit, 0)
                return totalNetProfit >= 0 ? 'text-green-600' : 'text-red-600'
              })()}`}>
                ¥{(() => {
                  const totalNetProfit = allScenarios
                    .map(scenario => {
                      const performanceData = scenarioData.find(s => s.title === scenario.title)
                      if (!performanceData) return 0
                      const events = performanceData.events as number
                      const avgParticipants = 6
                      const revenuePerEvent = scenario.participation_fee * avgParticipants
                      const totalRevenue = revenuePerEvent * events
                      const gmCost = scenario.gm_assignments?.[0]?.reward || 0
                      const licenseCost = scenario.license_costs?.find((c: any) => c.time_slot === '通常')?.amount || 0
                      const productionCost = scenario.production_cost || 0
                      const variableCostPerEvent = gmCost + licenseCost
                      const totalVariableCost = variableCostPerEvent * events
                      const operatingProfit = totalRevenue - totalVariableCost
                      return operatingProfit - productionCost
                    })
                    .reduce((sum, profit) => sum + profit, 0)
                  return totalNetProfit.toLocaleString()
                })()}
              </div>
              <p className="text-xs text-muted-foreground">
                制作費を差し引いた純利益
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">収益性シナリオ</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(() => {
                const profitableScenarios = allScenarios.filter(scenario => {
                  const performanceData = scenarioData.find(s => s.title === scenario.title)
                  if (!performanceData) return false
                  const events = performanceData.events as number
                  const avgParticipants = 6
                  const revenuePerEvent = scenario.participation_fee * avgParticipants
                  const totalRevenue = revenuePerEvent * events
                  const gmCost = scenario.gm_assignments?.[0]?.reward || 0
                  const licenseCost = scenario.license_costs?.find((c: any) => c.time_slot === '通常')?.amount || 0
                  const productionCost = scenario.production_cost || 0
                  const variableCostPerEvent = gmCost + licenseCost
                  const totalVariableCost = variableCostPerEvent * events
                  const operatingProfit = totalRevenue - totalVariableCost
                  const netProfit = operatingProfit - productionCost
                  return netProfit >= 0
                }).length
                const totalScenarios = allScenarios.length
                return `${profitableScenarios}/${totalScenarios}`
              })()}</div>
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const profitableScenarios = allScenarios.filter(scenario => {
                    const performanceData = scenarioData.find(s => s.title === scenario.title)
                    if (!performanceData) return false
                    const events = performanceData.events as number
                    const avgParticipants = 6
                    const revenuePerEvent = scenario.participation_fee * avgParticipants
                    const totalRevenue = revenuePerEvent * events
                    const gmCost = scenario.gm_assignments?.[0]?.reward || 0
                    const licenseCost = scenario.license_costs?.find((c: any) => c.time_slot === '通常')?.amount || 0
                    const productionCost = scenario.production_cost || 0
                    const variableCostPerEvent = gmCost + licenseCost
                    const totalVariableCost = variableCostPerEvent * events
                    const operatingProfit = totalRevenue - totalVariableCost
                    const netProfit = operatingProfit - productionCost
                    return netProfit >= 0
                  }).length
                  const totalScenarios = allScenarios.length
                  const percentage = totalScenarios > 0 ? Math.round((profitableScenarios / totalScenarios) * 100) : 0
                  return `利益出てるシナリオ ${percentage}%`
                })()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">投資効率</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(() => {
                const avgRecoveryRate = (() => {
                  const recoveryRates = allScenarios
                    .map(scenario => {
                      const performanceData = scenarioData.find(s => s.title === scenario.title)
                      if (!performanceData) return 0
                      const events = performanceData.events as number
                      const avgParticipants = 6
                      const revenuePerEvent = scenario.participation_fee * avgParticipants
                      const totalRevenue = revenuePerEvent * events
                      const gmCost = scenario.gm_assignments?.[0]?.reward || 0
                      const licenseCost = scenario.license_costs?.find((c: any) => c.time_slot === '通常')?.amount || 0
                      const productionCost = scenario.production_cost || 0
                      const variableCostPerEvent = gmCost + licenseCost
                      const totalVariableCost = variableCostPerEvent * events
                      const operatingProfit = totalRevenue - totalVariableCost
                      const netProfit = operatingProfit - productionCost
                      return productionCost > 0 ? (netProfit / productionCost) * 100 : 0
                    })
                    .filter(rate => rate > 0)
                  return recoveryRates.length > 0 ? recoveryRates.reduce((sum, rate) => sum + rate, 0) / recoveryRates.length : 0
                })()
                return avgRecoveryRate >= 100 ? 'text-green-600' : 'text-red-600'
              })()}`}>
                {(() => {
                  const avgRecoveryRate = (() => {
                    const recoveryRates = allScenarios
                      .map(scenario => {
                        const performanceData = scenarioData.find(s => s.title === scenario.title)
                        if (!performanceData) return 0
                        const events = performanceData.events as number
                        const avgParticipants = 6
                        const revenuePerEvent = scenario.participation_fee * avgParticipants
                        const totalRevenue = revenuePerEvent * events
                        const gmCost = scenario.gm_assignments?.[0]?.reward || 0
                        const licenseCost = scenario.license_costs?.find((c: any) => c.time_slot === '通常')?.amount || 0
                        const productionCost = scenario.production_cost || 0
                        const variableCostPerEvent = gmCost + licenseCost
                        const totalVariableCost = variableCostPerEvent * events
                        const operatingProfit = totalRevenue - totalVariableCost
                        const netProfit = operatingProfit - productionCost
                        return productionCost > 0 ? (netProfit / productionCost) * 100 : 0
                      })
                      .filter(rate => rate > 0)
                    return recoveryRates.length > 0 ? recoveryRates.reduce((sum, rate) => sum + rate, 0) / recoveryRates.length : 0
                  })()
                  return avgRecoveryRate.toFixed(1) + '%'
                })()}
              </div>
              <p className="text-xs text-muted-foreground">
                投資回収率（100%で回収）
              </p>
            </CardContent>
          </Card>
        </div>


        {/* シナリオ一覧 - シナリオ管理ページと同じテーブル形式 */}
        <div className="space-y-1">
          {/* 検索・フィルター */}
          <div className="flex justify-between items-center gap-4 mb-4">
            <div className="flex gap-4 items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="シナリオ名、作者で検索..."
                  value={scenarioSearch}
                  onChange={(e) => setScenarioSearch(e.target.value)}
                  className="pl-10 pr-4"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={scenarioCategory} onValueChange={setScenarioCategory}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全て</SelectItem>
                    {Array.from(new Set(allScenarios.map(s => s.category).filter(Boolean))).map(category => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground">
              表示件数: {allScenarios.filter(scenario => {
                const matchesSearch = scenario.title.toLowerCase().includes(scenarioSearch.toLowerCase()) ||
                                    (scenario.author && scenario.author.toLowerCase().includes(scenarioSearch.toLowerCase()))
                const matchesCategory = scenarioCategory === 'all' || scenario.category === scenarioCategory
                return matchesSearch && matchesCategory
              }).length}件
            </div>
          </div>

          {/* ヘッダー行 */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center h-[50px] bg-muted/30">
                <SortableTableHeader
                  field="title"
                  currentField={sortState.field}
                  currentDirection={sortState.direction}
                  onSort={handleSort}
                  className="flex-shrink-0 w-40 px-3 py-2 border-r font-medium text-sm"
                >
                  シナリオ名
                </SortableTableHeader>
                <SortableTableHeader
                  field="events"
                  currentField={sortState.field}
                  currentDirection={sortState.direction}
                  onSort={handleSort}
                  className="flex-shrink-0 w-24 px-3 py-2 border-r font-medium text-sm text-right"
                >
                  公演数
                </SortableTableHeader>
                <SortableTableHeader
                  field="totalRevenue"
                  currentField={sortState.field}
                  currentDirection={sortState.direction}
                  onSort={handleSort}
                  className="flex-shrink-0 w-28 px-3 py-2 border-r font-medium text-sm text-right"
                >
                  売上
                </SortableTableHeader>
                <SortableTableHeader
                  field="totalCost"
                  currentField={sortState.field}
                  currentDirection={sortState.direction}
                  onSort={handleSort}
                  className="flex-shrink-0 w-28 px-3 py-2 border-r font-medium text-sm text-right"
                >
                  コスト
                </SortableTableHeader>
                <SortableTableHeader
                  field="operatingProfit"
                  currentField={sortState.field}
                  currentDirection={sortState.direction}
                  onSort={handleSort}
                  className="flex-shrink-0 w-28 px-3 py-2 border-r font-medium text-sm text-right"
                >
                  営業利益
                </SortableTableHeader>
                <SortableTableHeader
                  field="productionCost"
                  currentField={sortState.field}
                  currentDirection={sortState.direction}
                  onSort={handleSort}
                  className="flex-shrink-0 w-24 px-3 py-2 border-r font-medium text-sm text-right"
                >
                  制作費
                </SortableTableHeader>
                <SortableTableHeader
                  field="netProfit"
                  currentField={sortState.field}
                  currentDirection={sortState.direction}
                  onSort={handleSort}
                  className="flex-shrink-0 w-24 px-3 py-2 border-r font-medium text-sm text-right"
                >
                  純利益
                </SortableTableHeader>
                <SortableTableHeader
                  field="recoveryRate"
                  currentField={sortState.field}
                  currentDirection={sortState.direction}
                  onSort={handleSort}
                  className="flex-shrink-0 w-20 px-3 py-2 border-r font-medium text-sm text-right"
                >
                  回収率
                </SortableTableHeader>
                <SortableTableHeader
                  field="breakEvenPoint"
                  currentField={sortState.field}
                  currentDirection={sortState.direction}
                  onSort={handleSort}
                  className="flex-shrink-0 w-24 px-3 py-2 font-medium text-sm text-right"
                >
                  損益分岐点
                </SortableTableHeader>
              </div>
            </CardContent>
          </Card>

          {/* シナリオデータ行 */}
          <div className="h-[800px] overflow-y-auto space-y-1">
            {scenariosLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-lg">シナリオ一覧を読み込み中...</div>
              </div>
            ) : allScenarios
              .filter(scenario => {
                const matchesSearch = scenario.title.toLowerCase().includes(scenarioSearch.toLowerCase()) ||
                                    (scenario.author && scenario.author.toLowerCase().includes(scenarioSearch.toLowerCase()))
                const matchesCategory = scenarioCategory === 'all' || scenario.category === scenarioCategory
                return matchesSearch && matchesCategory
              })
              .map((scenario, index) => {
                const performanceData = scenarioData.find(s => s.title === scenario.title)
                
                // 利益計算
                const events = performanceData ? (performanceData.events as number) : 0
                const avgParticipants = 6 // 仮の平均参加者数
                const revenuePerEvent = scenario.participation_fee * avgParticipants
                const totalRevenue = revenuePerEvent * events

                const gmCost = scenario.gm_assignments?.[0]?.reward || 0
                const licenseCost = scenario.license_costs?.find((c: any) => c.time_slot === '通常')?.amount || 0
                const productionCost = scenario.production_cost || 0
                const variableCostPerEvent = gmCost + licenseCost
                const totalVariableCost = variableCostPerEvent * events

                const operatingProfit = totalRevenue - totalVariableCost
                const netProfit = operatingProfit - productionCost
                const recoveryRate = productionCost > 0 ? (netProfit / productionCost) * 100 : 0
                const breakEvenPoint = variableCostPerEvent > 0 ? Math.ceil(productionCost / (revenuePerEvent - variableCostPerEvent)) : 0

                return {
                  ...scenario,
                  events,
                  totalRevenue,
                  totalCost: totalVariableCost,
                  operatingProfit,
                  productionCost,
                  netProfit,
                  recoveryRate,
                  breakEvenPoint
                }
              })
              .sort((a, b) => {
                const { field, direction } = sortState
                let aValue = a[field as keyof typeof a]
                let bValue = b[field as keyof typeof b]

                if (typeof aValue === 'string') {
                  aValue = aValue.toLowerCase()
                  bValue = (bValue as string).toLowerCase()
                }

                if (aValue < bValue) return direction === 'asc' ? -1 : 1
                if (aValue > bValue) return direction === 'asc' ? 1 : -1
                return 0
              })
              .map((scenario, index) => {
                // ソート済みデータから値を取得
                const events = scenario.events
                const totalRevenue = scenario.totalRevenue
                const totalVariableCost = scenario.totalCost
                const operatingProfit = scenario.operatingProfit
                const productionCost = scenario.productionCost
                const netProfit = scenario.netProfit
                const recoveryRate = scenario.recoveryRate
                const breakEvenPoint = scenario.breakEvenPoint
                
                // 1回あたりの計算
                const avgParticipants = 6
                const revenuePerEvent = scenario.participation_fee * avgParticipants
                const gmCost = scenario.gm_assignments?.[0]?.reward || 0
                const licenseCost = scenario.license_costs?.find((c: any) => c.time_slot === '通常')?.amount || 0
                const variableCostPerEvent = gmCost + licenseCost

                return (
                  <Card key={scenario.id}>
                    <CardContent className="p-0">
                      <div className="flex items-center min-h-[60px]">
                        {/* シナリオ名 */}
                        <div className="flex-shrink-0 w-40 px-3 py-2 border-r">
                          <p className="font-medium text-sm truncate" title={scenario.title}>
                            {scenario.title}
                          </p>
                        </div>

                        {/* 公演数 */}
                        <div className="flex-shrink-0 w-24 px-3 py-2 border-r">
                          <p className="text-sm text-right">{events}</p>
                        </div>

                        {/* 売上 */}
                        <div className="flex-shrink-0 w-28 px-3 py-2 border-r">
                          <div className="text-right">
                            <p className="text-sm font-medium">¥{totalRevenue.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">¥{revenuePerEvent.toLocaleString()}/回</p>
                          </div>
                        </div>

                        {/* コスト */}
                        <div className="flex-shrink-0 w-28 px-3 py-2 border-r">
                          <div className="text-right">
                            <p className="text-sm font-medium">¥{totalVariableCost.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">¥{variableCostPerEvent.toLocaleString()}/回</p>
                          </div>
                        </div>

                        {/* 営業利益 */}
                        <div className="flex-shrink-0 w-28 px-3 py-2 border-r">
                          <div className="text-right">
                            <p className={`text-sm font-medium ${operatingProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ¥{operatingProfit.toLocaleString()}
                            </p>
                            <p className={`text-xs ${(revenuePerEvent - variableCostPerEvent) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ¥{(revenuePerEvent - variableCostPerEvent).toLocaleString()}/回
                            </p>
                          </div>
                        </div>

                        {/* 制作費 */}
                        <div className="flex-shrink-0 w-24 px-3 py-2 border-r">
                          <p className="text-sm text-right">¥{productionCost.toLocaleString()}</p>
                        </div>

                        {/* 純利益 */}
                        <div className="flex-shrink-0 w-24 px-3 py-2 border-r">
                          <p className={`text-sm text-right ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ¥{netProfit.toLocaleString()}
                          </p>
                        </div>

                        {/* 回収率 */}
                        <div className="flex-shrink-0 w-20 px-3 py-2 border-r">
                          <p className={`text-sm text-right ${recoveryRate >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                            {recoveryRate.toFixed(1)}%
                          </p>
                        </div>

                        {/* 損益分岐点 */}
                        <div className="flex-shrink-0 w-24 px-3 py-2">
                          <p className="text-sm text-right">{breakEvenPoint}回</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
          </div>

          {/* 検索結果が空の場合 */}
          {allScenarios.filter(scenario => {
            const matchesSearch = scenario.title.toLowerCase().includes(scenarioSearch.toLowerCase()) ||
                                (scenario.author && scenario.author.toLowerCase().includes(scenarioSearch.toLowerCase()))
            const matchesCategory = scenarioCategory === 'all' || scenario.category === scenarioCategory
            return matchesSearch && matchesCategory
          }).length === 0 && !scenariosLoading && (
            <Card>
              <CardContent className="pt-6 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {scenarioSearch || scenarioCategory !== 'all' 
                    ? '検索条件に一致するシナリオが見つかりません' 
                    : 'シナリオが登録されていません'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* シナリオ分析サマリー */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>人気シナリオTOP5</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {scenarioData.slice(0, 5).map((scenario, index) => (
                  <div key={scenario.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{scenario.title}</div>
                        <div className="text-xs text-muted-foreground">{scenario.author}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{scenario.events}回</div>
                      <div className="text-xs text-muted-foreground">
                        {((scenario.events / totalEvents) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>作者別公演数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(
                  scenarioData.reduce((acc, scenario) => {
                    acc[scenario.author] = (acc[scenario.author] || 0) + scenario.events
                    return acc
                  }, {} as Record<string, number>)
                )
                .sort(([,a], [,b]) => (b as number) - (a as number))
                .slice(0, 5)
                .map(([author, events], index) => (
                  <div key={author} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                      <div className="font-medium">{author}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{events as number}回</div>
                      <div className="text-xs text-muted-foreground">
                        {(((events as number) / totalEvents) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }


  // 作者レポートコンテンツ
  const renderAuthorReportContent = () => <AuthorReport />

  // dateRangeの変化を監視（デバッグ用）
  // useEffect(() => {
  //   console.log('dateRange変化:', dateRange.startDate, '～', dateRange.endDate)
  // }, [dateRange])

  // 期間選択の初期化
  useEffect(() => {
    // 初期化時にhandlePeriodChangeを呼び出して統一する
    handlePeriodChange('thisMonth')
  }, [])

  // 店舗一覧を取得
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const storeData = await salesApi.getStores()
        setStores(storeData)
      } catch (error) {
        console.error('店舗データの取得に失敗しました:', error)
      }
    }
    fetchStores()
  }, [])


  // 期間変更ハンドラー
  const handlePeriodChange = useCallback((period: string) => {
    setSelectedPeriod(period)
    
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
  }, [])

  // 売上データを取得
  const fetchSalesData = useCallback(async () => {
    setLoading(true)
    try {
      // 期間に応じてグラフ用のデータ取得期間を決定
      const startDate = new Date(dateRange.startDate + 'T00:00:00+09:00')
      const endDate = new Date(dateRange.endDate + 'T23:59:59+09:00')
      const daysDiff = getDaysDiff(startDate, endDate)
      
      let chartStartDate: Date
      let chartEndDate: Date
      let isMonthlyChart = false
      
      if (daysDiff <= 31) {
        // 31日以内の場合は日別グラフ（選択期間のデータ）
        chartStartDate = new Date(startDate)
        chartEndDate = new Date(endDate)
        isMonthlyChart = false
      } else {
        // 32日以上の場合は月別グラフ（1年分）
        chartStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
        chartEndDate = new Date(startDate.getFullYear() + 1, startDate.getMonth(), 0)
        isMonthlyChart = true
      }
      
      let events = await salesApi.getSalesByPeriod(
        formatDateJST(chartStartDate),
        formatDateJST(chartEndDate)
      )
      
      // 店舗フィルタリング
      if (selectedStore !== 'all') {
        events = events.filter(event => event.store_id === selectedStore)
      }

      // 選択期間内のデータのみで売上計算（概要カード用）
      const selectedPeriodEvents = events.filter(event => {
        const eventDate = new Date(event.date)
        const start = new Date(dateRange.startDate)
        const end = new Date(dateRange.endDate)
        return eventDate >= start && eventDate <= end
      })

      // 前年同期データを取得
      const currentYear = new Date(dateRange.startDate + 'T00:00:00+09:00').getFullYear()
      const previousYearStart = dateRange.startDate.replace(currentYear.toString(), (currentYear - 1).toString())
      const previousYearEnd = dateRange.endDate.replace(currentYear.toString(), (currentYear - 1).toString())
      
      let previousYearEvents = await salesApi.getSalesByPeriod(previousYearStart, previousYearEnd)
      if (selectedStore !== 'all') {
        previousYearEvents = previousYearEvents.filter(event => event.store_id === selectedStore)
      }

      // 前月データを取得
      const currentDateForMonth = new Date(dateRange.startDate + 'T00:00:00+09:00')
      const previousMonthStart = new Date(currentDateForMonth.getFullYear(), currentDateForMonth.getMonth() - 1, 1)
      const previousMonthEnd = new Date(currentDateForMonth.getFullYear(), currentDateForMonth.getMonth(), 0)
      
      let previousMonthEvents = await salesApi.getSalesByPeriod(
        formatDateJST(previousMonthStart),
        formatDateJST(previousMonthEnd)
      )
      if (selectedStore !== 'all') {
        previousMonthEvents = previousMonthEvents.filter(event => event.store_id === selectedStore)
      }
      
      // 売上データを計算（選択期間内のデータのみ）
      const totalRevenue = selectedPeriodEvents.reduce((sum, event) => {
        const participationFee = event.scenarios?.participation_fee || 0
        return sum + participationFee
      }, 0)

      const totalEvents = selectedPeriodEvents.length
      const averageRevenuePerEvent = totalEvents > 0 ? totalRevenue / totalEvents : 0

      // 前年同期データを計算
      const previousYearRevenue = previousYearEvents.reduce((sum, event) => {
        const participationFee = event.scenarios?.participation_fee || 0
        return sum + participationFee
      }, 0)
      const previousYearEventsCount = previousYearEvents.length
      const previousYearAverageRevenuePerEvent = previousYearEventsCount > 0 ? previousYearRevenue / previousYearEventsCount : 0

      // 前月データを計算
      const previousMonthRevenue = previousMonthEvents.reduce((sum, event) => {
        const participationFee = event.scenarios?.participation_fee || 0
        return sum + participationFee
      }, 0)
      const previousMonthEventsCount = previousMonthEvents.length
      const previousMonthAverageRevenuePerEvent = previousMonthEventsCount > 0 ? previousMonthRevenue / previousMonthEventsCount : 0

      // 店舗別集計（選択期間内のデータのみ）
      const storeMap = new Map()
      selectedPeriodEvents.forEach(event => {
        // 店舗名をvenueフィールドから直接取得
        const storeName = event.venue || '不明な店舗'
        const scenarioTitle = event.scenarios?.title
        const participationFee = event.scenarios?.participation_fee || 0
        
        // デバッグログ
        console.log('店舗別集計デバッグ:', {
          eventId: event.id,
          venue: event.venue,
          storeName: storeName,
          scenarioTitle: scenarioTitle,
          participationFee
        })
        
        if (storeMap.has(storeName)) {
          const existing = storeMap.get(storeName)
          existing.revenue += participationFee
          existing.events += 1
        } else {
          storeMap.set(storeName, {
            name: storeName,
            revenue: participationFee,
            events: 1
          })
        }
      })

      // 店舗別の平均売上を計算
      storeMap.forEach(store => {
        store.averageRevenue = store.events > 0 ? store.revenue / store.events : 0
      })

      // シナリオ別集計（選択期間内のデータのみ）
      const scenarioMap = new Map()
      selectedPeriodEvents.forEach(event => {
        const title = event.scenarios?.title || '不明なシナリオ'
        const author = event.scenarios?.author || '不明な作者'
        const participationFee = event.scenarios?.participation_fee || 0
        const key = `${title}-${author}`
        
        if (scenarioMap.has(key)) {
          const existing = scenarioMap.get(key)
          existing.revenue += participationFee
          existing.events += 1
        } else {
          scenarioMap.set(key, {
            title,
            author,
            revenue: participationFee,
            events: 1
          })
        }
      })

      // シナリオ別の平均売上を計算
      scenarioMap.forEach(scenario => {
        scenario.averageRevenue = scenario.events > 0 ? scenario.revenue / scenario.events : 0
      })

      // 期間に応じて日別または月別集計
      let chartData: Array<{ month: string; revenue: number; events: number }> = []
      
      if (isMonthlyChart) {
        // 月別集計（1年分のデータを生成）
        const monthlyMap = new Map()
        
        // 1年分の月を生成（開始月から12ヶ月分）
        const currentDateForYear = new Date(chartStartDate)
        for (let i = 0; i < 12; i++) {
          const monthKey = `${currentDateForYear.getFullYear()}-${String(currentDateForYear.getMonth() + 1).padStart(2, '0')}`
          monthlyMap.set(monthKey, {
            month: monthKey,
            revenue: 0,
            events: 0
          })
          currentDateForYear.setMonth(currentDateForYear.getMonth() + 1)
        }
        
        // 実際のイベントデータを集計（1年分のデータから）
        events.forEach(event => {
          const date = new Date(event.date)
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          const participationFee = event.scenarios?.participation_fee || 0
          
          if (monthlyMap.has(monthKey)) {
            const existing = monthlyMap.get(monthKey)
            existing.revenue += participationFee
            existing.events += 1
          }
        })
        
        chartData = Array.from(monthlyMap.values())
      } else {
        // 日別集計
        const dailyMap = new Map()
        
        // 期間内の日を生成
        const currentDate = new Date(chartStartDate)
        while (currentDate <= chartEndDate) {
          const dayKey = formatDateJST(currentDate)
          dailyMap.set(dayKey, {
            month: dayKey,
            revenue: 0,
            events: 0
          })
          currentDate.setDate(currentDate.getDate() + 1)
        }
        
        // 実際のイベントデータを集計
        events.forEach(event => {
          const date = new Date(event.date)
          const dayKey = formatDateJST(date)
          const participationFee = event.scenarios?.participation_fee || 0
          
          if (dailyMap.has(dayKey)) {
            const existing = dailyMap.get(dayKey)
            existing.revenue += participationFee
            existing.events += 1
          }
        })
        
        chartData = Array.from(dailyMap.values())
      }

      setSalesData({
        totalRevenue,
        totalEvents,
        averageRevenuePerEvent,
        storeRanking: Array.from(storeMap.values()).sort((a, b) => b.revenue - a.revenue),
        scenarioRanking: Array.from(scenarioMap.values()).sort((a, b) => b.revenue - a.revenue),
        monthlyRevenue: chartData.sort((a, b) => a.month.localeCompare(b.month)),
        dailyRevenue: [],
      })
    } catch (error) {
      console.error('売上データの取得に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }, [dateRange, selectedStore])

  // 初期データ読み込み
  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      fetchSalesData()
    }
  }, [fetchSalesData])

  // 通貨フォーマット
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const cn = (...classes: (string | undefined | null | false)[]) => {
    return classes.filter(Boolean).join(' ')
  }

  // 成長率計算
  const calculateGrowthRate = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0
    return ((current - previous) / previous) * 100
  }


  // 複数比較表示コンポーネント
  const MultiComparisonDisplay: React.FC<{ 
    current: number; 
    previousYear: number; 
    previousMonth: number; 
    label: string 
  }> = ({ current, previousYear, previousMonth, label }) => {
    const yearGrowthRate = calculateGrowthRate(current, previousYear)
    const monthGrowthRate = calculateGrowthRate(current, previousMonth)
    
    return (
      <div className="text-right space-y-1">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="flex gap-2 text-xs">
          <div className={`font-medium ${yearGrowthRate > 0 ? 'text-green-600' : yearGrowthRate < 0 ? 'text-red-600' : 'text-gray-600'}`}>
            前年同期: {yearGrowthRate > 0 ? '+' : ''}{yearGrowthRate.toFixed(1)}%
          </div>
          <div className={`font-medium ${monthGrowthRate > 0 ? 'text-green-600' : monthGrowthRate < 0 ? 'text-red-600' : 'text-gray-600'}`}>
            前月比: {monthGrowthRate > 0 ? '+' : ''}{monthGrowthRate.toFixed(1)}%
          </div>
        </div>
      </div>
    )
  }


  // トレンド分析機能
  const analyzeTrend = (data: Array<{ month: string; revenue: number }>) => {
    if (data.length < 2) return { trend: 'insufficient', direction: 'データ不足', confidence: 0 }

    // 線形回帰でトレンドを計算
    const n = data.length
    const x = data.map((_, index) => index)
    const y = data.map(d => d.revenue)
    
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const avgRevenue = sumY / n
    const trendStrength = Math.abs(slope) / avgRevenue * 100

    let trend: 'up' | 'down' | 'stable' = 'stable'
    let direction = '横ばい'
    let confidence = Math.min(trendStrength, 100)

    if (slope > avgRevenue * 0.05) { // 5%以上の上昇
      trend = 'up'
      direction = '上昇傾向'
    } else if (slope < -avgRevenue * 0.05) { // 5%以上の下降
      trend = 'down'
      direction = '下降傾向'
    }

    return { trend, direction, confidence }
  }

  // トレンド表示コンポーネント
  const TrendDisplay: React.FC<{ data: Array<{ month: string; revenue: number }> }> = ({ data }) => {
    const analysis = analyzeTrend(data)
    
    if (analysis.trend === 'insufficient') {
      return (
        <div className="text-right">
          <div className="text-sm text-muted-foreground">トレンド分析</div>
          <div className="text-sm text-gray-500">データ不足</div>
        </div>
      )
    }

    const isUp = analysis.trend === 'up'
    const isDown = analysis.trend === 'down'
    
    return (
      <div className="text-right">
        <div className="text-sm text-muted-foreground">トレンド分析</div>
        <div className={`text-sm font-medium ${isUp ? 'text-green-600' : isDown ? 'text-red-600' : 'text-gray-600'}`}>
          {analysis.direction}
        </div>
        <div className="text-xs text-muted-foreground">
          信頼度: {analysis.confidence.toFixed(1)}%
        </div>
      </div>
    )
  }

  // グラフ用のデータを準備
  const prepareChartData = () => {
    if (!salesData) return null

    // 期間に応じてラベルを変更
    const startDate = new Date(dateRange.startDate + 'T00:00:00+09:00')
    const endDate = new Date(dateRange.endDate + 'T23:59:59+09:00')
    const daysDiff = getDaysDiff(startDate, endDate)
    
    const labels = salesData.monthlyRevenue.map(item => {
      if (daysDiff <= 31) {
        // 日別表示
        const [, month, day] = item.month.split('-')
        return `${month}/${day}`
      } else {
        // 月別表示
        const [year, monthNum] = item.month.split('-')
        return `${year}/${monthNum}`
      }
    })

    const revenueData = salesData.monthlyRevenue.map(month => month.revenue)
    const eventData = salesData.monthlyRevenue.map(month => month.events)

    return {
      labels,
      datasets: [
        {
          label: '売上',
          data: revenueData,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          yAxisID: 'y',
          type: 'line' as const,
          tension: 0.4,
        },
        {
          label: '公演数',
          data: eventData,
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          yAxisID: 'y1',
          type: 'bar' as const,
        },
      ],
    } as any
  }

  // 選択された店舗名を取得
  const getSelectedStoreName = () => {
    if (selectedStore === 'all') return '全店舗'
    const store = stores.find(s => s.id === selectedStore)
    return store ? store.name : '全店舗'
  }

  // CSVエクスポート機能
  const exportToCSV = () => {
    if (!salesData) return

    const csvData = [
      ['売上管理レポート'],
      [`期間: ${dateRange.startDate} ～ ${dateRange.endDate}`],
      [`店舗: ${getSelectedStoreName()}`],
      [''],
      ['概要'],
      ['総売上', formatCurrency(salesData.totalRevenue)],
      ['総公演数', `${salesData.totalEvents}回`],
      ['平均売上/公演', formatCurrency(salesData.averageRevenuePerEvent)],
      [''],
      ['店舗別売上ランキング'],
      ['順位', '店舗名', '売上', '公演数'],
      ...salesData.storeRanking.map((store, index) => [
        index + 1,
        store.name,
        formatCurrency(store.revenue),
        `${store.events}回`
      ]),
      [''],
      ['シナリオ別売上ランキング'],
      ['順位', 'シナリオ名', '作者', '売上', '公演数'],
      ...salesData.scenarioRanking.map((scenario, index) => [
        index + 1,
        scenario.title,
        formatCurrency(scenario.revenue),
        `${scenario.events}回`
      ]),
      [''],
      ['月別売上推移'],
      ['月', '売上', '公演数'],
      ...salesData.monthlyRevenue.map(month => [
        month.month,
        formatCurrency(month.revenue),
        `${month.events}回`
      ])
    ]

    const csvContent = csvData.map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const fileName = `売上レポート_${dateRange.startDate}_${dateRange.endDate}_${getSelectedStoreName()}.csv`
    saveAs(blob, fileName)
  }

  // Excelエクスポート機能
  const exportToExcel = () => {
    if (!salesData) return

    const workbook = XLSX.utils.book_new()

    // 概要シート
    const summaryData = [
      ['売上管理レポート'],
      [`期間: ${dateRange.startDate} ～ ${dateRange.endDate}`],
      [`店舗: ${getSelectedStoreName()}`],
      [''],
      ['概要'],
      ['総売上', salesData.totalRevenue],
      ['総公演数', salesData.totalEvents],
      ['平均売上/公演', salesData.averageRevenuePerEvent]
    ]
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, '概要')

    // 店舗別ランキングシート
    const storeData = [
      ['順位', '店舗名', '売上', '公演数'],
      ...salesData.storeRanking.map((store, index) => [
        index + 1,
        store.name,
        store.revenue,
        store.events
      ])
    ]
    const storeSheet = XLSX.utils.aoa_to_sheet(storeData)
    XLSX.utils.book_append_sheet(workbook, storeSheet, '店舗別売上')

    // シナリオ別ランキングシート
    const scenarioData = [
      ['順位', 'シナリオ名', '作者', '売上', '公演数'],
      ...salesData.scenarioRanking.map((scenario, index) => [
        index + 1,
        scenario.title,
        scenario.revenue,
        scenario.events
      ])
    ]
    const scenarioSheet = XLSX.utils.aoa_to_sheet(scenarioData)
    XLSX.utils.book_append_sheet(workbook, scenarioSheet, 'シナリオ別売上')

    // 月別推移シート
    const monthlyData = [
      ['月', '売上', '公演数'],
      ...salesData.monthlyRevenue.map(month => [
        month.month,
        month.revenue,
        month.events
      ])
    ]
    const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData)
    XLSX.utils.book_append_sheet(workbook, monthlySheet, '月別推移')

    const fileName = `売上レポート_${dateRange.startDate}_${dateRange.endDate}_${getSelectedStoreName()}.xlsx`
    XLSX.writeFile(workbook, fileName)
  }

  // グラフ画像保存機能
  const exportChartAsImage = () => {
    if (!chartRef) return

    const canvas = chartRef.canvas
    const url = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = `売上グラフ_${dateRange.startDate}_${dateRange.endDate}_${getSelectedStoreName()}.png`
    link.href = url
    link.click()
  }

  const chartOptions = (() => {
    const startDate = new Date(dateRange.startDate + 'T00:00:00+09:00')
    const endDate = new Date(dateRange.endDate + 'T23:59:59+09:00')
    const daysDiff = getDaysDiff(startDate, endDate)
    
    const isDailyChart = daysDiff <= 31
    const chartTitle = isDailyChart 
      ? `日別売上・公演数推移（${getSelectedStoreName()}）`
      : `月別売上・公演数推移（1年分）（${getSelectedStoreName()}）`
    
    // 店舗数に応じてレンジを調整
    const storeCount = selectedStore === 'all' ? stores.length : 1
    
    // データがある場合のみ動的計算、ない場合はデフォルト値
    const hasData = salesData && salesData.monthlyRevenue && salesData.monthlyRevenue.length > 0
    
    // 動的な基準額計算
    const baseRevenuePerDay = 100000 // 1店舗1日10万円
    const baseEventsPerDay = 3 // 1店舗1日3公演
    
    // グラフの表示方式に応じて基準値を調整
    const defaultMaxRevenue = isDailyChart 
      ? baseRevenuePerDay * storeCount // 日別グラフ：1日分の基準
      : baseRevenuePerDay * storeCount * 30 // 月別グラフ：1ヶ月分の基準（30日分）
    
    const defaultMaxEvents = isDailyChart
      ? baseEventsPerDay * storeCount // 日別グラフ：1日分の基準
      : baseEventsPerDay * storeCount * 30 // 月別グラフ：1ヶ月分の基準（30日分）
    
    const maxRevenue = hasData 
      ? Math.max(
          Math.max(...salesData.monthlyRevenue.map(month => month.revenue)) * 1.5,
          defaultMaxRevenue * 0.5 // デフォルトの50%以上は確保
        )
      : defaultMaxRevenue

    const maxEvents = hasData
      ? Math.max(
          Math.max(...salesData.monthlyRevenue.map(month => month.events)) * 1.5,
          defaultMaxEvents * 0.5 // デフォルトの50%以上は確保
        )
      : defaultMaxEvents
    
    // デバッグログ
    console.log('グラフレンジ計算:', { 
      hasData, 
      storeCount, 
      isDailyChart, 
      defaultMaxRevenue, 
      defaultMaxEvents,
      actualMaxRevenue: hasData ? Math.max(...salesData.monthlyRevenue.map(month => month.revenue)) : 0,
      actualMaxEvents: hasData ? Math.max(...salesData.monthlyRevenue.map(month => month.events)) : 0,
      maxRevenue, 
      maxEvents 
    })
    
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        title: {
          display: true,
          text: chartTitle,
          font: {
            size: 16,
            weight: 'bold' as const
          }
        },
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        callbacks: {
          title: function(context: any) {
            return `月: ${context[0].label}`
          },
          label: function(context: any) {
            if (context.datasetIndex === 0) {
              return `売上: ${formatCurrency(context.parsed.y)}`
            } else {
              return `公演数: ${context.parsed.y}回`
            }
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: isDailyChart ? '日' : '月',
          font: {
            size: 12,
            weight: 'bold' as const
          }
        },
        grid: {
          display: false
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        min: 0,
        max: maxRevenue, // 店舗数に応じて調整
        title: {
          display: true,
          text: '売上 (円)',
          font: {
            size: 12,
            weight: 'bold' as const
          }
        },
        ticks: {
          callback: function(value: any) {
            return formatCurrency(value)
          },
          font: {
            size: 10
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        min: 0,
        max: maxEvents, // 店舗数に応じて調整
        title: {
          display: true,
          text: '公演数 (回)',
          font: {
            size: 12,
            weight: 'bold' as const
          }
        },
        ticks: {
          font: {
            size: 10
          }
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  }
  })()

  return (
    <div className="min-h-screen bg-background">
      <Header onPageChange={() => {}} />
      <NavigationBar currentPage="sales" onPageChange={(pageId) => {
        window.location.hash = pageId
      }} />
      <div className="flex">
        {/* デスクトップサイドバー */}
        <div className="hidden lg:block">
          <SalesSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
        
        {/* モバイルタブバー */}
        <div className="lg:hidden w-full">
          <div className="bg-slate-50 border-b border-slate-200 p-4">
            <h2 className="text-lg font-semibold mb-4 text-slate-800">売上管理</h2>
            <div className="flex gap-2 overflow-x-auto">
              {[
                { id: 'overview', label: '概要', icon: BarChart3 },
                { id: 'scenario-performance', label: '分析', icon: BookOpen },
                { id: 'author-report', label: '作者', icon: Users }
              ].map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors",
                      activeTab === item.id
                        ? "bg-blue-100 text-blue-800 border border-blue-200"
                        : "text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="container mx-auto max-w-6xl px-4 lg:px-6 py-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SalesManagement
