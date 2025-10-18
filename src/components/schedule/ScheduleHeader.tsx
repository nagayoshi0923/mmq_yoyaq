// スケジュール管理のヘッダー部分

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ScheduleHeaderProps {
  currentDate: Date
  isLoading: boolean
  onMonthChange: (direction: 'prev' | 'next') => void
  onMonthSelect: (month: number) => void
  onImportClick: () => void
}

export const ScheduleHeader = memo(function ScheduleHeader({
  currentDate,
  isLoading,
  onMonthChange,
  onMonthSelect,
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
        <div className="flex items-center gap-2 border rounded-lg p-1">
          <Button variant="ghost" size="sm" onClick={() => onMonthChange('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select 
            value={currentDate.getMonth().toString()} 
            onValueChange={(value) => onMonthSelect(parseInt(value))}
          >
            <SelectTrigger className="w-32 border-0 focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i} value={i.toString()}>
                  {new Date(2025, i).toLocaleDateString('ja-JP', { month: 'long' })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => onMonthChange('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        
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

