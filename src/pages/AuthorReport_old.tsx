import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Filter, Calendar, User, BarChart3, TrendingUp, ChevronDown, ChevronRight, Copy, Mail, Check } from 'lucide-react'
import { salesApi, scenarioApi, storeApi } from '@/lib/api'
import { Scenario, Store } from '@/types'
import { logger } from '@/utils/logger'

interface AuthorPerformance {
  author: string
  totalEvents: number
  totalRevenue: number
  totalLicenseCost: number
  totalDuration: number
  scenarios: {
    title: string
    events: number
    revenue: number
    licenseCost: number
    licenseAmountPerEvent: number // 1回あたりのライセンス料設定値
    duration: number
    totalDuration: number
    isGMTest?: boolean
  }[]
}

interface MonthlyAuthorData {
  month: string
  authors: AuthorPerformance[]
}

export default function AuthorReport() {
  // sessionStorageから保存された値を復元
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = sessionStorage.getItem('authorReportYear')
    return saved ? parseInt(saved, 10) : new Date().getFullYear()
  })
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = sessionStorage.getItem('authorReportMonth')
    return saved ? parseInt(saved, 10) : new Date().getMonth() + 1
  })
  const [selectedStore, setSelectedStore] = useState(() => {
    const saved = sessionStorage.getItem('authorReportStore')
    return saved || 'all'
  })
  const [searchAuthor, setSearchAuthor] = useState('')
  const [monthlyData, setMonthlyData] = useState<MonthlyAuthorData[]>([])
  const [loading, setLoading] = useState(false)
  const [copiedAuthor, setCopiedAuthor] = useState<string | null>(null)

  // 作者レポートのテキストを生成（簡潔版）
  const generateAuthorReportText = useCallback((author: AuthorPerformance) => {
    // 振込予定日を計算（翌月20日）
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear
    const paymentDate = `${nextYear}年${nextMonth}月20日`
    
    const lines = [
      `${author.author} 様`,
      ``,
      `${selectedYear}年${selectedMonth}月のライセンス料をご報告いたします。`,
      ``,
      `総公演数: ${author.totalEvents}回`,
      `総ライセンス料: ¥${author.totalLicenseCost.toLocaleString()}`,
      ``,
      `詳細は以下の通りです：`,
    ]

    author.scenarios.forEach(scenario => {
      const gmTestLabel = scenario.isGMTest ? '（GMテスト）' : ''
      const licenseInfo = `@¥${scenario.licenseAmountPerEvent.toLocaleString()}/回`
      lines.push(`・${scenario.title}${gmTestLabel}: ${scenario.events}回 × ${licenseInfo} = ¥${scenario.licenseCost.toLocaleString()}`)
    })

    lines.push(``)
    lines.push(`【お支払いについて】`)
    lines.push(`お支払い予定日: ${paymentDate}まで`)
    lines.push(``)
    lines.push(`請求書は queens.waltz@gmail.com 宛にお送りください。`)
    lines.push(``)
    lines.push(`よろしくお願いいたします。`)

    return lines.join('\n')
  }, [selectedYear, selectedMonth])

  // クリップボードにコピー
  const handleCopy = useCallback(async (author: AuthorPerformance) => {
    const text = generateAuthorReportText(author)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAuthor(author.author)
      setTimeout(() => setCopiedAuthor(null), 2000)
    } catch (err) {
      logger.error('コピーに失敗しました:', err)
      alert('コピーに失敗しました')
    }
  }, [generateAuthorReportText])

  // Gmail送信
  const handleSendEmail = useCallback((author: AuthorPerformance) => {
    const subject = `【${selectedYear}年${selectedMonth}月】ライセンス料レポート - ${author.author}`
    
    // 振込予定日を計算（翌月20日）
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear
    const paymentDate = `${nextYear}年${nextMonth}月20日`
    
    // 簡潔な本文を生成（URL長さ制限対策）
    const shortBody = [
      `${author.author} 様`,
      ``,
      `${selectedYear}年${selectedMonth}月のライセンス料をご報告いたします。`,
      ``,
      `総公演数: ${author.totalEvents}回`,
      `総ライセンス料: ¥${author.totalLicenseCost.toLocaleString()}`,
      ``,
      `詳細は以下の通りです：`,
      ...author.scenarios.map(s => {
        const label = s.isGMTest ? '（GMテスト）' : ''
        const licenseInfo = `@¥${s.licenseAmountPerEvent.toLocaleString()}/回`
        return `・${s.title}${label}: ${s.events}回 × ${licenseInfo} = ¥${s.licenseCost.toLocaleString()}`
      }),
      ``,
      `【お支払いについて】`,
      `お支払い予定日: ${paymentDate}まで`,
      ``,
      `請求書は queens.waltz@gmail.com 宛にお送りください。`,
      ``,
      `よろしくお願いいたします。`
    ].join('%0D%0A') // 改行コードをエンコード
    
    // GmailのComposeリンクを生成（本文を短縮版に）
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${shortBody}`
    
    // 新しいタブでGmailを開く
    window.open(gmailUrl, '_blank')
  }, [selectedYear, selectedMonth])

  // 状態が変更されたらsessionStorageに保存
  useEffect(() => {
    sessionStorage.setItem('authorReportYear', selectedYear.toString())
  }, [selectedYear])

  useEffect(() => {
    sessionStorage.setItem('authorReportMonth', selectedMonth.toString())
  }, [selectedMonth])

  useEffect(() => {
    sessionStorage.setItem('authorReportStore', selectedStore)
  }, [selectedStore])

  // 月の範囲を計算する関数（JST固定）
  const getMonthRange = useCallback((year: number, month: number) => {
    // JSのmonthは0始まりなので-1
    const startLocal = new Date(year, month - 1, 1, 0, 0, 0, 0)
    // 次月の0日=当月末日
    const endLocal = new Date(year, month, 0, 23, 59, 59, 999)
    
    const fmt = new Intl.DateTimeFormat('sv-SE', { 
      timeZone: 'Asia/Tokyo', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    })
    
    const startStr = fmt.format(startLocal) // 例: "2025-09-01"
    const endStr = fmt.format(endLocal) // 例: "2025-09-30"
    
    logger.log('計算された日付範囲:', { startStr, endStr })
    
    return { startStr, endStr }
  }, [])

  // データ取得
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      
      const { startStr, endStr } = getMonthRange(selectedYear, selectedMonth)
      
      // データを並行取得
      const [scenariosData, storesData, performanceData] = await Promise.all([
        scenarioApi.getAll(),
        storeApi.getAll(),
        salesApi.getScenarioPerformance(startStr, endStr, selectedStore === 'all' ? undefined : selectedStore)
      ])

      logger.log('取得データ:', { 
        scenariosData: scenariosData.length, 
        storesData: storesData.length, 
        performanceData: performanceData.length,
        performanceDataSample: performanceData.slice(0, 3)
      })

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
        const duration = scenario.duration || 0 // シナリオの所要時間（分）
        const totalDuration = duration * events // 総所要時間（分）
        
        // GMテストの場合は専用のライセンス金額を取得、なければ通常の金額を使用
        const isGMTest = perf.category === 'gmtest'
        let licenseAmountPerEvent = 0 // 1回あたりのライセンス料設定値
        
        if (isGMTest) {
          // GMテスト用のライセンス金額（gm_test_license_amount）
          licenseAmountPerEvent = scenario.gm_test_license_amount || 0
        } else {
          // 通常のライセンス金額（license_amount）
          licenseAmountPerEvent = scenario.license_amount || 0
        }
        
        const totalLicenseCost = licenseAmountPerEvent * events

        // GMテストの場合はタイトルに「（GMテスト）」を追加
        const displayTitle = isGMTest ? `${perf.title}（GMテスト）` : perf.title

        if (authorMap.has(author)) {
          const existing = authorMap.get(author)!
          existing.totalEvents += events
          existing.totalRevenue += revenue
          existing.totalLicenseCost += totalLicenseCost
          existing.totalDuration += totalDuration
          
          const scenarioIndex = existing.scenarios.findIndex(s => s.title === displayTitle)
          if (scenarioIndex >= 0) {
            existing.scenarios[scenarioIndex].events += events
            existing.scenarios[scenarioIndex].revenue += revenue
            existing.scenarios[scenarioIndex].licenseCost += totalLicenseCost
            existing.scenarios[scenarioIndex].totalDuration += totalDuration
          } else {
            existing.scenarios.push({
              title: displayTitle,
              events,
              revenue,
              licenseCost: totalLicenseCost,
              licenseAmountPerEvent, // 1回あたりの設定金額を追加
              duration,
              totalDuration,
              isGMTest
            })
          }
        } else {
          authorMap.set(author, {
            author,
            totalEvents: events,
            totalRevenue: revenue,
            totalLicenseCost,
            totalDuration,
            scenarios: [{
              title: displayTitle,
              events,
              revenue,
              licenseCost: totalLicenseCost,
              licenseAmountPerEvent, // 1回あたりの設定金額を追加
              duration,
              totalDuration,
              isGMTest
            }]
          })
        }
      })

      const authorsArray = Array.from(authorMap.values())
        .sort((a, b) => b.totalEvents - a.totalEvents)

      // 月別データとして設定
      const monthName = `${selectedYear}年${selectedMonth}月`
      logger.log('作者データ集計結果:', authorsArray)
      setMonthlyData([{
        month: monthName,
        authors: authorsArray
      }])
    } catch (error) {
      logger.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedYear, selectedMonth, selectedStore, getMonthRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // フィルタリング
  const filteredMonthlyData = monthlyData.map(monthData => ({
    ...monthData,
    authors: monthData.authors.filter(author => 
      searchAuthor === '' || author.author.toLowerCase().includes(searchAuthor.toLowerCase())
    )
  }))

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1>作者レポート</h1>
          <p className="text-muted-foreground">作者別の公演実績レポート</p>
        </div>
      </div>

      {/* フィルター */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            フィルター
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* 年 */}
            <div className="space-y-2">
              <label className="text-sm">年</label>
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}年</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 月 */}
            <div className="space-y-2">
              <label className="text-sm">月</label>
              <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                    <SelectItem key={month} value={month.toString()}>{month}月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 店舗 */}
            <div className="space-y-2">
              <label className="text-sm">店舗</label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全店舗</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 作者検索 */}
            <div className="space-y-2">
              <label className="text-sm">作者検索</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="作者名で検索..."
                  value={searchAuthor}
                  onChange={(e) => setSearchAuthor(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 月別作者データ */}
      {filteredMonthlyData.map((monthData) => (
        <div key={monthData.month} className="space-y-4">
          <h2 className="text-center">
            {selectedYear}年{selectedMonth}月
          </h2>
          
          <div className="space-y-3">
            {monthData.authors.map((author, index) => (
              <Card key={author.author}>
                <CardContent className="p-4">
                  {/* 作者名とアクションボタン */}
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg">{author.author}</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(author)}
                        className="gap-2"
                      >
                        {copiedAuthor === author.author ? (
                          <>
                            <Check className="h-4 w-4 text-green-600" />
                            <span className="text-green-600">コピー済み</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            <span>コピー</span>
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendEmail(author)}
                        className="gap-2"
                      >
                        <Mail className="h-4 w-4" />
                        <span>メール</span>
                      </Button>
                    </div>
                  </div>
                  
                  {/* シナリオ一覧 */}
                  <div className="space-y-0.5 mb-3">
                    {author.scenarios.map((scenario, scenarioIndex) => {
                      const isGMTest = scenario.isGMTest || false
                      return (
                        <div key={scenarioIndex} className="flex items-center justify-between text-sm py-0.5">
                          <span className="">
                            ├ {scenario.title}
                            {isGMTest && <span className="ml-1 text-xs text-orange-600 font-normal">（GMテスト）</span>}
                          </span>
                          <span className="text-muted-foreground text-xs whitespace-nowrap ml-4">
                            {scenario.events}回 × ¥{scenario.licenseAmountPerEvent.toLocaleString()} = 
                            <span className={`ml-1 ${isGMTest ? "text-orange-600" : "text-gray-900"}`}>
                              ¥{scenario.licenseCost.toLocaleString()}
                            </span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  
                  {/* ライセンス合計 */}
                  <div className="border-t pt-2 text-right">
                    <span className="">└─ ライセンス合計: ¥{author.totalLicenseCost.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* データなし */}
      {!loading && filteredMonthlyData.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg mb-2">データがありません</h3>
            <p className="text-muted-foreground text-center">
              選択した期間に公演データがありません。
            </p>
          </CardContent>
        </Card>
      )}

      {/* ローディング */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-2">データを読み込み中...</span>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
