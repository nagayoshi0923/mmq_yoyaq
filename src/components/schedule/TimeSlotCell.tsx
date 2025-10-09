import { TableCell } from '@/components/ui/table'
import { PerformanceCard } from './PerformanceCard'
import { EmptySlot } from './EmptySlot'
import { Badge } from '@/components/ui/badge'
import type { Staff } from '@/types'

// スケジュールイベントの型定義
interface ScheduleEvent {
  id: string
  date: string // YYYY-MM-DD
  venue: string // 店舗ID
  scenario: string
  gms: string[] // GMの名前の配列
  start_time: string // HH:MM
  end_time: string // HH:MM
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' // 公演カテゴリ
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
  notes?: string
  is_reservation_enabled?: boolean
  is_private_request?: boolean // 貸切リクエストかどうか
  reservation_info?: string
}

interface TimeSlotCellProps {
  events: ScheduleEvent[]
  date: string
  venue: string
  timeSlot: 'morning' | 'afternoon' | 'evening'
  availableStaff?: Array<Staff & { timeSlot: string }>
  categoryConfig: {
    [key: string]: {
      label: string
      badgeColor: string
      cardColor: string
    }
  }
  getReservationBadgeClass: (current: number, max: number) => string
  onCancelConfirm?: (event: ScheduleEvent) => void
  onUncancel?: (event: ScheduleEvent) => void
  onEdit?: (event: ScheduleEvent) => void
  onDelete?: (event: ScheduleEvent) => void
  onAddPerformance?: (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => void
  onToggleReservation?: (event: ScheduleEvent) => void
}

export function TimeSlotCell({
  events,
  date,
  venue,
  timeSlot,
  availableStaff = [],
  categoryConfig,
  getReservationBadgeClass,
  onCancelConfirm,
  onUncancel,
  onEdit,
  onDelete,
  onAddPerformance,
  onToggleReservation
}: TimeSlotCellProps) {
  return (
    <TableCell className="schedule-table-cell p-1 border-r border-gray-200">
      {events.length > 0 ? (
        // 公演ありの場合: アバター非表示
        <PerformanceCard
          event={events[0]}
          categoryConfig={categoryConfig}
          getReservationBadgeClass={getReservationBadgeClass}
          onCancelConfirm={onCancelConfirm}
          onUncancel={onUncancel}
          onEdit={onEdit}
          onDelete={onDelete}
          onClick={onEdit}
          onToggleReservation={onToggleReservation}
        />
      ) : (
        <div className="grid grid-rows-[10px_10px_10px] gap-0 h-full">
          {/* 1行目: 空スペース (10px) */}
          <div className="p-1"></div>
          
          {/* 2行目: 公演追加ボタン (10px) */}
          <div className="flex items-center justify-center p-1">
            <EmptySlot
              date={date}
              venue={venue}
              timeSlot={timeSlot}
              onAddPerformance={onAddPerformance}
            />
          </div>
          
          {/* 3行目: 出勤可能スタッフのバッジ表示 (10px) */}
          {availableStaff.length > 0 ? (
            <div className="flex flex-wrap gap-0.5 justify-end items-end p-1">
              {availableStaff.map((staff) => {
                // 背景色と文字色を計算
                const defaultColors = [
                  '#EFF6FF', '#F0FDF4', '#FFFBEB', '#FEF2F2',
                  '#F5F3FF', '#FDF2F8', '#ECFEFF', '#F7FEE7'
                ]
                const textColors = [
                  '#2563EB', '#16A34A', '#D97706', '#DC2626',
                  '#7C3AED', '#DB2777', '#0891B2', '#65A30D'
                ]
                
                let bgColor: string
                let textColorHex: string
                
                if (staff.avatar_color) {
                  bgColor = staff.avatar_color
                  const colorMap: Record<string, string> = {
                    '#EFF6FF': '#2563EB', '#F0FDF4': '#16A34A',
                    '#FFFBEB': '#D97706', '#FEF2F2': '#DC2626',
                    '#F5F3FF': '#7C3AED', '#FDF2F8': '#DB2777',
                    '#ECFEFF': '#0891B2', '#F7FEE7': '#65A30D',
                  }
                  textColorHex = colorMap[staff.avatar_color] || '#374151'
                } else {
                  const hash = staff.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
                  const colorIndex = hash % defaultColors.length
                  bgColor = defaultColors[colorIndex]
                  textColorHex = textColors[colorIndex]
                }
                
                return (
                  <Badge
                    key={staff.id}
                    variant="outline"
                    title={staff.name}
                    style={{
                      backgroundColor: bgColor,
                      color: textColorHex,
                      borderColor: textColorHex + '40'
                    }}
                    className="text-[8px] px-1 py-0 h-4 font-normal border"
                  >
                    {staff.name.slice(0, 2)}
                  </Badge>
                )
              })}
            </div>
          ) : (
            <div className="p-1"></div>
          )}
        </div>
      )}
    </TableCell>
  )
}
