import { useState, Fragment } from 'react'
import { showToast } from '@/utils/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/layout/PageHeader'
import { Search, Filter, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { useSalaryData } from './hooks/useSalaryData'

export default function SalaryCalculation() {
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set())
  const [searchStaff, setSearchStaff] = useState('')
  const [selectedStore, setSelectedStore] = useState('all')
  
  // 月選択（MonthSwitcher用）
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const selectedYear = currentDate.getFullYear()
  const selectedMonth = currentDate.getMonth() + 1

  // データ取得
  const { salaryData, loading } = useSalaryData(selectedYear, selectedMonth, selectedStore)

  // スタッフ展開トグル
  const toggleStaffExpand = (staffId: string) => {
    setExpandedStaff(prev => {
      const newSet = new Set(prev)
      if (newSet.has(staffId)) {
        newSet.delete(staffId)
      } else {
        newSet.add(staffId)
      }
      return newSet
    })
  }

  // フィルタリング
  const filteredStaffList = salaryData?.staffList.filter(staff => {
    if (searchStaff && !staff.staffName.toLowerCase().includes(searchStaff.toLowerCase())) {
      return false
    }
    return true
  }) || []

  // CSV エクスポート
  const handleExportCSV = () => {
    if (!salaryData || filteredStaffList.length === 0) {
      showToast.warning('エクスポートするデータがありません')
      return
    }

    const csvRows: string[] = []
    
    // ヘッダー
    csvRows.push('スタッフ名,役割,GM回数,GM報酬,合計給与')
    
    // データ行
    filteredStaffList.forEach(staff => {
      csvRows.push([
        staff.staffName,
        staff.role,
        staff.totalGMCount,
        staff.totalGMPay.toLocaleString(),
        staff.totalSalary.toLocaleString()
      ].join(','))
    })
    
    // BOM付きUTF-8でダウンロード
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF])
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `給与計算_${salaryData.month}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* ヘッダー */}
      <PageHeader
        title="給与計算"
        description="スタッフ別のGM報酬計算（シフト給与は今後実装予定）"
      >
        <Button
          onClick={handleExportCSV}
          disabled={loading || filteredStaffList.length === 0}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          CSVエクスポート
        </Button>
      </PageHeader>

      {/* フィルター */}
      <Card className="shadow-none border">
        <CardHeader className="p-3 sm:p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base">
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

              {/* スタッフ検索 */}
              <div className="space-y-1 sm:space-y-2">
                <label className="text-xs sm:text-sm">スタッフ検索</label>
                <div className="relative">
                  <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                  <Input
                    placeholder="スタッフ名で検索..."
                    value={searchStaff}
                    onChange={(e) => setSearchStaff(e.target.value)}
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
        <Card className="shadow-none border">
          <CardContent className="py-8 sm:py-12 p-3 sm:p-4 md:p-6">
            <p className="text-center text-muted-foreground text-xs sm:text-sm">読み込み中...</p>
          </CardContent>
        </Card>
      ) : salaryData ? (
        <Card className="shadow-none border">
          <CardHeader className="p-3 sm:p-4 md:p-6">
            <div className="flex justify-between items-start">
              <CardTitle className="text-lg">{salaryData.month}</CardTitle>
              <div className="flex gap-6 sm:gap-8">
                <div className="text-right">
                  <div className="text-xs sm:text-sm text-muted-foreground">合計支給額</div>
                  <div className="text-lg sm:text-xl font-bold">
                    ¥{salaryData.totalAmount.toLocaleString()}
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground space-y-0.5 mt-1">
                    <div>通常: ¥{salaryData.totalNormalPay.toLocaleString()}</div>
                    <div>GMテスト: ¥{salaryData.totalGMTestPay.toLocaleString()}</div>
                  </div>
                </div>
                <div className="text-right border-l pl-6 sm:pl-8">
                  <div className="text-xs sm:text-sm text-muted-foreground">合計公演回数</div>
                  <div className="text-lg sm:text-xl font-bold">
                    {salaryData.totalEventCount}回
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground space-y-0.5 mt-1">
                    <div>通常: {salaryData.totalNormalCount}回</div>
                    <div>GMテスト: {salaryData.totalGMTestCount}回</div>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-6">
            {filteredStaffList.length === 0 ? (
              <p className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">データがありません</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30px] sm:w-[50px]"></TableHead>
                      <TableHead className="text-xs sm:text-sm">スタッフ</TableHead>
                      <TableHead className="text-xs sm:text-sm">役割</TableHead>
                      <TableHead className="text-right w-16 sm:w-20 text-xs sm:text-sm">GM回数</TableHead>
                      <TableHead className="text-right w-24 sm:w-32 text-xs sm:text-sm">GM報酬</TableHead>
                      <TableHead className="text-right w-24 sm:w-32 text-xs sm:text-sm">合計</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStaffList.map((staff) => {
                      const isExpanded = expandedStaff.has(staff.staffId)
                      return (
                        <Fragment key={staff.staffId}>
                          {/* メイン行 */}
                          <TableRow>
                            <TableCell className="p-2 sm:p-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleStaffExpand(staff.staffId)}
                                className="h-5 w-5 sm:h-6 sm:w-6 p-0"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                                ) : (
                                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className="p-2 sm:p-4 text-xs sm:text-sm">{staff.staffName}</TableCell>
                            <TableCell className="p-2 sm:p-4 text-xs sm:text-sm">{staff.role || '-'}</TableCell>
                            <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm">
                              {staff.totalGMCount}回
                            </TableCell>
                            <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm">
                              ¥{staff.totalGMPay.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm font-bold">
                              ¥{staff.totalSalary.toLocaleString()}
                            </TableCell>
                          </TableRow>
                          
                          {/* 展開行 */}
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={6} className="p-0 bg-muted/50">
                                <div className="p-4">
                                  {/* GM詳細 */}
                                  {staff.gmAssignments.length > 0 ? (
                                    <div>
                                      <h4 className="font-semibold mb-2 text-sm">GM配置詳細</h4>
                                      <div className="overflow-x-auto">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="text-xs">日付</TableHead>
                                              <TableHead className="text-xs">シナリオ</TableHead>
                                              <TableHead className="text-xs">店舗</TableHead>
                                              <TableHead className="text-xs">役割</TableHead>
                                              <TableHead className="text-right text-xs">報酬</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {staff.gmAssignments.map((gm, idx) => (
                                              <TableRow key={idx}>
                                                <TableCell className="text-xs">{gm.date}</TableCell>
                                                <TableCell className="text-xs">
                                                  <div className="flex items-center gap-2">
                                                    <span>{gm.scenarioTitle}</span>
                                                    {gm.isGMTest && (
                                                      <Badge className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-800 hover:bg-orange-100">GMテスト</Badge>
                                                    )}
                                                  </div>
                                                </TableCell>
                                                <TableCell className="text-xs">{gm.storeName}</TableCell>
                                                <TableCell className="text-xs">{gm.gmRole}</TableCell>
                                                <TableCell className="text-right text-xs">¥{gm.pay.toLocaleString()}</TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">詳細データがありません</p>
                                  )}
                                </div>
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
      ) : null}
    </div>
  )
}

