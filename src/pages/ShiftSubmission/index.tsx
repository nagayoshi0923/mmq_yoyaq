import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { TanStackDataTable } from '@/components/patterns/table'
import { useShiftData } from './hooks/useShiftData'
import { useShiftSubmit } from './hooks/useShiftSubmit'
import { createShiftColumns, type ShiftTableRow } from './utils/tableColumns'
import { useGlobalSettings } from '@/hooks/useGlobalSettings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Info } from 'lucide-react'
import type { DayInfo } from './types'

/**
 * シフト提出ページ
 */
export function ShiftSubmission() {
  // 全体設定を取得
  const { settings: globalSettings, canSubmitShift, canEditShift, canActuallySubmitShift, getTargetMonth } = useGlobalSettings()
  
  // 月選択（初期値は設定に基づいた対象月）
  const [currentDate, setCurrentDate] = useState(() => getTargetMonth())
  
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

  // シフト提出可能かチェック（警告表示用）
  const submissionCheck = canSubmitShift(currentDate)
  
  // シフト編集可能かチェック
  const editCheck = canEditShift(currentDate)
  
  // シフト提出ボタンを実際に押せるかチェック（対象月の当月1日〜末日まで可能）
  const actualSubmitCheck = canActuallySubmitShift(currentDate)
  
  
  // 提出可能な月の範囲を計算
  const submissionRange = useMemo(() => {
    if (!globalSettings) return null
    
    const today = new Date()
    const currentDay = today.getDate()
    const { shift_submission_end_day, shift_submission_target_months_ahead } = globalSettings
    
    let startMonthsAhead = shift_submission_target_months_ahead
    if (currentDay > shift_submission_end_day) {
      startMonthsAhead += 1
    }
    
    const startMonth = new Date(today.getFullYear(), today.getMonth() + startMonthsAhead, 1)
    const endMonth = new Date(today.getFullYear(), today.getMonth() + startMonthsAhead + 2, 1)
    
    const formatMonth = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月`
    
    return {
      start: formatMonth(startMonth),
      end: formatMonth(endMonth)
    }
  }, [globalSettings])

  // 対象月が変更されたら自動的に更新
  useEffect(() => {
    const targetMonth = getTargetMonth()
    if (
      currentDate.getFullYear() !== targetMonth.getFullYear() ||
      currentDate.getMonth() !== targetMonth.getMonth()
    ) {
      setCurrentDate(targetMonth)
    }
  }, [globalSettings])

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
      onDeselectAll: handleDeselectAll,
      disabled: !editCheck.canEdit // 編集期限を過ぎている場合は無効化
    }),
    [handleShiftChange, handleSelectAll, handleDeselectAll, editCheck.canEdit]
  )

  return (
    <AppLayout
      currentPage="shift-submission"
      sidebar={undefined}
      maxWidth="max-w-[1600px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <div className="space-y-3 sm:space-y-4 md:space-y-6">
        <PageHeader
          title={`シフト提出 - ${formatMonthYear()}`}
          description="出勤可能な時間帯にチェックを入れてください"
        >
          {/* PC・タブレット用提出ボタン */}
          <Button 
            onClick={handleSubmitShift} 
            disabled={loading || !actualSubmitCheck.canSubmit}
            size="sm"
            className="hidden sm:flex"
          >
            {loading ? '送信中...' : 'シフトを提出'}
          </Button>
        </PageHeader>

        {/* シフト提出期間の案内・警告 */}
        {globalSettings && (
          <>
            <Alert variant={submissionCheck.canSubmit ? 'default' : 'destructive'}>
              {submissionCheck.canSubmit ? (
                <Info className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription className="space-y-1">
                {submissionCheck.canSubmit ? (
                  <>
                    <div>
                      <strong>提出・編集期間:</strong> 毎月{globalSettings.shift_submission_start_day}日〜
                      {globalSettings.shift_submission_end_day}日
                      {submissionRange && (
                        <> （<span className="text-blue-600 font-semibold">{submissionRange.start}〜{submissionRange.end}</span>のシフトを提出・編集可能）</>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ※提出期限を過ぎた後の変更はシフト制作担当者に連絡してください
                    </div>
                  </>
                ) : (
                  submissionCheck.message
                )}
              </AlertDescription>
            </Alert>
          </>
        )}

        {/* シフト提出ボタン（モバイル用） */}
        <div className="sm:hidden pb-3">
          <Button 
            onClick={handleSubmitShift} 
            disabled={loading || !actualSubmitCheck.canSubmit}
            size="sm"
            className="w-full text-xs"
          >
            {loading ? '送信中...' : 'シフトを提出'}
          </Button>
        </div>

        {/* 月選択（テーブルの真上） */}
        <div className="flex justify-center mb-3">
          <MonthSwitcher
            value={currentDate}
            onChange={setCurrentDate}
            showToday
            quickJump
          />
        </div>

        {/* テーブル */}
        <div className="relative px-[10px]">
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
      </div>
    </AppLayout>
  )
}

