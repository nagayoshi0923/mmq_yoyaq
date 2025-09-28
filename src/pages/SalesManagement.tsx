import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { salesApi } from '@/lib/api'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, TrendingUp, Store, BookOpen, DollarSign } from 'lucide-react'
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
  dailyRevenue: Array<{
    date: string
    revenue: number
    eventCount: number
  }>
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
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  })

  // 期間選択の初期化
  useEffect(() => {
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    
    setDateRange({
      startDate: thisMonthStart.toISOString().split('T')[0],
      endDate: thisMonthEnd.toISOString().split('T')[0]
    })
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
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period)
    const now = new Date()
    let startDate: Date
    let endDate: Date

    switch (period) {
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        break
      case 'lastMonth':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        endDate = new Date(now.getFullYear(), now.getMonth(), 0)
        break
      case 'thisYear':
        startDate = new Date(now.getFullYear(), 0, 1)
        endDate = new Date(now.getFullYear(), 11, 31)
        break
      case 'lastYear':
        startDate = new Date(now.getFullYear() - 1, 0, 1)
        endDate = new Date(now.getFullYear() - 1, 11, 31)
        break
      default:
        return // カスタムの場合は何もしない
    }

    setDateRange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    })
  }

  // 売上データを取得
  const fetchSalesData = async () => {
    setLoading(true)
    try {
      let events = await salesApi.getSalesByPeriod(dateRange.startDate, dateRange.endDate)
      
      // 店舗フィルタリング
      if (selectedStore !== 'all') {
        events = events.filter(event => event.store_id === selectedStore)
      }
      
      // 売上データを計算
      const totalRevenue = events.reduce((sum, event) => {
        const participationFee = event.scenarios?.participation_fee || 0
        return sum + participationFee
      }, 0)

      const totalEvents = events.length
      const averageRevenuePerEvent = totalEvents > 0 ? totalRevenue / totalEvents : 0

      // 店舗別集計
      const storeMap = new Map()
      events.forEach(event => {
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

      // シナリオ別集計
      const scenarioMap = new Map()
      events.forEach(event => {
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

      // 日別集計
      const dailyMap = new Map()
      events.forEach(event => {
        const date = event.date
        const participationFee = event.scenarios?.participation_fee || 0
        
        if (dailyMap.has(date)) {
          const existing = dailyMap.get(date)
          existing.revenue += participationFee
          existing.eventCount += 1
        } else {
          dailyMap.set(date, {
            date,
            revenue: participationFee,
            eventCount: 1
          })
        }
      })

      setSalesData({
        totalRevenue,
        totalEvents,
        averageRevenuePerEvent,
        storeBreakdown: Array.from(storeMap.values()).sort((a, b) => b.revenue - a.revenue),
        scenarioBreakdown: Array.from(scenarioMap.values()).sort((a, b) => b.revenue - a.revenue),
        dailyRevenue: Array.from(dailyMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      })
    } catch (error) {
      console.error('売上データの取得に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }

  // 初期データ読み込み
  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      fetchSalesData()
    }
  }, [dateRange, selectedStore])

  // 通貨フォーマット
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    }).format(amount)
  }

  // グラフ用のデータを準備
  const prepareChartData = () => {
    if (!salesData) return null

    const labels = salesData.dailyRevenue.map(day => {
      const date = new Date(day.date)
      return `${date.getMonth() + 1}/${date.getDate()}`
    })

    const revenueData = salesData.dailyRevenue.map(day => day.revenue)
    const eventData = salesData.dailyRevenue.map(day => day.eventCount)

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

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      title: {
        display: true,
        text: `日別売上・公演数推移 (${getSelectedStoreName()})`,
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
            return `日付: ${context[0].label}`
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
          text: '日付',
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
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="thisMonth">今月</SelectItem>
                <SelectItem value="lastMonth">先月</SelectItem>
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
          </div>
        </div>

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
                  <div className="text-2xl font-bold">{formatCurrency(salesData.totalRevenue)}</div>
                  <p className="text-xs text-muted-foreground">
                    期間: {dateRange.startDate} ～ {dateRange.endDate}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">総公演数</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{salesData.totalEvents}回</div>
                  <p className="text-xs text-muted-foreground">
                    平均 {salesData.averageRevenuePerEvent > 0 ? formatCurrency(salesData.averageRevenuePerEvent) : '0円'}/回
                  </p>
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

            {/* 日別売上推移グラフ */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  日別売上・公演数推移 ({getSelectedStoreName()})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  {prepareChartData() ? (
                    <Line data={prepareChartData()!} options={chartOptions} />
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
