import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { salesApi } from '@/lib/api'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, TrendingUp, Store, BookOpen, DollarSign, Download } from 'lucide-react'
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

interface SalesData {
  totalRevenue: number
  totalEvents: number
  averageRevenuePerEvent: number
  storeBreakdown: Array<{
    storeName: string
    revenue: number
    eventCount: number
  }>
  scenarioBreakdown: Array<{
    scenarioTitle: string
    author: string
    revenue: number
    eventCount: number
  }>
  monthlyRevenue: Array<{
    month: string
    revenue: number
    eventCount: number
  }>
  previousYearData?: {
    totalRevenue: number
    totalEvents: number
    averageRevenuePerEvent: number
  }
  previousMonthData?: {
    totalRevenue: number
    totalEvents: number
    averageRevenuePerEvent: number
  }
}

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
  const [salesTarget, setSalesTarget] = useState<number>(0)
  const [showTargetInput, setShowTargetInput] = useState(false)
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  })

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

  // 売上目標をlocalStorageから読み込み
  useEffect(() => {
    const savedTarget = localStorage.getItem('salesTarget')
    if (savedTarget) {
      setSalesTarget(parseInt(savedTarget, 10))
    } else {
      // デフォルトの売上目標を設定（1店舗1日10万円基準）
      const startDate = new Date(dateRange.startDate + 'T00:00:00+09:00')
      const endDate = new Date(dateRange.endDate + 'T23:59:59+09:00')
      const daysDiff = getDaysDiff(startDate, endDate)
      const defaultTarget = selectedStore === 'all' 
        ? 100000 * stores.length * Math.max(1, daysDiff) // 全店舗：10万円 × 店舗数 × 日数
        : 100000 * Math.max(1, daysDiff) // 単店舗：10万円 × 日数
      setSalesTarget(defaultTarget)
    }
  }, [selectedStore, dateRange, stores.length])

  // 売上目標を保存
  const saveSalesTarget = () => {
    localStorage.setItem('salesTarget', salesTarget.toString())
    setShowTargetInput(false)
  }

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
        const storeName = event.stores?.name || '不明な店舗'
        const participationFee = event.scenarios?.participation_fee || 0
        
        if (storeMap.has(storeName)) {
          const existing = storeMap.get(storeName)
          existing.revenue += participationFee
          existing.eventCount += 1
        } else {
          storeMap.set(storeName, {
            storeName,
            revenue: participationFee,
            eventCount: 1
          })
        }
      })

      // シナリオ別集計（選択期間内のデータのみ）
      const scenarioMap = new Map()
      selectedPeriodEvents.forEach(event => {
        const scenarioTitle = event.scenarios?.title || '不明なシナリオ'
        const author = event.scenarios?.author || '不明な作者'
        const participationFee = event.scenarios?.participation_fee || 0
        const key = `${scenarioTitle}-${author}`
        
        if (scenarioMap.has(key)) {
          const existing = scenarioMap.get(key)
          existing.revenue += participationFee
          existing.eventCount += 1
        } else {
          scenarioMap.set(key, {
            scenarioTitle,
            author,
            revenue: participationFee,
            eventCount: 1
          })
        }
      })

      // 期間に応じて日別または月別集計
      let chartData: Array<{ month: string; revenue: number; eventCount: number }> = []
      
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
            eventCount: 0
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
            existing.eventCount += 1
          }
        })
        
        chartData = Array.from(monthlyMap.values())
      } else {
        // 日別集計
        const dailyMap = new Map()
        
        // 期間内の日を生成
        const currentDate = new Date(chartStartDate)
        while (currentDate <= chartEndDate) {
          const dayKey = currentDate.toISOString().split('T')[0]
          dailyMap.set(dayKey, {
            month: dayKey,
            revenue: 0,
            eventCount: 0
          })
          currentDate.setDate(currentDate.getDate() + 1)
        }
        
        // 実際のイベントデータを集計
        events.forEach(event => {
          const dayKey = event.date
          const participationFee = event.scenarios?.participation_fee || 0
          
          if (dailyMap.has(dayKey)) {
            const existing = dailyMap.get(dayKey)
            existing.revenue += participationFee
            existing.eventCount += 1
          }
        })
        
        chartData = Array.from(dailyMap.values())
      }

      setSalesData({
        totalRevenue,
        totalEvents,
        averageRevenuePerEvent,
        storeBreakdown: Array.from(storeMap.values()).sort((a, b) => b.revenue - a.revenue),
        scenarioBreakdown: Array.from(scenarioMap.values()).sort((a, b) => b.revenue - a.revenue),
        monthlyRevenue: chartData.sort((a, b) => a.month.localeCompare(b.month)),
        previousYearData: {
          totalRevenue: previousYearRevenue,
          totalEvents: previousYearEventsCount,
          averageRevenuePerEvent: previousYearAverageRevenuePerEvent
        },
        previousMonthData: {
          totalRevenue: previousMonthRevenue,
          totalEvents: previousMonthEventsCount,
          averageRevenuePerEvent: previousMonthAverageRevenuePerEvent
        }
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

  // 売上目標比較表示コンポーネント
  const TargetComparisonDisplay: React.FC<{ 
    current: number; 
    target: number; 
    label: string 
  }> = ({ current, target, label }) => {
    const achievementRate = target > 0 ? (current / target) * 100 : 0
    const isAchieved = achievementRate >= 100
    const isNearTarget = achievementRate >= 80 && achievementRate < 100
    
    return (
      <div className="text-right space-y-1">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`text-sm font-medium ${isAchieved ? 'text-green-600' : isNearTarget ? 'text-yellow-600' : 'text-red-600'}`}>
          {achievementRate.toFixed(1)}%
        </div>
        <div className="text-xs text-muted-foreground">
          目標: {formatCurrency(target)}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full ${isAchieved ? 'bg-green-500' : isNearTarget ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${Math.min(achievementRate, 100)}%` }}
          ></div>
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
    const eventData = salesData.monthlyRevenue.map(month => month.eventCount)

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
      ...salesData.storeBreakdown.map((store, index) => [
        index + 1,
        store.storeName,
        formatCurrency(store.revenue),
        `${store.eventCount}回`
      ]),
      [''],
      ['シナリオ別売上ランキング'],
      ['順位', 'シナリオ名', '作者', '売上', '公演数'],
      ...salesData.scenarioBreakdown.map((scenario, index) => [
        index + 1,
        scenario.scenarioTitle,
        scenario.author,
        formatCurrency(scenario.revenue),
        `${scenario.eventCount}回`
      ]),
      [''],
      ['月別売上推移'],
      ['月', '売上', '公演数'],
      ...salesData.monthlyRevenue.map(month => [
        month.month,
        formatCurrency(month.revenue),
        `${month.eventCount}回`
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
      ...salesData.storeBreakdown.map((store, index) => [
        index + 1,
        store.storeName,
        store.revenue,
        store.eventCount
      ])
    ]
    const storeSheet = XLSX.utils.aoa_to_sheet(storeData)
    XLSX.utils.book_append_sheet(workbook, storeSheet, '店舗別売上')

    // シナリオ別ランキングシート
    const scenarioData = [
      ['順位', 'シナリオ名', '作者', '売上', '公演数'],
      ...salesData.scenarioBreakdown.map((scenario, index) => [
        index + 1,
        scenario.scenarioTitle,
        scenario.author,
        scenario.revenue,
        scenario.eventCount
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
        month.eventCount
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
    
    // 動的な基準額計算（1店舗1日10万円、3公演基準）
    const chartDaysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const baseRevenuePerDay = 100000 // 1店舗1日10万円
    const baseEventsPerDay = 3 // 1店舗1日3公演
    
    // グラフの表示方式に応じて基準値を調整
    const defaultMaxRevenue = isDailyChart 
      ? baseRevenuePerDay * storeCount // 日別グラフ：1日分の基準（全店舗で60万円）
      : baseRevenuePerDay * storeCount * Math.max(1, chartDaysDiff) // 月別グラフ：期間全体の基準
    
    const defaultMaxEvents = isDailyChart
      ? baseEventsPerDay * storeCount // 日別グラフ：1日分の基準（全店舗で18公演）
      : baseEventsPerDay * storeCount * Math.max(1, chartDaysDiff) // 月別グラフ：期間全体の基準
    
    const maxRevenue = hasData 
      ? Math.max(
          Math.max(...salesData.monthlyRevenue.map(month => month.revenue)) * 2,
          defaultMaxRevenue * 0.5 // デフォルトの50%以上は確保
        )
      : defaultMaxRevenue

    const maxEvents = hasData
      ? Math.max(
          Math.max(...salesData.monthlyRevenue.map(month => month.eventCount)) * 2,
          defaultMaxEvents * 0.5 // デフォルトの50%以上は確保
        )
      : defaultMaxEvents
    
    // デバッグログ（本番では削除）
    // console.log('グラフレンジ計算:', { hasData, storeCount, chartDaysDiff, isDailyChart, maxRevenue, maxEvents })
    
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
      <div className="container mx-auto p-6 space-y-6">
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
            <div className="flex items-center gap-2">
              <Label htmlFor="store">店舗</Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全店舗</SelectItem>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={fetchSalesData} disabled={loading}>
              {loading ? '読み込み中...' : '更新'}
            </Button>
            <Button 
              onClick={() => setShowTargetInput(!showTargetInput)} 
              variant="outline" 
              size="sm"
            >
              目標設定
            </Button>
            {salesData && (
              <div className="flex gap-2">
                <Button onClick={exportToCSV} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
                <Button onClick={exportToExcel} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Excel
                </Button>
                <Button onClick={exportChartAsImage} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  グラフ画像
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 売上目標設定 */}
        {showTargetInput && (
          <Card>
            <CardHeader>
              <CardTitle>売上目標設定</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="salesTarget">目標売上</Label>
                  <Input
                    id="salesTarget"
                    type="number"
                    value={salesTarget}
                    onChange={(e) => setSalesTarget(parseInt(e.target.value, 10) || 0)}
                    className="w-40"
                    placeholder="目標金額を入力"
                  />
                  <span className="text-sm text-muted-foreground">円</span>
                </div>
                <Button onClick={saveSalesTarget} size="sm">
                  保存
                </Button>
                <Button 
                  onClick={() => setShowTargetInput(false)} 
                  variant="outline" 
                  size="sm"
                >
                  キャンセル
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-lg">データを読み込み中...</div>
          </div>
        ) : salesData ? (
          <>
            {/* 売上概要カード */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">総売上</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{formatCurrency(salesData.totalRevenue)}</div>
                      <p className="text-xs text-muted-foreground">
                        期間: {dateRange.startDate} ～ {dateRange.endDate}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {salesData.previousYearData && salesData.previousMonthData && (
                        <MultiComparisonDisplay
                          current={salesData.totalRevenue}
                          previousYear={salesData.previousYearData.totalRevenue}
                          previousMonth={salesData.previousMonthData.totalRevenue}
                          label="比較"
                        />
                      )}
                      {salesTarget > 0 && (
                        <TargetComparisonDisplay
                          current={salesData.totalRevenue}
                          target={salesTarget}
                          label="目標達成率"
                        />
                      )}
                      {/* 売上目標表示チェック: {salesTarget}, showTarget: {salesTarget > 0} */}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">総公演数</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{salesData.totalEvents}回</div>
                      <p className="text-xs text-muted-foreground">
                        平均 {salesData.averageRevenuePerEvent > 0 ? formatCurrency(salesData.averageRevenuePerEvent) : '0円'}/回
                      </p>
                    </div>
                    {salesData.previousYearData && salesData.previousMonthData && (
                      <MultiComparisonDisplay
                        current={salesData.totalEvents}
                        previousYear={salesData.previousYearData.totalEvents}
                        previousMonth={salesData.previousMonthData.totalEvents}
                        label="比較"
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">店舗数</CardTitle>
                  <Store className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{salesData.storeBreakdown.length}店舗</div>
                  <p className="text-xs text-muted-foreground">
                    稼働店舗数
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">シナリオ数</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{salesData.scenarioBreakdown.length}作品</div>
                  <p className="text-xs text-muted-foreground">
                    実行されたシナリオ数
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 店舗別売上ランキング */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  店舗別売上ランキング
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {salesData.storeBreakdown.slice(0, 10).map((store, index) => (
                    <div key={store.storeName} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant={index < 3 ? "default" : "secondary"}>
                          {index + 1}位
                        </Badge>
                        <span className="font-medium">{store.storeName}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatCurrency(store.revenue)}</div>
                        <div className="text-sm text-muted-foreground">{store.eventCount}回</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* シナリオ別売上ランキング */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  シナリオ別売上ランキング
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {salesData.scenarioBreakdown.slice(0, 10).map((scenario, index) => (
                    <div key={`${scenario.scenarioTitle}-${scenario.author}`} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant={index < 3 ? "default" : "secondary"}>
                          {index + 1}位
                        </Badge>
                        <div>
                          <div className="font-medium">{scenario.scenarioTitle}</div>
                          <div className="text-sm text-muted-foreground">作者: {scenario.author}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatCurrency(scenario.revenue)}</div>
                        <div className="text-sm text-muted-foreground">{scenario.eventCount}回</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 月別売上推移グラフ */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    {(() => {
                      const startDate = new Date(dateRange.startDate)
                      const endDate = new Date(dateRange.endDate)
                      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
                      return daysDiff <= 31 
                        ? `日別売上・公演数推移（${getSelectedStoreName()}）`
                        : `月別売上・公演数推移（1年分）（${getSelectedStoreName()}）`
                    })()}
                  </CardTitle>
                  <TrendDisplay data={salesData.monthlyRevenue} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  {prepareChartData() ? (
                    <Line 
                      ref={setChartRef}
                      data={prepareChartData()!} 
                      options={chartOptions} 
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      データがありません
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="text-lg text-muted-foreground">データがありません</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SalesManagement
