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
      width: 'w-20',
      sortable: false,
      render: (row) => (
        <p className="font-medium text-sm">{row.dayInfo.displayDate}</p>
      )
    },
    {
      key: 'dayOfWeek',
      header: '曜日',
      width: 'w-16',
      sortable: false,
      render: (row) => (
        <p className={`text-sm font-medium ${getDayOfWeekColor(row.dayInfo.dayOfWeek)}`}>
          {row.dayInfo.dayOfWeek}
        </p>
      )
    },
    {
      key: 'morning',
      header: '午前',
      width: 'w-32',
      sortable: false,
      align: 'center',
      renderHeader: () => (
        <div className="flex flex-col items-center space-y-1">
          <span>午前</span>
          <span className="text-xs text-muted-foreground">(~12:00)</span>
          <div className="flex space-x-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onSelectAll('morning')}
              className="h-6 px-2 text-xs"
            >
              <CheckSquare className="h-3 w-3 mr-1" />
              全選択
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onDeselectAll('morning')}
              className="h-6 px-2 text-xs"
            >
              <Square className="h-3 w-3 mr-1" />
              全解除
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
          />
        </div>
      )
    },
    {
      key: 'afternoon',
      header: '午後',
      width: 'w-32',
      sortable: false,
      align: 'center',
      renderHeader: () => (
        <div className="flex flex-col items-center space-y-1">
          <span>午後</span>
          <span className="text-xs text-muted-foreground">(12:00-17:00)</span>
          <div className="flex space-x-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onSelectAll('afternoon')}
              className="h-6 px-2 text-xs"
            >
              <CheckSquare className="h-3 w-3 mr-1" />
              全選択
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onDeselectAll('afternoon')}
              className="h-6 px-2 text-xs"
            >
              <Square className="h-3 w-3 mr-1" />
              全解除
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
          />
        </div>
      )
    },
    {
      key: 'evening',
      header: '夜間',
      width: 'w-32',
      sortable: false,
      align: 'center',
      renderHeader: () => (
        <div className="flex flex-col items-center space-y-1">
          <span>夜間</span>
          <span className="text-xs text-muted-foreground">(17:00~)</span>
          <div className="flex space-x-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onSelectAll('evening')}
              className="h-6 px-2 text-xs"
            >
              <CheckSquare className="h-3 w-3 mr-1" />
              全選択
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onDeselectAll('evening')}
              className="h-6 px-2 text-xs"
            >
              <Square className="h-3 w-3 mr-1" />
              全解除
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
          />
        </div>
      )
    },
    {
      key: 'all_day',
      header: '終日',
      width: 'w-32',
      sortable: false,
      align: 'center',
      renderHeader: () => (
        <div className="flex flex-col items-center space-y-1">
          <span>終日</span>
          <span className="text-xs text-muted-foreground">(全日)</span>
          <div className="flex space-x-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onSelectAll('all_day')}
              className="h-6 px-2 text-xs"
            >
              <CheckSquare className="h-3 w-3 mr-1" />
              全選択
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onDeselectAll('all_day')}
              className="h-6 px-2 text-xs"
            >
              <Square className="h-3 w-3 mr-1" />
              全解除
            </Button>
          </div>
        </div>
      ),
      render: (row) => (
        <div className="flex justify-center">
          <Checkbox
            checked={row.shiftData.all_day}
            onCheckedChange={(checked) =>
              actions.onShiftChange(row.dayInfo.date, 'all_day', checked as boolean)
            }
          />
        </div>
      )
    }
  ]
}

