import { useState, useMemo, Fragment } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Filter } from 'lucide-react'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { TanStackDataTable } from '@/components/patterns/table'
import { useAuthorReportData } from './hooks/useAuthorReportData'
import { useReportFilters } from './hooks/useReportFilters'
import { generateAuthorReportText, generateEmailUrl, copyToClipboard } from './utils/reportFormatters'
import { createAuthorColumns, renderExpandedRow } from './utils/tableColumns'
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

  // テーブル列定義（メモ化）
  const tableColumns = useMemo(
    () => createAuthorColumns(
      { copiedAuthor, expandedAuthors },
      { onCopy: handleCopy, onEmail: handleSendEmail, onToggleExpand: toggleAuthorExpand }
    ),
    [copiedAuthor, expandedAuthors]
  )

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
                <div className="space-y-0">
                  {/* メインテーブル（TanStack Table） */}
                  <TanStackDataTable
                    data={monthData.authors}
                    columns={tableColumns}
                    getRowKey={(author) => author.author}
                    emptyMessage="データがありません"
                    loading={false}
                  />
                  
                  {/* 展開行（カスタムレンダリング） */}
                  {monthData.authors.map((author) => {
                    const isExpanded = expandedAuthors.has(author.author)
                    if (!isExpanded) return null
                    
                    return (
                      <Card key={`${author.author}-expanded`} className="mt-1">
                        <CardContent className="p-0">
                          {renderExpandedRow(author)}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

