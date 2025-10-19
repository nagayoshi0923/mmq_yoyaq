import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { TanStackDataTable } from '@/components/patterns/table'
import { useShiftData } from './hooks/useShiftData'
import { useShiftSubmit } from './hooks/useShiftSubmit'
import { createShiftColumns, type ShiftTableRow } from './utils/tableColumns'
import type { DayInfo } from './types'

/**
 * シフト提出ページ
 */
export function ShiftSubmission() {
  // 月選択
  const [currentDate, setCurrentDate] = useState(() => new Date())
  
  // 月間の日付リストを生成
  const monthDays = useMemo((): DayInfo[] => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    
    const days: DayInfo[] = []
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({
        date: dateString,
        dayOfWeek: date.toLocaleDateString('ja-JP', { weekday: 'short' }),
        day: day,
        displayDate: `${month + 1}/${day}`
      })
    }
    
    return days
  }, [currentDate])
  
  const formatMonthYear = () => {
    return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`
  }
  
  const {
    shiftData,
    loading,
    setLoading,
    currentStaffId,
    handleShiftChange,
    handleSelectAll,
    handleDeselectAll
  } = useShiftData({ currentDate, monthDays })
  
  const { handleSubmitShift } = useShiftSubmit({
    currentStaffId,
    shiftData,
    setLoading
  })

  // テーブル用のデータ変換
  const tableData: ShiftTableRow[] = useMemo(() => {
    return monthDays.map((day) => ({
      dayInfo: day,
      shiftData: shiftData[day.date] || {
        id: '',
        staff_id: currentStaffId || '',
        date: day.date,
        morning: false,
        afternoon: false,
        evening: false,
        all_day: false,
        submitted_at: '',
        status: 'draft'
      }
    }))
  }, [monthDays, shiftData, currentStaffId])

  // テーブル列定義（メモ化）
  const tableColumns = useMemo(
    () => createShiftColumns({
      onShiftChange: handleShiftChange,
      onSelectAll: handleSelectAll,
      onDeselectAll: handleDeselectAll
    }),
    [handleShiftChange, handleSelectAll, handleDeselectAll]
  )

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="shift-submission" />
      
      <div className="container mx-auto max-w-7xl px-8 py-6">
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">シフト提出</h1>
              <p className="text-muted-foreground">
                出勤可能な日時を選択してください
              </p>
            </div>
            <MonthSwitcher
              value={currentDate}
              onChange={setCurrentDate}
              showToday
              quickJump
            />
          </div>

          {/* メインカード・テーブル */}
          <Card>
            <CardHeader className="bg-muted/30 border-b border-border">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>シフト提出 - {formatMonthYear()}</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    出勤可能な時間帯にチェックを入れてください
                  </CardDescription>
                </div>
                <Button onClick={handleSubmitShift} disabled={loading}>
                  {loading ? '送信中...' : 'シフトを提出'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TanStackDataTable
                data={tableData}
                columns={tableColumns}
                getRowKey={(row) => row.dayInfo.date}
                emptyMessage="シフトデータがありません"
                loading={loading}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

