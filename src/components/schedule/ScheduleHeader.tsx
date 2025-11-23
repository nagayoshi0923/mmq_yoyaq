// スケジュール管理のヘッダー部分

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { Upload } from 'lucide-react'

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
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1>スケジュール管理</h1>
            {/* 更新中のインジケーター */}
            {isLoading && (
              <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                <span className="hidden sm:inline">更新中...</span>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            公演スケジュールの登録・編集・管理を行います
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
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
            className="px-2"
            title="インポート"
          >
            <Upload className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
})

