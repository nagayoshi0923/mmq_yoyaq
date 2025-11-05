import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckSquare, Square } from 'lucide-react'
import type { Column } from '@/components/patterns/table'
import type { DayInfo, ShiftSubmission } from '../types'
import { getDayOfWeekColor } from './shiftFormatters'

/**
 * シフト提出テーブルの行データ
 */
export interface ShiftTableRow {
  dayInfo: DayInfo
  shiftData: ShiftSubmission
}

/**
 * テーブルアクション
 */
export interface ShiftTableActions {
  onShiftChange: (date: string, slot: 'morning' | 'afternoon' | 'evening' | 'all_day', checked: boolean) => void
  onSelectAll: (slot: 'morning' | 'afternoon' | 'evening' | 'all_day') => void
  onDeselectAll: (slot: 'morning' | 'afternoon' | 'evening' | 'all_day') => void
}

/**
 * シフト提出テーブルの列定義
 */
export function createShiftColumns(actions: ShiftTableActions): Column<ShiftTableRow>[] {
  return [
    {
      key: 'date',
      header: '日付',
      width: 'w-12 sm:w-16 md:w-20',
      sortable: false,
      render: (row) => (
        <p className="font-medium text-[10px] sm:text-xs md:text-sm">{row.dayInfo.displayDate}</p>
      )
    },
    {
      key: 'dayOfWeek',
      header: '曜日',
      width: 'w-10 sm:w-12 md:w-16',
      sortable: false,
      render: (row) => (
        <p className={`text-[10px] sm:text-xs md:text-sm font-medium ${getDayOfWeekColor(row.dayInfo.dayOfWeek)}`}>
          {row.dayInfo.dayOfWeek}
        </p>
      )
    },
    {
      key: 'morning',
      header: '午前',
      width: 'w-[60px] sm:w-32 md:w-48',
      sortable: false,
      align: 'center',
      renderHeader: () => (
        <div className="flex flex-col items-center space-y-0.5 sm:space-y-1 w-full">
          <span className="text-[10px] sm:text-xs md:text-sm">午前</span>
          <span className="text-[8px] sm:text-[10px] md:text-xs text-muted-foreground hidden sm:inline">(~12:00)</span>
          <div className="flex space-x-0.5 sm:space-x-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onSelectAll('morning')}
              className="h-5 sm:h-6 px-1 sm:px-2 text-[8px] sm:text-[10px] md:text-xs"
            >
              <CheckSquare className="h-2.5 w-2.5 sm:h-3 sm:w-3 sm:mr-1" />
              <span className="hidden sm:inline">全選択</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onDeselectAll('morning')}
              className="h-5 sm:h-6 px-1 sm:px-2 text-[8px] sm:text-[10px] md:text-xs"
            >
              <Square className="h-2.5 w-2.5 sm:h-3 sm:w-3 sm:mr-1" />
              <span className="hidden sm:inline">全解除</span>
            </Button>
          </div>
        </div>
      ),
      render: (row) => (
        <div className="flex justify-center">
          <Checkbox
            checked={row.shiftData.morning}
            onCheckedChange={(checked) =>
              actions.onShiftChange(row.dayInfo.date, 'morning', checked as boolean)
            }
            className="h-4 w-4 sm:h-5 sm:w-5"
          />
        </div>
      )
    },
    {
      key: 'afternoon',
      header: '午後',
      width: 'w-[60px] sm:w-32 md:w-48',
      sortable: false,
      align: 'center',
      renderHeader: () => (
        <div className="flex flex-col items-center space-y-0.5 sm:space-y-1 w-full">
          <span className="text-[10px] sm:text-xs md:text-sm">午後</span>
          <span className="text-[8px] sm:text-[10px] md:text-xs text-muted-foreground hidden sm:inline">(12:00-17:00)</span>
          <div className="flex space-x-0.5 sm:space-x-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onSelectAll('afternoon')}
              className="h-5 sm:h-6 px-1 sm:px-2 text-[8px] sm:text-[10px] md:text-xs"
            >
              <CheckSquare className="h-2.5 w-2.5 sm:h-3 sm:w-3 sm:mr-1" />
              <span className="hidden sm:inline">全選択</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onDeselectAll('afternoon')}
              className="h-5 sm:h-6 px-1 sm:px-2 text-[8px] sm:text-[10px] md:text-xs"
            >
              <Square className="h-2.5 w-2.5 sm:h-3 sm:w-3 sm:mr-1" />
              <span className="hidden sm:inline">全解除</span>
            </Button>
          </div>
        </div>
      ),
      render: (row) => (
        <div className="flex justify-center">
          <Checkbox
            checked={row.shiftData.afternoon}
            onCheckedChange={(checked) =>
              actions.onShiftChange(row.dayInfo.date, 'afternoon', checked as boolean)
            }
            className="h-4 w-4 sm:h-5 sm:w-5"
          />
        </div>
      )
    },
    {
      key: 'evening',
      header: '夜間',
      width: 'w-[60px] sm:w-32 md:w-48',
      sortable: false,
      align: 'center',
      renderHeader: () => (
        <div className="flex flex-col items-center space-y-0.5 sm:space-y-1 w-full">
          <span className="text-[10px] sm:text-xs md:text-sm">夜間</span>
          <span className="text-[8px] sm:text-[10px] md:text-xs text-muted-foreground hidden sm:inline">(17:00~)</span>
          <div className="flex space-x-0.5 sm:space-x-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onSelectAll('evening')}
              className="h-5 sm:h-6 px-1 sm:px-2 text-[8px] sm:text-[10px] md:text-xs"
            >
              <CheckSquare className="h-2.5 w-2.5 sm:h-3 sm:w-3 sm:mr-1" />
              <span className="hidden sm:inline">全選択</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onDeselectAll('evening')}
              className="h-5 sm:h-6 px-1 sm:px-2 text-[8px] sm:text-[10px] md:text-xs"
            >
              <Square className="h-2.5 w-2.5 sm:h-3 sm:w-3 sm:mr-1" />
              <span className="hidden sm:inline">全解除</span>
            </Button>
          </div>
        </div>
      ),
      render: (row) => (
        <div className="flex justify-center">
          <Checkbox
            checked={row.shiftData.evening}
            onCheckedChange={(checked) =>
              actions.onShiftChange(row.dayInfo.date, 'evening', checked as boolean)
            }
            className="h-4 w-4 sm:h-5 sm:w-5"
          />
        </div>
      )
    }
  ]
}

