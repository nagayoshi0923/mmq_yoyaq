import { useState, Fragment } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Filter, ChevronDown, ChevronRight, Copy, Mail, Check } from 'lucide-react'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { useAuthorReportData } from './hooks/useAuthorReportData'
import { useReportFilters } from './hooks/useReportFilters'
import { generateAuthorReportText, generateEmailUrl, copyToClipboard } from './utils/reportFormatters'
import { renderExpandedRow } from './utils/tableColumns'
import { useScenariosQuery } from '../ScenarioManagement/hooks/useScenarioQuery'
import type { AuthorPerformance } from './types'
import { ScenarioEditDialog } from '@/components/modals/ScenarioEditDialog'

export default function AuthorReport() {
  const [copiedAuthor, setCopiedAuthor] = useState<string | null>(null)
  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set())
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editScenarioId, setEditScenarioId] = useState<string | null>(null)
  
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
  const { monthlyData, loading } = useAuthorReportData(selectedYear, selectedMonth, selectedStore)
  const { data: allScenarios = [] } = useScenariosQuery()

  // フィルタリング適用
  const { filteredMonthlyData: finalData } = useReportFilters(monthlyData)

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

  // メール送信
  const handleSendEmail = (author: AuthorPerformance) => {
    const url = generateEmailUrl(author, selectedYear, selectedMonth)
    window.open(url, '_blank')
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
      />
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">作者レポート</h1>
          <p className="text-muted-foreground text-xs sm:text-sm md:text-base">作者別の公演実績レポート</p>
        </div>
      </div>

      {/* フィルター */}
      <Card>
        <CardHeader className="p-3 sm:p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
            フィルター
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 md:p-6">
          <div className="space-y-3 sm:space-y-4">
            {/* 月選択 */}
            <div className="space-y-1 sm:space-y-2">
              <label className="text-xs sm:text-sm font-medium">対象月</label>
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
                <label className="text-xs sm:text-sm font-medium">店舗</label>
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
                <label className="text-xs sm:text-sm font-medium">作者検索</label>
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
              <CardTitle className="text-base sm:text-lg md:text-xl">{monthData.month}</CardTitle>
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
                                <span className="font-medium text-xs sm:text-sm">{author.author}</span>
                              </TableCell>
                              <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm">{author.totalEvents}回</TableCell>
                              <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm hidden sm:table-cell">
                                <span className="font-medium">¥{author.totalLicenseCost.toLocaleString()}</span>
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

