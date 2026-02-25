import { useState, Fragment, useEffect } from 'react'
import { showToast } from '@/utils/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/layout/PageHeader'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { Search, Filter, ChevronDown, ChevronRight, Copy, Check, Download, Users } from 'lucide-react'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { useSalaryData } from '@/pages/SalaryCalculation/hooks/useSalaryData'
import { storeApi } from '@/lib/api'
import type { Store } from '@/types'
import type { StaffSalary } from '@/pages/SalaryCalculation/types'

/**
 * スタッフ報酬レポートコンポーネント
 * 作者レポートと同様の形式で、スタッフ別の報酬詳細を表示
 */
export function StaffSalaryReport() {
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set())
  const [searchStaff, setSearchStaff] = useState('')
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [copiedStaff, setCopiedStaff] = useState<string | null>(null)
  
  // 月選択（MonthSwitcher用）
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const selectedYear = currentDate.getFullYear()
  const selectedMonth = currentDate.getMonth() + 1

  // 店舗データ取得
  useEffect(() => {
    storeApi.getAll().then(data => setStores(data || []))
  }, [])

  // データ取得
  const { salaryData, loading } = useSalaryData(selectedYear, selectedMonth, selectedStoreIds)

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

  // レポートテキスト生成
  const generateStaffReportText = (staff: StaffSalary): string => {
    const lines: string[] = []
    
    lines.push(`【${selectedYear}年${selectedMonth}月 報酬レポート】`)
    lines.push(``)
    lines.push(`■ ${staff.staffName} 様`)
    lines.push(``)
    lines.push(`━━━ 月間サマリー ━━━`)
    lines.push(`公演回数: ${staff.totalGMCount}回`)
    if (staff.totalNormalGMCount > 0) {
      lines.push(`  ・通常公演: ${staff.totalNormalGMCount}回`)
    }
    if (staff.totalGMTestCount > 0) {
      lines.push(`  ・GMテスト: ${staff.totalGMTestCount}回`)
    }
    lines.push(``)
    lines.push(`総報酬: ¥${staff.totalSalary.toLocaleString()}`)
    if (staff.totalNormalGMPay > 0) {
      lines.push(`  ・通常公演: ¥${staff.totalNormalGMPay.toLocaleString()}`)
    }
    if (staff.totalGMTestPay > 0) {
      lines.push(`  ・GMテスト: ¥${staff.totalGMTestPay.toLocaleString()}`)
    }
    lines.push(``)
    lines.push(`━━━ 公演詳細 ━━━`)
    
    staff.gmAssignments.forEach(gm => {
      const gmTestMark = gm.isGMTest ? '【GMテスト】' : ''
      lines.push(`${gm.date} ${gm.storeName}`)
      lines.push(`  ${gmTestMark}${gm.scenarioTitle}`)
      lines.push(`  役割: ${gm.gmRole} / 報酬: ¥${gm.pay.toLocaleString()}`)
    })
    
    return lines.join('\n')
  }

  // クリップボードコピー
  const handleCopy = async (staff: StaffSalary) => {
    try {
      const text = generateStaffReportText(staff)
      await navigator.clipboard.writeText(text)
      setCopiedStaff(staff.staffId)
      setTimeout(() => setCopiedStaff(null), 2000)
      showToast.success('クリップボードにコピーしました')
    } catch {
      showToast.error('コピーに失敗しました')
    }
  }

  // CSV エクスポート
  const handleExportCSV = () => {
    if (!salaryData || filteredStaffList.length === 0) {
      showToast.warning('エクスポートするデータがありません')
      return
    }

    const MAX_EXPORT_ROWS = 10000
    if (filteredStaffList.length > MAX_EXPORT_ROWS) {
      showToast.error(`エクスポート件数が上限(${MAX_EXPORT_ROWS}件)を超えています`)
      return
    }

    const csvRows: string[] = []
    
    csvRows.push('スタッフ名,役割,通常公演回数,GMテスト回数,通常報酬,GMテスト報酬,合計報酬')
    
    filteredStaffList.forEach(staff => {
      csvRows.push([
        staff.staffName,
        staff.role,
        staff.totalNormalGMCount,
        staff.totalGMTestCount,
        staff.totalNormalGMPay.toLocaleString(),
        staff.totalGMTestPay.toLocaleString(),
        staff.totalSalary.toLocaleString()
      ].join(','))
    })
    
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF])
    const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `スタッフ報酬_${salaryData.month}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // 展開行のレンダリング
  const renderExpandedRow = (staff: StaffSalary) => {
    if (staff.gmAssignments.length === 0) {
      return (
        <div className="p-4 text-center text-muted-foreground text-sm">
          詳細データがありません
        </div>
      )
    }

    // シナリオごとにグループ化
    const scenarioGroups = new Map<string, typeof staff.gmAssignments>()
    staff.gmAssignments.forEach(gm => {
      const key = gm.scenarioTitle
      if (!scenarioGroups.has(key)) {
        scenarioGroups.set(key, [])
      }
      scenarioGroups.get(key)!.push(gm)
    })

    return (
      <div className="p-4 bg-muted/50">
        <h4 className="font-semibold mb-3 text-sm">シナリオ別詳細</h4>
        <div className="space-y-3">
          {Array.from(scenarioGroups.entries()).map(([scenarioTitle, assignments]) => {
            const scenarioTotal = assignments.reduce((sum, a) => sum + a.pay, 0)
            const hasGMTest = assignments.some(a => a.isGMTest)
            
            return (
              <div key={scenarioTitle} className="border rounded-lg p-3 bg-background">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{scenarioTitle}</span>
                    {hasGMTest && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-800 hover:bg-orange-100">
                        GMテスト含む
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-sm">¥{scenarioTotal.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{assignments.length}回</div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-24">日付</TableHead>
                        <TableHead className="text-xs">店舗</TableHead>
                        <TableHead className="text-xs">役割</TableHead>
                        <TableHead className="text-right text-xs w-24">報酬</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignments.map((gm, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs py-2">
                            <div className="flex items-center gap-1">
                              {gm.date}
                              {gm.isGMTest && (
                                <Badge className="text-[9px] px-1 py-0 bg-orange-100 text-orange-800">テスト</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs py-2">{gm.storeName}</TableCell>
                          <TableCell className="text-xs py-2">{gm.gmRole}</TableCell>
                          <TableCell className="text-right text-xs py-2">¥{gm.pay.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* ヘッダー */}
      <PageHeader
        title="スタッフ報酬レポート"
        description="スタッフ別の報酬詳細レポート"
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
                <StoreMultiSelect
                  stores={stores}
                  selectedStoreIds={selectedStoreIds}
                  onStoreIdsChange={setSelectedStoreIds}
                  label="店舗"
                  placeholder="全店舗"
                />
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
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {salaryData.month}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {filteredStaffList.length}名のスタッフ
                </p>
              </div>
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
                      <TableHead className="text-xs sm:text-sm hidden sm:table-cell">役割</TableHead>
                      <TableHead className="text-right w-16 sm:w-20 text-xs sm:text-sm">回数</TableHead>
                      <TableHead className="text-right w-24 sm:w-32 text-xs sm:text-sm hidden md:table-cell">通常報酬</TableHead>
                      <TableHead className="text-right w-24 sm:w-32 text-xs sm:text-sm hidden md:table-cell">GMテスト報酬</TableHead>
                      <TableHead className="text-right w-24 sm:w-32 text-xs sm:text-sm">合計</TableHead>
                      <TableHead className="w-[60px] sm:w-[80px] text-xs sm:text-sm">アクション</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStaffList.map((staff) => {
                      const isExpanded = expandedStaff.has(staff.staffId)
                      return (
                        <Fragment key={staff.staffId}>
                          {/* メイン行 */}
                          <TableRow className="hover:bg-muted/50">
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
                            <TableCell className="p-2 sm:p-4 text-xs sm:text-sm font-medium">
                              {staff.staffName}
                            </TableCell>
                            <TableCell className="p-2 sm:p-4 text-xs sm:text-sm hidden sm:table-cell">
                              {staff.role || '-'}
                            </TableCell>
                            <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm">
                              {staff.totalGMCount}回
                            </TableCell>
                            <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm hidden md:table-cell">
                              ¥{staff.totalNormalGMPay.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm hidden md:table-cell">
                              {staff.totalGMTestPay > 0 ? (
                                <span className="text-orange-600">¥{staff.totalGMTestPay.toLocaleString()}</span>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell className="text-right p-2 sm:p-4 text-xs sm:text-sm font-bold">
                              ¥{staff.totalSalary.toLocaleString()}
                            </TableCell>
                            <TableCell className="p-2 sm:p-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopy(staff)}
                                className="h-7 px-2 sm:h-8 sm:px-3"
                                title={copiedStaff === staff.staffId ? 'コピー済み' : 'レポートをコピー'}
                              >
                                {copiedStaff === staff.staffId ? (
                                  <Check className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                          
                          {/* 展開行 */}
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={8} className="p-0">
                                {renderExpandedRow(staff)}
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
