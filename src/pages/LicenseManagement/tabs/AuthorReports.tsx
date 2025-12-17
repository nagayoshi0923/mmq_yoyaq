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
  JapaneseYen
} from 'lucide-react'
import { MonthSwitcher } from '@/components/ui/month-switcher'
import { useAuthorReportData } from '@/pages/AuthorReport/hooks/useAuthorReportData'
import { useReportFilters } from '@/pages/AuthorReport/hooks/useReportFilters'
import { useScenariosQuery } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'
import { ScenarioEditDialog } from '@/components/modals/ScenarioEditDialog'
import { AuthorEmailDialog } from '@/pages/AuthorReport/components/AuthorEmailDialog'
import { AuthorLicenseEmailDialog } from '@/pages/AuthorReport/components/AuthorLicenseEmailDialog'
import { authorApi, type Author } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import type { AuthorPerformance } from '@/pages/AuthorReport/types'

export function AuthorReports() {
  const [copiedAuthor, setCopiedAuthor] = useState<string | null>(null)
  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set())
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editScenarioId, setEditScenarioId] = useState<string | null>(null)
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)
  const [selectedAuthorName, setSelectedAuthorName] = useState<string>('')
  const [authors, setAuthors] = useState<Map<string, Author>>(new Map())
  const [isSendingBatch, setIsSendingBatch] = useState(false)
  const [isEmailPreviewOpen, setIsEmailPreviewOpen] = useState(false)
  const [previewAuthor, setPreviewAuthor] = useState<AuthorPerformance | null>(null)
  const [previewEmail, setPreviewEmail] = useState<string>('')
  
  // 月選択
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const selectedYear = currentDate.getFullYear()
  const selectedMonth = currentDate.getMonth() + 1

  // フィルター
  const {
    selectedStore,
    setSelectedStore,
    searchAuthor,
    setSearchAuthor
  } = useReportFilters([])

  // データ取得
  const { monthlyData, loading, refresh } = useAuthorReportData(selectedYear, selectedMonth, selectedStore)
  const { data: allScenarios = [] } = useScenariosQuery()

  // フィルタリング適用
  const { filteredMonthlyData: finalData } = useReportFilters(monthlyData)

  // 作者データを読み込み
  useEffect(() => {
    loadAuthors()
  }, [])

  const loadAuthors = async () => {
    try {
      const authorList = await authorApi.getAll()
      const authorMap = new Map<string, Author>()
      authorList.forEach(author => {
        authorMap.set(author.name, author)
      })
      setAuthors(authorMap)
    } catch (error: any) {
      if (error?.code === 'PGRST116' || error?.code === 'PGRST205' || error?.status === 404) {
        setAuthors(new Map())
      } else {
        logger.error('作者データの読み込みに失敗:', error)
      }
    }
  }

  // 展開/折りたたみ
  const toggleExpand = (author: string) => {
    const newExpanded = new Set(expandedAuthors)
    if (newExpanded.has(author)) {
      newExpanded.delete(author)
    } else {
      newExpanded.add(author)
    }
    setExpandedAuthors(newExpanded)
  }

  // コピー
  const handleCopy = (author: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedAuthor(author)
    setTimeout(() => setCopiedAuthor(null), 2000)
  }

  // メールプレビューを開く
  const handleOpenEmailPreview = (authorData: AuthorPerformance) => {
    const author = authors.get(authorData.author)
    const email = author?.email || ''
    setPreviewAuthor(authorData)
    setPreviewEmail(email)
    setIsEmailPreviewOpen(true)
  }

  // 一括メール送信
  const handleBatchSend = async () => {
    const authorsWithEmail = finalData.flatMap(m => m.authors).filter(a => {
      const author = authors.get(a.author)
      return author?.email
    })

    if (authorsWithEmail.length === 0) {
      showToast.warning('送信可能な作者がいません', 'メールアドレスが登録されている作者がいません')
      return
    }

    if (!confirm(`${authorsWithEmail.length}名の作者にメールを送信しますか？`)) {
      return
    }

    setIsSendingBatch(true)
    let successCount = 0
    let failCount = 0

    for (const authorData of authorsWithEmail) {
      const author = authors.get(authorData.author)
      if (!author?.email) continue

      try {
        const { error } = await supabase.functions.invoke('send-author-report', {
          body: {
            to: author.email,
            authorName: authorData.author,
            year: selectedYear,
            month: selectedMonth,
            totalEvents: authorData.totalEvents,
            totalLicenseCost: authorData.totalLicenseCost,
            scenarios: authorData.scenarios.map(scenario => ({
              title: scenario.title,
              events: scenario.events,
              licenseAmountPerEvent: scenario.licenseAmountPerEvent,
              licenseCost: scenario.licenseCost,
              isGMTest: scenario.isGMTest
            }))
          }
        })

        if (error) throw error
        successCount++
      } catch (error) {
        logger.error(`${authorData.author}へのメール送信失敗:`, error)
        failCount++
      }
    }

    setIsSendingBatch(false)
    if (failCount === 0) {
      showToast.success('一括送信完了', `${successCount}名の作者にメールを送信しました`)
    } else {
      showToast.warning('一部送信失敗', `成功: ${successCount}件, 失敗: ${failCount}件`)
    }
  }

  // シナリオ編集
  const handleEditScenarioByTitle = (title: string) => {
    const cleanTitle = title.replace(/（GMテスト）$/, '').replace(/（.*）$/, '')
    const scenario = allScenarios.find(s => s.title === cleanTitle)
    if (!scenario) {
      showToast.error('シナリオが見つかりません')
      return
    }
    setEditScenarioId(scenario.id)
    setIsEditOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const allAuthors = finalData.flatMap(m => m.authors)

  return (
    <div className="space-y-6">
      {/* ダイアログ類 */}
      <ScenarioEditDialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        scenarioId={editScenarioId}
        onSaved={() => refresh()}
      />
      <AuthorEmailDialog
        isOpen={isEmailDialogOpen}
        onClose={() => {
          setIsEmailDialogOpen(false)
          setSelectedAuthorName('')
        }}
        authorName={selectedAuthorName}
        onSave={() => loadAuthors()}
      />
      {previewAuthor && (
        <AuthorLicenseEmailDialog
          isOpen={isEmailPreviewOpen}
          onClose={() => {
            setIsEmailPreviewOpen(false)
            setPreviewAuthor(null)
            setPreviewEmail('')
          }}
          author={previewAuthor}
          year={selectedYear}
          month={selectedMonth}
          email={previewEmail}
        />
      )}

      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <MonthSwitcher
            currentDate={currentDate}
            onDateChange={setCurrentDate}
          />
        </div>
        <Button
          onClick={handleBatchSend}
          disabled={isSendingBatch || loading || allAuthors.length === 0}
          className="flex items-center gap-2"
        >
          <MailCheck className="h-4 w-4" />
          {isSendingBatch ? '送信中...' : '一括メール送信'}
        </Button>
      </div>

      {/* フィルター */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="作者名で検索..."
            value={searchAuthor}
            onChange={(e) => setSearchAuthor(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{allAuthors.length}</div>
            <div className="text-sm text-muted-foreground">作者数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">
              {allAuthors.reduce((sum, a) => sum + a.totalEvents, 0)}
            </div>
            <div className="text-sm text-muted-foreground">総公演数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">
              ¥{allAuthors.reduce((sum, a) => sum + a.totalLicenseCost, 0).toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">総ライセンス料</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">
              {allAuthors.filter(a => authors.get(a.author)?.email).length}
            </div>
            <div className="text-sm text-muted-foreground">メール登録済み</div>
          </CardContent>
        </Card>
      </div>

      {/* 作者一覧 */}
      <div className="space-y-3">
        {allAuthors.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              該当するデータがありません
            </CardContent>
          </Card>
        ) : (
          allAuthors.map((authorData) => {
            const isExpanded = expandedAuthors.has(authorData.author)
            const author = authors.get(authorData.author)
            const hasEmail = !!author?.email

            return (
              <Card key={authorData.author}>
                <CardContent className="p-4">
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleExpand(authorData.author)}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{authorData.author}</span>
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
                                setSelectedAuthorName(authorData.author)
                                setIsEmailDialogOpen(true)
                              }}
                            >
                              <Mail className="w-3 h-3 mr-1" />
                              メール登録
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span>{authorData.totalEvents}公演</span>
                          <span className="flex items-center gap-1">
                            <JapaneseYen className="w-3 h-3" />
                            {authorData.totalLicenseCost.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenEmailPreview(authorData)
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
                      {authorData.scenarios.map((scenario, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{scenario.title}</span>
                            {scenario.isExternal && (
                              <Badge variant="outline" className="text-xs">外部報告</Badge>
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
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => handleEditScenarioByTitle(scenario.title)}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
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

