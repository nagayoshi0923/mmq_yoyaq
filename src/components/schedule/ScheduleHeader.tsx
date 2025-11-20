// スケジュール管理のヘッダー部分

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { MonthSwitcher } from '@/components/patterns/calendar'

interface ScheduleHeaderProps {
  currentDate: Date
  isLoading: boolean
  onDateChange: (date: Date) => void
  onImportClick: () => void
}

export const ScheduleHeader = memo(function ScheduleHeader({
  currentDate,
  isLoading,
  onDateChange,
  onImportClick
}: ScheduleHeaderProps) {
  return (
    <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 xs:gap-3 sm:gap-4 mb-2.5 xs:mb-3 sm:mb-4">
      <div className="flex items-center gap-1.5 xs:gap-2 sm:gap-3 min-w-0 flex-1">
        <h2 className="text-base xs:text-lg sm:text-xl md:text-2xl font-bold truncate leading-tight">月間スケジュール管理</h2>
        {/* 更新中のインジケーター */}
        {isLoading && (
          <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 flex-shrink-0">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
            <span className="hidden sm:inline">更新中...</span>
          </div>
        )}
      </div>
      <div className="flex gap-1 xs:gap-1.5 sm:gap-2 items-center w-full xs:w-auto">
        {/* 月選択コントロール */}
        <MonthSwitcher
          value={currentDate}
          onChange={onDateChange}
          showToday
          quickJump
          enableKeyboard
        />
        
        {/* インポートボタン */}
        <Button 
          variant="outline" 
          size="sm"
          onClick={onImportClick}
          className="text-[10px] xs:text-xs sm:text-sm flex-shrink-0 h-8 xs:h-9 sm:h-10"
        >
          <span className="hidden xs:inline">インポート</span>
          <span className="xs:hidden">入</span>
        </Button>
      </div>
    </div>
  )
})

