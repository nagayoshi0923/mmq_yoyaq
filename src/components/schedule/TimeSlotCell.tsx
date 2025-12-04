import React, { useMemo, useState } from 'react'
import { TableCell } from '@/components/ui/table'
import { PerformanceCard } from './PerformanceCard'
import { EmptySlot } from './EmptySlot'
import { Badge } from '@/components/ui/badge'
import type { Staff } from '@/types'
import { logger } from '@/utils/logger'
import { useLongPress } from '@/hooks/useLongPress'

// スケジュールイベントの型定義
interface ScheduleEvent {
  id: string
  date: string // YYYY-MM-DD
  venue: string // 店舗ID
  scenario: string
  gms: string[] // GMの名前の配列
  start_time: string // HH:MM
  end_time: string // HH:MM
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package' | 'mtg' // 公演カテゴリ
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
  notes?: string
  is_reservation_enabled?: boolean
  is_private_request?: boolean // 貸切リクエストかどうか
  reservation_info?: string
  reservation_id?: string // 貸切リクエストの元のreservation ID
  scenarios?: {
    id: string
    title: string
    player_count_max: number
  }
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
  onDrop?: (droppedEvent: ScheduleEvent, targetDate: string, targetVenue: string, targetTimeSlot: 'morning' | 'afternoon' | 'evening') => void
  onContextMenuCell?: (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening', x: number, y: number) => void
  onContextMenuEvent?: (event: ScheduleEvent, x: number, y: number) => void
}

function TimeSlotCellBase({
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
  onToggleReservation,
  onDrop,
  onContextMenuCell,
  onContextMenuEvent
}: TimeSlotCellProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  // 色決定のための定数とヘルパー
  const DEFAULT_AVATAR_COLORS = useMemo(() => [
    '#EFF6FF', '#F0FDF4', '#FFFBEB', '#FEF2F2',
    '#F5F3FF', '#FDF2F8', '#ECFEFF', '#F7FEE7'
  ] as const, [])

  const AVATAR_TEXT_COLORS = useMemo(() => [
    '#2563EB', '#16A34A', '#D97706', '#DC2626',
    '#7C3AED', '#DB2777', '#0891B2', '#65A30D'
  ] as const, [])

  const COLOR_MAP: Record<string, string> = useMemo(() => ({
    '#EFF6FF': '#2563EB', '#F0FDF4': '#16A34A',
    '#FFFBEB': '#D97706', '#FEF2F2': '#DC2626',
    '#F5F3FF': '#7C3AED', '#FDF2F8': '#DB2777',
    '#ECFEFF': '#0891B2', '#F7FEE7': '#65A30D',
  }), [])

  const getStaffAvatarColors = (staff: Staff) => {
    if (staff.avatar_color) {
      const bg = staff.avatar_color
      return {
        bgColor: bg,
        textColor: COLOR_MAP[bg] || '#374151'
      }
    }
    const name = staff.name
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const colorIndex = hash % DEFAULT_AVATAR_COLORS.length
    return {
      bgColor: DEFAULT_AVATAR_COLORS[colorIndex],
      textColor: AVATAR_TEXT_COLORS[colorIndex]
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    try {
      const eventData = e.dataTransfer.getData('application/json')
      if (!eventData) return
      
      const droppedEvent = JSON.parse(eventData) as ScheduleEvent
      onDrop?.(droppedEvent, date, venue, timeSlot)
    } catch (error) {
      logger.error('ドロップエラー:', error)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onContextMenuCell) {
      onContextMenuCell(date, venue, timeSlot, e.clientX, e.clientY)
    }
  }

  // 長押しでコンテキストメニューを表示（スマホ対応）
  const { isLongPressTriggered, ...longPressHandlers } = useLongPress((x, y) => {
    if (onContextMenuCell) {
      onContextMenuCell(date, venue, timeSlot, x, y)
    }
  })

  return (
    <TableCell 
      className={`schedule-table-cell p-0 sm:p-0.5 border-r border-gray-200 transition-colors ${
        isDragOver ? 'bg-purple-50 border-purple-300' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
      {...longPressHandlers}
    >
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
          onContextMenu={onContextMenuEvent}
        />
      ) : (
        <div className="flex flex-col justify-center items-center h-full min-h-[24px] sm:min-h-[28px]">
          <EmptySlot
            date={date}
            venue={venue}
            timeSlot={timeSlot}
            onAddPerformance={onAddPerformance}
          />
          {availableStaff.length > 0 && (
            <div className="flex flex-wrap gap-0.5 justify-center items-center mt-0.5">
              {availableStaff.map((staff) => {
                const { bgColor, textColor } = getStaffAvatarColors(staff)
                return (
                  <Badge
                    key={staff.id}
                    variant="outline"
                    title={staff.name}
                    style={{
                      backgroundColor: bgColor as string,
                      color: textColor as string,
                      borderColor: (textColor as string) + '40'
                    }}
                    className="text-xs px-0.5 py-0 h-3 sm:h-3.5 font-normal border"
                  >
                    {staff.name.slice(0, 2)}
                  </Badge>
                )
              })}
            </div>
          )}
        </div>
      )}
    </TableCell>
  )
}

export const TimeSlotCell = React.memo(TimeSlotCellBase)
