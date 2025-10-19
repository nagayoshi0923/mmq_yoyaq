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
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">月間スケジュール管理</h2>
        {/* 更新中のインジケーター */}
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
            <span>更新中...</span>
          </div>
        )}
      </div>
      <div className="flex gap-2 items-center">
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
        >
          インポート
        </Button>
      </div>
    </div>
  )
})

