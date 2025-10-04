import { TableCell } from '@/components/ui/table'
import { PerformanceCard } from './PerformanceCard'
import { EmptySlot } from './EmptySlot'
import { StaffAvatar } from '@/components/staff/StaffAvatar'
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
  onAddPerformance
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
          
          {/* 3行目: 出勤可能スタッフのアバター表示 (10px) */}
          {availableStaff.length > 0 ? (
            <div className="flex flex-wrap gap-0.5 justify-end items-end p-1">
              {availableStaff.map((staff) => (
                <div key={staff.id} title={staff.name}>
                  <StaffAvatar
                    name={staff.name}
                    avatarUrl={staff.avatar_url}
                    avatarColor={staff.avatar_color}
                    size="sm"
                    className="h-[18px] w-[18px] text-[8px]"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="p-1"></div>
          )}
        </div>
      )}
    </TableCell>
  )
}
