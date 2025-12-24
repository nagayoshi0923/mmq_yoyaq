/**
 * 作者レポートタブ - 作者への支払いレポート作成・送信
 */
import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Search,
  Mail,
  MailCheck,
  ChevronDown,
  ChevronUp,
  Pencil,
  Loader2,
  JapaneseYen,
  Users,
  Calendar,
  ExternalLink
} from 'lucide-react'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { ScenarioEditDialog } from '@/components/modals/ScenarioEditDialog'
import { AuthorEmailDialog } from '@/pages/AuthorReport/components/AuthorEmailDialog'
import { AuthorLicenseEmailDialog } from '@/pages/AuthorReport/components/AuthorLicenseEmailDialog'
import { authorApi, scenarioApi, salesApi, storeApi } from '@/lib/api'
import { getAllExternalReports } from '@/lib/api/externalReportsApi'
import type { Author, Scenario } from '@/types'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'

// 作者別パフォーマンスデータ
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
    licenseAmountPerEvent: number
    duration: number
    totalDuration: number
    isGMTest?: boolean
    isExternal?: boolean
    organizationName?: string
  }[]
}

export function AuthorReports() {
  const [loading, setLoading] = useState(true)
  const [authorData, setAuthorData] = useState<AuthorPerformance[]>([])
  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set())
  const [searchAuthor, setSearchAuthor] = useState('')
  const [authors, setAuthors] = useState<Map<string, Author>>(new Map())
  const [allScenarios, setAllScenarios] = useState<Scenario[]>([])
  
  // ダイアログ状態
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editScenarioId, setEditScenarioId] = useState<string | null>(null)
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)
  const [selectedAuthorName, setSelectedAuthorName] = useState('')
  const [isEmailPreviewOpen, setIsEmailPreviewOpen] = useState(false)
  const [previewAuthor, setPreviewAuthor] = useState<AuthorPerformance | null>(null)
  const [previewEmail, setPreviewEmail] = useState('')
  const [isSendingBatch, setIsSendingBatch] = useState(false)
  
  // 月選択
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const selectedYear = currentDate.getFullYear()
  const selectedMonth = currentDate.getMonth() + 1

  // データ取得
  useEffect(() => {
    loadData()
  }, [selectedYear, selectedMonth])

  const loadData = async () => {
    try {
      setLoading(true)

      // 日付範囲計算
      const startDate = new Date(selectedYear, selectedMonth - 1, 1)
      const endDate = new Date(selectedYear, selectedMonth, 0)
      const startStr = startDate.toISOString().split('T')[0]
      const endStr = endDate.toISOString().split('T')[0]

      // データを並行取得
      const [scenarios, stores, performance, externalReports, authorList] = await Promise.all([
        scenarioApi.getAll(),
        storeApi.getAll(),
        salesApi.getScenarioPerformance(startStr, endStr),
        getAllExternalReports({ status: 'approved', startDate: startStr, endDate: endStr }).catch(() => []),
        authorApi.getAll().catch(() => [])
      ])

      setAllScenarios(scenarios)

      // 作者マップ作成
      const authorMap = new Map<string, Author>()
      authorList.forEach(a => authorMap.set(a.name, a))
      setAuthors(authorMap)

      // 作者別集計
      const dataMap = new Map<string, AuthorPerformance>()

      // 自社公演を集計
      performance.forEach((perf: any) => {
        const scenario = scenarios.find(s => s.id === perf.id || s.title === perf.title)
        if (!scenario?.author) return

        const store = stores.find(s => s.id === perf.store_id)
        const isFranchise = store?.ownership_type === 'franchise'
        const isGMTest = perf.category === 'gmtest'
        const events = perf.events || 0

        let licenseAmount = 0
        if (isFranchise) {
          licenseAmount = isGMTest 
            ? (scenario.franchise_gm_test_license_amount || scenario.franchise_license_amount || scenario.gm_test_license_amount || scenario.license_amount || 0)
            : (scenario.franchise_license_amount || scenario.license_amount || 0)
        } else {
          licenseAmount = isGMTest 
            ? (scenario.gm_test_license_amount || 0)
            : (scenario.license_amount || 0)
        }

        const author = scenario.author
        const displayTitle = isGMTest ? `${perf.title}（GMテスト）` : perf.title
        const licenseCost = licenseAmount * events

        if (dataMap.has(author)) {
          const existing = dataMap.get(author)!
          existing.totalEvents += events
          existing.totalLicenseCost += licenseCost
          
          const idx = existing.scenarios.findIndex(s => s.title === displayTitle)
          if (idx >= 0) {
            existing.scenarios[idx].events += events
            existing.scenarios[idx].licenseCost += licenseCost
            existing.scenarios[idx].totalDuration += 0
          } else {
            existing.scenarios.push({
              title: displayTitle,
              events,
              revenue: 0,
              licenseCost,
              licenseAmountPerEvent: licenseAmount,
              duration: 0,
              totalDuration: 0,
              isGMTest
            })
          }
        } else {
          dataMap.set(author, {
            author,
            totalEvents: events,
            totalRevenue: 0,
            totalLicenseCost: licenseCost,
            totalDuration: 0,
            scenarios: [{
              title: displayTitle,
              events,
              revenue: 0,
              licenseCost,
              licenseAmountPerEvent: licenseAmount,
              duration: 0,
              totalDuration: 0,
              isGMTest
            }]
          })
        }
      })

      // 外部報告を集計
      externalReports.forEach((report: any) => {
        const scenarioInfo = report.scenarios
        if (!scenarioInfo?.author) return

        const scenario = scenarios.find(s => s.id === report.scenario_id)
        const author = scenarioInfo.author
        const events = report.performance_count || 1
        const licenseAmount = scenario?.license_amount || 0
        const licenseCost = licenseAmount * events
        const orgName = report.organizations?.name || '外部'
        const displayTitle = `${scenarioInfo.title}（${orgName}）`

        if (dataMap.has(author)) {
          const existing = dataMap.get(author)!
          existing.totalEvents += events
          existing.totalLicenseCost += licenseCost
          existing.scenarios.push({
            title: displayTitle,
            events,
            revenue: 0,
            licenseCost,
            licenseAmountPerEvent: licenseAmount,
            duration: 0,
            totalDuration: 0,
            isExternal: true,
            organizationName: orgName
          })
        } else {
          dataMap.set(author, {
            author,
            totalEvents: events,
            totalRevenue: 0,
            totalLicenseCost: licenseCost,
            totalDuration: 0,
            scenarios: [{
              title: displayTitle,
              events,
              revenue: 0,
              licenseCost,
              licenseAmountPerEvent: licenseAmount,
              duration: 0,
              totalDuration: 0,
              isExternal: true,
              organizationName: orgName
            }]
          })
        }
      })

      // ソートして設定
      const sorted = Array.from(dataMap.values()).sort((a, b) => b.totalEvents - a.totalEvents)
      setAuthorData(sorted)

    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データ取得失敗', 'データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // 展開/折りたたみ
  const toggleExpand = (author: string) => {
    const newSet = new Set(expandedAuthors)
    if (newSet.has(author)) {
      newSet.delete(author)
    } else {
      newSet.add(author)
    }
    setExpandedAuthors(newSet)
  }

  // メールプレビュー
  const handleOpenEmailPreview = (data: AuthorPerformance) => {
    const author = authors.get(data.author)
    setPreviewAuthor(data)
    setPreviewEmail(author?.email || '')
    setIsEmailPreviewOpen(true)
  }

  // シナリオ編集
  const handleEditScenario = (title: string) => {
    const cleanTitle = title.replace(/（.*）$/, '')
    const scenario = allScenarios.find(s => s.title === cleanTitle)
    if (scenario) {
      setEditScenarioId(scenario.id)
      setIsEditOpen(true)
    } else {
      showToast.error('シナリオが見つかりません')
    }
  }

  // 一括送信
  const handleBatchSend = async () => {
    const withEmail = filteredData.filter(a => authors.get(a.author)?.email)
    if (withEmail.length === 0) {
      showToast.warning('送信可能な作者がいません')
      return
    }

    if (!confirm(`${withEmail.length}名の作者にメールを送信しますか？`)) return

    setIsSendingBatch(true)
    let success = 0, fail = 0

    for (const data of withEmail) {
      const author = authors.get(data.author)
      if (!author?.email) continue

      try {
        const { error } = await supabase.functions.invoke('send-author-report', {
          body: {
            to: author.email,
            authorName: data.author,
            year: selectedYear,
            month: selectedMonth,
            totalEvents: data.totalEvents,
            totalLicenseCost: data.totalLicenseCost,
            scenarios: data.scenarios.map(s => ({
              title: s.title,
              events: s.events,
              licenseAmountPerEvent: s.licenseAmountPerEvent,
              licenseCost: s.licenseCost,
              isGMTest: s.isGMTest
            }))
          }
        })
        if (error) throw error
        success++
      } catch {
        fail++
      }
    }

    setIsSendingBatch(false)
    if (fail === 0) {
      showToast.success('一括送信完了', `${success}名に送信しました`)
    } else {
      showToast.warning('一部送信失敗', `成功: ${success}, 失敗: ${fail}`)
    }
  }

  // フィルタリング
  const filteredData = authorData.filter(a => 
    a.author.toLowerCase().includes(searchAuthor.toLowerCase())
  )

  // 統計
  const stats = {
    authorCount: filteredData.length,
    totalEvents: filteredData.reduce((sum, a) => sum + a.totalEvents, 0),
    totalLicense: filteredData.reduce((sum, a) => sum + a.totalLicenseCost, 0),
    withEmail: filteredData.filter(a => authors.get(a.author)?.email).length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ダイアログ */}
      <ScenarioEditDialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        scenarioId={editScenarioId}
        onSaved={loadData}
      />
      <AuthorEmailDialog
        isOpen={isEmailDialogOpen}
        onClose={() => setIsEmailDialogOpen(false)}
        authorName={selectedAuthorName}
        onSave={() => loadData()}
      />
      {previewAuthor && (
        <AuthorLicenseEmailDialog
          isOpen={isEmailPreviewOpen}
          onClose={() => {
            setIsEmailPreviewOpen(false)
            setPreviewAuthor(null)
          }}
          author={previewAuthor}
          year={selectedYear}
          month={selectedMonth}
          email={previewEmail}
        />
      )}

      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <MonthSwitcher value={currentDate} onChange={setCurrentDate} />
        <Button
          onClick={handleBatchSend}
          disabled={isSendingBatch || stats.withEmail === 0}
        >
          <MailCheck className="w-4 h-4 mr-2" />
          {isSendingBatch ? '送信中...' : '一括メール送信'}
        </Button>
      </div>

      {/* 検索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="作者名で検索..."
          value={searchAuthor}
          onChange={(e) => setSearchAuthor(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-2xl font-bold">{stats.authorCount}</div>
            <div className="text-sm text-muted-foreground">作者数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-2xl font-bold">{stats.totalEvents}</div>
            <div className="text-sm text-muted-foreground">総公演数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <JapaneseYen className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-2xl font-bold">¥{stats.totalLicense.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">総ライセンス料</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Mail className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-2xl font-bold">{stats.withEmail}</div>
            <div className="text-sm text-muted-foreground">メール登録済み</div>
          </CardContent>
        </Card>
      </div>

      {/* 作者一覧 */}
      <div className="space-y-3">
        {filteredData.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              該当するデータがありません
            </CardContent>
          </Card>
        ) : (
          filteredData.map((data) => {
            const isExpanded = expandedAuthors.has(data.author)
            const author = authors.get(data.author)
            const hasEmail = !!author?.email

            return (
              <Card key={data.author}>
                <CardContent className="p-4">
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleExpand(data.author)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{data.author}</span>
                        {hasEmail ? (
                          <Badge variant="outline" className="text-xs">
                            <Mail className="w-3 h-3 mr-1" />
                            登録済み
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-6"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedAuthorName(data.author)
                              setIsEmailDialogOpen(true)
                            }}
                          >
                            <Mail className="w-3 h-3 mr-1" />
                            メール登録
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span>{data.totalEvents}公演</span>
                        <span className="flex items-center gap-1">
                          <JapaneseYen className="w-3 h-3" />
                          {data.totalLicenseCost.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenEmailPreview(data)
                        }}
                      >
                        <Mail className="w-4 h-4 mr-1" />
                        送信
                      </Button>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      {data.scenarios.map((scenario, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{scenario.title}</span>
                            {scenario.isExternal && (
                              <Badge variant="secondary" className="text-xs">
                                <ExternalLink className="w-3 h-3 mr-1" />
                                外部
                              </Badge>
                            )}
                            {scenario.isGMTest && (
                              <Badge variant="outline" className="text-xs">GMテスト</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span>{scenario.events}回</span>
                            <span className="text-muted-foreground">
                              @¥{scenario.licenseAmountPerEvent.toLocaleString()}
                            </span>
                            <span className="font-medium">
                              ¥{scenario.licenseCost.toLocaleString()}
                            </span>
                            {!scenario.isExternal && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleEditScenario(scenario.title)
                                }}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
