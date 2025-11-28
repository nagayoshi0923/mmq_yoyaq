// スケジュール管理のヘッダー部分

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, CalendarDays } from 'lucide-react'
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
  return (
    <div className="flex flex-col gap-4 mb-6">
      {/* タイトル行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">スケジュール管理</h1>
          {isLoading && (
            <div className="ml-2 text-sm text-muted-foreground flex items-center gap-1">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
              <span className="hidden sm:inline">更新中...</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={onImportClick}
            title="インポート"
            className="h-9 w-9"
          >
            <Upload className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 操作行（モバイル対応：折り返し） */}
      <div className="flex flex-wrap items-center gap-3">
        <MonthSwitcher
          value={currentDate}
          onChange={onDateChange}
          showToday
          quickJump
          enableKeyboard
        />
        
        {/* スタッフフィルター */}
        {gmList.length > 0 && onGMChange && (
          <Select value={selectedGM} onValueChange={onGMChange}>
            <SelectTrigger className="w-36 sm:w-48 h-9">
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
      </div>
    </div>
  )
})

