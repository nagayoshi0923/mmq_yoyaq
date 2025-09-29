import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search, Filter, Calendar, User, BarChart3, TrendingUp } from 'lucide-react'
import { salesApi, scenarioApi, storeApi } from '@/lib/api'
import { Scenario, Store } from '@/types'

interface AuthorPerformance {
  author: string
  totalEvents: number
  totalRevenue: number
  totalLicenseCost: number
  scenarios: {
    title: string
    events: number
    revenue: number
    licenseCost: number
  }[]
}

interface MonthlyAuthorData {
  month: string
  authors: AuthorPerformance[]
}

const AuthorReport: React.FC = () => {
  const [monthlyData, setMonthlyData] = useState<MonthlyAuthorData[]>([])
  const [allScenarios, setAllScenarios] = useState<Scenario[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStore, setSelectedStore] = useState('all')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)

  // 月別期間計算
  const getMonthRange = useCallback((year: number, month: number) => {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const end = new Date(year, month, 0, 23, 59, 59, 999)
    
    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date)
    }

    return {
      start,
      end,
      startDate: formatDate(start),
      endDate: formatDate(end)
    }
  }, [])

  // 全期間のデータを取得してテスト
  const fetchAllData = useCallback(async () => {
    try {
      // デバッグ用の全期間データ取得（必要に応じてコメントアウト）
      // const allPerformanceData = await salesApi.getScenarioPerformance(
      //   '2020-01-01T00:00:00.000Z',
      //   '2030-12-31T23:59:59.999Z',
      //   null
      // )
      // console.log('全期間のパフォーマンスデータ:', allPerformanceData)
    } catch (error) {
      console.error('❌ 全期間データ取得エラー:', error)
    }
  }, [])

  // データ取得
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const monthRange = getMonthRange(selectedYear, selectedMonth)
      console.log('計算された日付範囲:', {
        start: monthRange.start,
        end: monthRange.end,
        startISO: monthRange.start.toISOString(),
        endISO: monthRange.end.toISOString()
      })

      // シナリオデータと店舗データを並行取得
      const [scenariosData, storesData, performanceData] = await Promise.all([
        scenarioApi.getAll(),
        storeApi.getAll(),
        salesApi.getScenarioPerformance(
          monthRange.start.toISOString(),
          monthRange.end.toISOString(),
          selectedStore === 'all' ? null : parseInt(selectedStore)
        )
      ])

      setAllScenarios(scenariosData)
      setStores(storesData)
      // デバッグログ（必要に応じてコメントアウト）
      // console.log('取得データ:', { 
      //   scenariosData: scenariosData.length, 
      //   storesData: storesData.length, 
      //   performanceData: performanceData.length
      // })

      // 作者別データを集計
      const authorMap = new Map<string, AuthorPerformance>()

      performanceData.forEach((perf, index) => {
        // perf.id（scenario_id）またはperf.titleでシナリオを検索
        let scenario = scenariosData.find(s => s.id === perf.id)
        if (!scenario) {
          scenario = scenariosData.find(s => s.title === perf.title)
        }
        
        if (!scenario || !scenario.author) {
          return
        }

        const author = scenario.author
        const events = perf.events as number
        const avgParticipants = 6
        const revenue = scenario.participation_fee * avgParticipants * events
        // license_costsは配列形式なので、最初の要素のamountを取得
        const licenseCost = scenario.license_costs?.[0]?.amount || 0
        const totalLicenseCost = licenseCost * events

        if (authorMap.has(author)) {
          const existing = authorMap.get(author)!
          existing.totalEvents += events
          existing.totalRevenue += revenue
          existing.totalLicenseCost += totalLicenseCost
          
          const scenarioIndex = existing.scenarios.findIndex(s => s.title === perf.title)
          if (scenarioIndex >= 0) {
            existing.scenarios[scenarioIndex].events += events
            existing.scenarios[scenarioIndex].revenue += revenue
            existing.scenarios[scenarioIndex].licenseCost += totalLicenseCost
          } else {
            existing.scenarios.push({
              title: perf.title,
              events,
              revenue,
              licenseCost: totalLicenseCost
            })
          }
        } else {
          authorMap.set(author, {
            author,
            totalEvents: events,
            totalRevenue: revenue,
            totalLicenseCost,
            scenarios: [{
              title: perf.title,
              events,
              revenue,
              licenseCost: totalLicenseCost
            }]
          })
        }
      })

      const authorsArray = Array.from(authorMap.values())
        .sort((a, b) => b.totalEvents - a.totalEvents)

      // 月別データとして設定
      const monthName = `${selectedYear}年${selectedMonth}月`
      // console.log('作者データ集計結果:', authorsArray)
      setMonthlyData([{
        month: monthName,
        authors: authorsArray
      }])
    } catch (error) {
      console.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedYear, selectedMonth, selectedStore, getMonthRange])

  useEffect(() => {
    fetchAllData() // まず全期間のデータを確認
    fetchData()
  }, [fetchAllData, fetchData])

  // フィルタリング
  const filteredMonthlyData = monthlyData.map(monthData => ({
    ...monthData,
    authors: monthData.authors.filter(author => 
      author.author.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(monthData => monthData.authors.length > 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">作者レポート</h1>
      </div>

      {/* フィルター */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="作者名で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}年</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                    <SelectItem key={month} value={month.toString()}>{month}月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="店舗を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全店舗</SelectItem>
                  {stores.map(store => (
                    <SelectItem key={store.id} value={store.id.toString()}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総作者数</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredMonthlyData.reduce((sum, monthData) => sum + monthData.authors.length, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              期間: {getMonthRange(selectedYear, selectedMonth).startDate} ～ {getMonthRange(selectedYear, selectedMonth).endDate}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総公演数</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredMonthlyData.reduce((sum, monthData) => 
                sum + monthData.authors.reduce((authorSum, author) => authorSum + author.totalEvents, 0), 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              期間: {getMonthRange(selectedYear, selectedMonth).startDate} ～ {getMonthRange(selectedYear, selectedMonth).endDate}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ライセンス総額</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ¥{filteredMonthlyData.reduce((sum, monthData) => 
                sum + monthData.authors.reduce((authorSum, author) => authorSum + author.totalLicenseCost, 0), 0
              ).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              期間: {getMonthRange(selectedYear, selectedMonth).startDate} ～ {getMonthRange(selectedYear, selectedMonth).endDate}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 月別作者データ */}
      {filteredMonthlyData.map((monthData) => (
        <div key={monthData.month} className="space-y-4">
          <h2 className="text-2xl font-bold text-center">
            期間: {getMonthRange(selectedYear, selectedMonth).startDate} ～ {getMonthRange(selectedYear, selectedMonth).endDate}
          </h2>
          
          <div className="space-y-3">
            {monthData.authors.map((author, index) => (
              <Card key={author.author}>
                <CardContent className="p-4">
                  {/* 作者名 */}
                  <div className="mb-4">
                    <h3 className="font-semibold text-lg">{author.author}</h3>
                  </div>
                  
                  {/* シナリオ一覧 */}
                  <div className="space-y-1 mb-4">
                    {author.scenarios.map((scenario, scenarioIndex) => (
                      <div key={scenarioIndex} className="flex items-center justify-between py-1">
                        <span className="font-medium">├─ {scenario.title}</span>
                        <div className="flex items-center gap-4 text-sm">
                          <span>{scenario.events}回</span>
                          <span>¥{scenario.licenseCost.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* ライセンス合計 */}
                  <div className="border-t pt-2 text-right">
                    <span className="font-semibold">└─ ライセンス合計: ¥{author.totalLicenseCost.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {filteredMonthlyData.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-muted-foreground">
              {searchTerm ? '検索条件に一致する作者が見つかりませんでした' : '選択した月に公演データがありません'}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default AuthorReport
