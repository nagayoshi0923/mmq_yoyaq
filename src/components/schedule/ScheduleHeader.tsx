// スケジュール管理のヘッダー部分

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload } from 'lucide-react'
import type { Staff } from '@/types'

interface ScheduleHeaderProps {
  currentDate: Date
  isLoading: boolean
  onDateChange: (date: Date) => void
  onImportClick: () => void
  gmList?: Staff[]
  selectedGM?: string
  onGMChange?: (gmId: string) => void
}

export const ScheduleHeader = memo(function ScheduleHeader({
  currentDate,
  isLoading,
  onDateChange,
  onImportClick,
  gmList = [],
  selectedGM = 'all',
  onGMChange
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
      {/* スタッフフィルター */}
      {gmList.length > 0 && onGMChange && (
        <Select value={selectedGM} onValueChange={onGMChange}>
          <SelectTrigger className="w-32 sm:w-40">
            <SelectValue placeholder="スタッフ選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全スタッフ</SelectItem>
            {gmList.map((staff) => (
              <SelectItem key={staff.id} value={staff.id}>
                {staff.display_name || staff.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

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

