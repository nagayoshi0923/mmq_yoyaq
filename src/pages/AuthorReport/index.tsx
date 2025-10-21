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
import type { AuthorPerformance } from './types'

export default function AuthorReport() {
  const [copiedAuthor, setCopiedAuthor] = useState<string | null>(null)
  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set())
  
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

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">作者レポート</h1>
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
          <div className="space-y-4">
            {/* 月選択 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">対象月</label>
              <MonthSwitcher
                value={currentDate}
                onChange={setCurrentDate}
                showToday
                quickJump
              />
            </div>

            {/* その他のフィルター */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 店舗 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">店舗</label>
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
                <label className="text-sm font-medium">作者検索</label>
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
          </div>
        </CardContent>
      </Card>

      {/* データ表示 */}
      {loading ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">読み込み中...</p>
          </CardContent>
        </Card>
      ) : (
        finalData.map(monthData => (
          <Card key={monthData.month}>
            <CardHeader>
              <CardTitle>{monthData.month}</CardTitle>
            </CardHeader>
            <CardContent>
              {monthData.authors.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">データがありません</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>作者</TableHead>
                      <TableHead className="text-right w-24">公演数</TableHead>
                      <TableHead className="text-right w-32">ライセンス料</TableHead>
                      <TableHead className="text-right w-28">所要時間</TableHead>
                      <TableHead className="text-right w-[150px]">アクション</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthData.authors.map((author) => {
                      const isExpanded = expandedAuthors.has(author.author)
                      return (
                        <Fragment key={author.author}>
                          {/* メイン行 */}
                          <TableRow>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleAuthorExpand(author.author)}
                                className="h-6 w-6 p-0"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">{author.author}</span>
                            </TableCell>
                            <TableCell className="text-right">{author.totalEvents}回</TableCell>
                            <TableCell className="text-right">
                              <span className="font-medium">¥{author.totalLicenseCost.toLocaleString()}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              {Math.round(author.totalDuration / 60)}時間
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCopy(author)}
                                  className="h-8"
                                >
                                  {copiedAuthor === author.author ? (
                                    <>
                                      <Check className="h-4 w-4 mr-1" />
                                      コピー済み
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-4 w-4 mr-1" />
                                      コピー
                                    </>
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSendEmail(author)}
                                  className="h-8"
                                >
                                  <Mail className="h-4 w-4 mr-1" />
                                  Gmail
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          
                          {/* 展開行 */}
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={6} className="p-0">
                                {renderExpandedRow(author)}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

