import React from 'react'
import { TableCell } from '@/components/ui/table'
import { PerformanceCard } from './PerformanceCard'
import { EmptySlot } from './EmptySlot'

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
  is_cancelled?: boolean
  participant_count?: number
  max_participants?: number
  notes?: string
}

interface TimeSlotCellProps {
  events: ScheduleEvent[]
  date: string
  venue: string
  timeSlot: 'morning' | 'afternoon' | 'evening'
  categoryConfig: {
    [key: string]: {
      label: string
      badgeColor: string
      cardColor: string
    }
  }
  getReservationBadgeClass: (current: number, max: number) => string
  onCancel?: (event: ScheduleEvent) => void
  onUncancel?: (event: ScheduleEvent) => void
  onAddPerformance?: (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => void
}

export function TimeSlotCell({
  events,
  date,
  venue,
  timeSlot,
  categoryConfig,
  getReservationBadgeClass,
  onCancel,
  onUncancel,
  onAddPerformance
}: TimeSlotCellProps) {
  return (
    <TableCell className="schedule-table-cell">
      {events.length > 0 ? (
        <PerformanceCard
          event={events[0]}
          categoryConfig={categoryConfig}
          getReservationBadgeClass={getReservationBadgeClass}
          onCancel={onCancel}
          onUncancel={onUncancel}
        />
      ) : (
        <EmptySlot
          date={date}
          venue={venue}
          timeSlot={timeSlot}
          onAddPerformance={onAddPerformance}
        />
      )}
    </TableCell>
  )
}
