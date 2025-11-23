import { useState, Fragment, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Filter, ChevronDown, ChevronRight, Copy, Mail, Check, MailCheck, Settings } from 'lucide-react'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { useAuthorReportData } from './hooks/useAuthorReportData'
import { useReportFilters } from './hooks/useReportFilters'
import { generateAuthorReportText, generateEmailUrl, copyToClipboard } from './utils/reportFormatters'
import { supabase } from '@/lib/supabase'
import { renderExpandedRow } from './utils/tableColumns'
import { useScenariosQuery } from '../ScenarioManagement/hooks/useScenarioQuery'
import type { AuthorPerformance } from './types'
import { ScenarioEditDialog } from '@/components/modals/ScenarioEditDialog'
import { AuthorEmailDialog } from './components/AuthorEmailDialog'
import { AuthorLicenseEmailDialog } from './components/AuthorLicenseEmailDialog'
import { authorApi, type Author } from '@/lib/api'

export default function AuthorReport() {
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
  
  // 月選択（MonthSwitcher用）
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const selectedYear = currentDate.getFullYear()
  const selectedMonth = currentDate.getMonth() + 1

  // フィルター
  const {
    selectedStore,
    setSelectedStore,
    searchAuthor,
    setSearchAuthor,
    filteredMonthlyData
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
      // テーブルが存在しない場合、またはレコードが見つからない場合は無視（空のMapのまま）
      if (error?.code === 'PGRST116' || error?.code === 'PGRST205' || error?.status === 404) {
        // テーブルがまだ作成されていない場合は空のMapで続行
        setAuthors(new Map())
      } else {
        console.error('作者データの読み込みに失敗:', error)
      }
    }
  }

  // メールアドレス管理ダイアログを開く
  const handleOpenEmailDialog = (authorName: string) => {
    setSelectedAuthorName(authorName)
    setIsEmailDialogOpen(true)
  }

  // 一括メール送信
  const handleBatchSend = async () => {
    if (finalData.length === 0) {
      alert('送信するデータがありません')
      return
    }

    const authorsWithEmail: Array<{ author: AuthorPerformance; email: string }> = []
    
    finalData.forEach(monthData => {
      monthData.authors.forEach(authorPerf => {
        const authorInfo = authors.get(authorPerf.author)
        if (authorInfo?.email) {
          authorsWithEmail.push({
            author: authorPerf,
            email: authorInfo.email
          })
        }
      })
    })

    if (authorsWithEmail.length === 0) {
      alert('メールアドレスが設定されている作者がいません。先にメールアドレスを設定してください。')
      return
    }

    if (!confirm(`${authorsWithEmail.length}名の作者にメールを送信しますか？\nResendを使用して自動送信します。`)) {
      return
    }

    setIsSendingBatch(true)
    try {
      let successCount = 0
      let failureCount = 0

      // Resendで順番に送信
      for (let i = 0; i < authorsWithEmail.length; i++) {
        const { author, email } = authorsWithEmail[i]
        
        try {
          const { data, error } = await supabase.functions.invoke('send-author-report', {
            body: {
              to: email,
              authorName: author.author,
              year: selectedYear,
              month: selectedMonth,
              totalEvents: author.totalEvents,
              totalLicenseCost: author.totalLicenseCost,
              scenarios: author.scenarios.map(scenario => ({
                title: scenario.title,
                events: scenario.events,
                licenseAmountPerEvent: scenario.licenseAmountPerEvent,
                licenseCost: scenario.licenseCost,
                isGMTest: scenario.isGMTest
              }))
            }
          })

          if (error) {
            throw error
          }

          if (!data?.success) {
            throw new Error(data?.error || 'メール送信に失敗しました')
          }

          successCount++

          // レート制限を避けるため、少し待つ
          if (i < authorsWithEmail.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300))
          }
        } catch (error: any) {
          console.error(`メール送信エラー (${author.author}):`, error)
          failureCount++
        }
      }

      if (failureCount > 0) {
        alert(`${successCount}件のメールを送信しました。${failureCount}件の送信に失敗しました。`)
      } else {
        alert(`${successCount}件のメールを送信しました。`)
      }
    } catch (error) {
      console.error('一括送信に失敗:', error)
      alert('一括送信に失敗しました')
    } finally {
      setIsSendingBatch(false)
    }
  }

  // クリップボードコピー
  const handleCopy = async (author: AuthorPerformance) => {
    const text = generateAuthorReportText(author, selectedYear, selectedMonth)
    const success = await copyToClipboard(text)
    if (success) {
      setCopiedAuthor(author.author)
      setTimeout(() => setCopiedAuthor(null), 2000)
    } else {
      alert('コピーに失敗しました')
    }
  }

  // メール送信（プレビュー表示）
  const handleSendEmail = (author: AuthorPerformance) => {
    const authorInfo = authors.get(author.author)
    const email = authorInfo?.email || ''
    
    if (!email) {
      alert('メールアドレスが設定されていません。先にメールアドレスを設定してください。')
      return
    }
    
    setPreviewAuthor(author)
    setPreviewEmail(email)
    setIsEmailPreviewOpen(true)
  }

  // 作者展開トグル
  const toggleAuthorExpand = (authorName: string) => {
    setExpandedAuthors(prev => {
      const newSet = new Set(prev)
      if (newSet.has(authorName)) {
        newSet.delete(authorName)
      } else {
        newSet.add(authorName)
      }
      return newSet
    })
  }

  // シナリオ編集（タイトルからID解決）
  const handleEditScenarioByTitle = (title: string) => {
    const scenario = allScenarios.find((s) => s.title === title)
    if (!scenario) {
      alert('シナリオが見つかりませんでした（タイトル重複の可能性あり）')
      return
    }
    setEditScenarioId(scenario.id)
    setIsEditOpen(true)
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      <ScenarioEditDialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        scenarioId={editScenarioId}
        onSaved={() => {
          // 保存完了時に作者レポートをリフレッシュ
          refresh()
        }}
      />
      <AuthorEmailDialog
        isOpen={isEmailDialogOpen}
        onClose={() => {
          setIsEmailDialogOpen(false)
          setSelectedAuthorName('')
        }}
        authorName={selectedAuthorName}
        onSave={() => {
          loadAuthors()
        }}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg md:text-lg">作者レポート</h1>
          <p className="text-muted-foreground text-xs sm:text-base">作者別の公演実績レポート</p>
        </div>
        <Button
          onClick={handleBatchSend}
          disabled={isSendingBatch || loading || finalData.length === 0}
          className="flex items-center gap-2"
        >
          <MailCheck className="h-4 w-4" />
          {isSendingBatch ? '送信中...' : '一括メール送信'}
        </Button>
      </div>

      {/* フィルター */}
      <Card>
        <CardHeader className="p-3 sm:p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
            フィルター
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 md:p-6">
          <div className="space-y-3 sm:space-y-4">
            {/* 月選択 */}
            <div className="space-y-1 sm:space-y-2">
              <label className="text-xs sm:text-sm">対象月</label>
              <MonthSwitcher
                value={currentDate}
                onChange={setCurrentDate}
                showToday
                quickJump
              />
            </div>

            {/* その他のフィルター */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {/* 店舗 */}
              <div className="space-y-1 sm:space-y-2">
                <label className="text-xs sm:text-sm">店舗</label>
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger className="text-xs sm:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全店舗</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 作者検索 */}
              <div className="space-y-1 sm:space-y-2">
                <label className="text-xs sm:text-sm">作者検索</label>
                <div className="relative">
                  <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                  <Input
                    placeholder="作者名で検索..."
                    value={searchAuthor}
                    onChange={(e) => setSearchAuthor(e.target.value)}
                    className="pl-7 sm:pl-10 text-xs sm:text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* データ表示 */}
      {loading ? (
        <Card>
          <CardContent className="py-8 sm:py-12 p-3 sm:p-4 md:p-6">
            <p className="text-center text-muted-foreground text-xs sm:text-sm">読み込み中...</p>
          </CardContent>
        </Card>
      ) : (
        finalData.map(monthData => (
          <Card key={monthData.month}>
            <CardHeader className="p-3 sm:p-4 md:p-6">
              <CardTitle className="text-lg">{monthData.month}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 md:p-6">
              {monthData.authors.length === 0 ? (
                <p className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">データがありません</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[30px] sm:w-[50px]"></TableHead>
                        <TableHead className="text-xs sm:text-sm">作者</TableHead>
                        <TableHead className="text-right w-16 sm:w-24 text-xs sm:text-sm">公演数</TableHead>
                        <TableHead className="text-right w-20 sm:w-32 text-xs sm:text-sm hidden sm:table-cell">ライセンス料</TableHead>
                        <TableHead className="text-right w-20 sm:w-28 text-xs sm:text-sm hidden md:table-cell">所要時間</TableHead>
                        <TableHead className="text-right w-[100px] sm:w-[150px] text-xs sm:text-sm">アクション</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthData.authors.map((author) => {
                        const isExpanded = expandedAuthors.has(author.author)
                        return (
                          <Fragment key={author.author}>
                            {/* メイン行 */}
                            <TableRow>
                              <TableCell className="p-2 sm:p-4">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleAuthorExpand(author.author)}
                                  className="h-5 w-5 sm:h-6 sm:w-6 p-0"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                                  )}
                                </Button>
                              </TableCell>
                              <TableCell className="p-2 sm:p-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs sm:text-sm">{author.author}</span>
                                  {authors.get(author.author)?.email && (
                                    <Mail className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" title="メールアドレス設定済み" />
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenEmailDialog(author.author)}
                                    className="h-5 w-5 sm:h-6 sm:w-6 p-0"
                                    title="メールアドレス設定"
                                  >
                                    <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm">{author.totalEvents}回</TableCell>
                              <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm hidden sm:table-cell">
                                <span className="">¥{author.totalLicenseCost.toLocaleString()}</span>
                              </TableCell>
                              <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm hidden md:table-cell">
                                {Math.round(author.totalDuration / 60)}時間
                              </TableCell>
                              <TableCell className="text-right p-2 sm:p-4">
                                <div className="flex gap-1 sm:gap-2 justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCopy(author)}
                                    className="h-6 w-6 sm:h-8 sm:w-8 p-0"
                                    title={copiedAuthor === author.author ? 'コピー済み' : 'コピー'}
                                  >
                                    {copiedAuthor === author.author ? (
                                      <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                                    ) : (
                                      <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSendEmail(author)}
                                    className="h-6 w-6 sm:h-8 sm:w-8 p-0"
                                    title="Gmail"
                                  >
                                    <Mail className="h-3 w-3 sm:h-4 sm:w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            
                            {/* 展開行 */}
                            {isExpanded && (
                              <TableRow>
                                <TableCell colSpan={6} className="p-0">
                                  {renderExpandedRow(author, handleEditScenarioByTitle)}
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

