import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { Calendar, Clock, CheckCircle, Settings } from 'lucide-react'

// サイドバーのメニュー項目定義
const SHIFT_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'shift-submission', label: 'シフト提出', icon: Calendar, description: 'シフトを提出' },
  { id: 'my-shifts', label: '提出済みシフト', icon: CheckCircle, description: '提出済みシフト確認' },
  { id: 'schedule', label: 'スケジュール', icon: Clock, description: 'スケジュール確認' },
  { id: 'notification-settings', label: '通知設定', icon: Settings, description: 'シフト募集通知の設定' }
]
import { MonthSwitcher } from '@/components/patterns/calendar'
import { TanStackDataTable } from '@/components/patterns/table'
import { useShiftData } from './hooks/useShiftData'
import { useShiftSubmit } from './hooks/useShiftSubmit'
import { createShiftColumns, type ShiftTableRow } from './utils/tableColumns'
import { NotificationSettings } from './components/NotificationSettings'
import type { DayInfo } from './types'

/**
 * シフト提出ページ
 */
export function ShiftSubmission() {
  // 月選択
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [activeTab, setActiveTab] = useState('shift-submission')
  
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

  const renderContent = () => {
    switch (activeTab) {
      case 'notification-settings':
        return <NotificationSettings />
      
      case 'shift-submission':
      default:
        return (
          <div className="space-y-3 sm:space-y-4 md:space-y-6">
            {/* ヘッダー */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
              <div>
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold">シフト提出 - {formatMonthYear()}</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  出勤可能な時間帯にチェックを入れてください
                </p>
              </div>
              <MonthSwitcher
                value={currentDate}
                onChange={setCurrentDate}
                showToday
                quickJump
              />
            </div>

            {/* シフト提出ボタン（モバイル用・固定表示） */}
            <div className="sm:hidden sticky top-0 z-50 bg-background pb-2">
              <Button 
                onClick={handleSubmitShift} 
                disabled={loading}
                size="sm"
                className="w-full text-xs shadow-lg"
              >
                {loading ? '送信中...' : 'シフトを提出'}
              </Button>
            </div>

            {/* テーブル */}
            <TanStackDataTable
              data={tableData}
              columns={tableColumns}
              getRowKey={(row) => row.dayInfo.date}
              emptyMessage="シフトデータがありません"
              loading={loading}
              stickyHeader={true}
              stickyHeaderContent={undefined}
            />
          </div>
        )
    }
  }

  return (
    <AppLayout
      currentPage="shift-submission"
      sidebar={
        <UnifiedSidebar
          title="シフト提出"
          mode="list"
          menuItems={SHIFT_MENU_ITEMS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
      maxWidth="max-w-[1600px]"
      containerPadding="px-2 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      {renderContent()}
    </AppLayout>
  )
}

