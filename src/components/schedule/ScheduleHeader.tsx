// スケジュール管理のヘッダー部分

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
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
  // タイトルに更新中インジケーターを含める
  const titleContent = (
    <div className="flex items-center gap-2">
      <span>スケジュール管理</span>
      {isLoading && (
        <div className="text-xs sm:text-xs text-muted-foreground flex items-center gap-1">
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
          <span className="hidden sm:inline">更新中...</span>
        </div>
      )}
    </div>
  )

  return (
    <PageHeader
      title={titleContent}
      description="公演スケジュールの登録・編集・管理を行います"
    >
      <MonthSwitcher
        value={currentDate}
        onChange={onDateChange}
        showToday
        quickJump
        enableKeyboard
      />
      
      <Button 
        variant="outline" 
        size="sm"
        onClick={onImportClick}
        className="px-2"
        title="インポート"
      >
        <Upload className="h-4 w-4" />
      </Button>
    </PageHeader>
  )
})

