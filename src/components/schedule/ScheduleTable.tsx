// スケジュールテーブルの本体（汎用化版）

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TimeSlotCell } from '@/components/schedule/TimeSlotCell'
import { MemoCell } from '@/components/schedule/MemoCell'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff, Store } from '@/types'

interface MonthDay {
  date: string
  dayOfWeek: string
  day: number
  displayDate: string
}

// Propsをグループ化
export interface ScheduleTableViewConfig {
  currentDate: Date
  monthDays: MonthDay[]
  stores: Array<{ id: string; name: string; short_name: string }>
  temporaryVenues?: Store[]
}

export interface ScheduleTableDataProvider {
  getEventsForSlot: (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => ScheduleEvent[]
  shiftData: Record<string, Array<Staff & { timeSlot: string }>>
  getMemo: (date: string, venue: string) => string
  onSaveMemo: (date: string, venue: string, memo: string) => Promise<void>
}

export interface ScheduleTableEventHandlers {
  onAddPerformance: (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => void
  onEditPerformance: (event: ScheduleEvent) => void
  onDeletePerformance: (event: ScheduleEvent) => void
  onCancelConfirm: (event: ScheduleEvent) => void
  onUncancel: (event: ScheduleEvent) => void
  onToggleReservation: (event: ScheduleEvent) => void
  onDrop: (event: ScheduleEvent, date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => void
  onContextMenuCell: (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening', x: number, y: number) => void
  onContextMenuEvent: (event: ScheduleEvent, x: number, y: number) => void
}

export interface ScheduleTableDisplayConfig {
  categoryConfig: Record<string, { label: string; badgeColor: string; cardColor: string }>
  getReservationBadgeClass: (current: number, max: number) => string
}

export interface ScheduleTableProps {
  viewConfig: ScheduleTableViewConfig
  dataProvider: ScheduleTableDataProvider
  eventHandlers: ScheduleTableEventHandlers
  displayConfig: ScheduleTableDisplayConfig
  modals?: any  // オプション: モーダル関連の情報
  fetchSchedule?: () => void  // オプション: スケジュール再取得関数
}

export function ScheduleTable({
  viewConfig,
  dataProvider,
  eventHandlers,
  displayConfig
}: ScheduleTableProps) {
  const { currentDate, monthDays, stores, temporaryVenues = [] } = viewConfig
  const { getEventsForSlot, shiftData, getMemo, onSaveMemo } = dataProvider
  const {
    onAddPerformance,
    onEditPerformance,
    onDeletePerformance,
    onCancelConfirm,
    onUncancel,
    onToggleReservation,
    onDrop,
    onContextMenuCell,
    onContextMenuEvent
  } = eventHandlers
  const { categoryConfig, getReservationBadgeClass } = displayConfig

  return (
    <div className="overflow-x-auto -mx-2 sm:mx-0">
      <Table className="table-fixed w-full border-collapse min-w-[406px] sm:min-w-[562px] md:min-w-[676px]">
            <colgroup>
              <col className="w-[32px] sm:w-[40px] md:w-[48px]" />
              <col className="w-[24px] sm:w-[28px] md:w-[32px]" />
              <col className="w-[110px] sm:w-[150px] md:w-[190px]" />
              <col className="w-[110px] sm:w-[150px] md:w-[190px]" />
              <col className="w-[110px] sm:w-[150px] md:w-[190px]" />
              <col className="w-[24px] sm:w-[28px] md:w-[32px] lg:w-[160px]" />
            </colgroup>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="border-r text-xs !p-0 !h-auto text-center">日付<br/>曜日</TableHead>
                <TableHead className="border-r text-xs !p-0 !h-auto text-center">会場</TableHead>
                <TableHead className="border-r text-xs whitespace-nowrap !p-0 !h-auto text-center">午前<br/>(~12)</TableHead>
                <TableHead className="border-r text-xs whitespace-nowrap !p-0 !h-auto text-center">午後<br/>(12-17)</TableHead>
                <TableHead className="border-r text-xs whitespace-nowrap !p-0 !h-auto text-center">夜間<br/>(17~)</TableHead>
                <TableHead className="text-xs !p-0 !h-auto text-center">メモ</TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {monthDays.map(day => {
              // デバッグ: 全体の臨時会場を確認（最初の日付のみ）
              if (day.day === 1 && temporaryVenues.length > 0) {
                console.log('🔍 ScheduleTable - 臨時会場全体:', temporaryVenues.map(v => ({
                  id: v.id,
                  name: v.name,
                  temporary_date: v.temporary_date,
                  temporary_date_type: typeof v.temporary_date
                })))
                console.log('🔍 ScheduleTable - day.date:', day.date, typeof day.date)
              }
              
              // 通常の店舗と臨時会場を結合
              const tempVenuesForDay = temporaryVenues.filter(v => {
                const match = v.temporary_date === day.date
                if (!match && day.day === 1) {
                  console.log('🔍 フィルタリング不一致:', {
                    venue: v.name,
                    temporary_date: v.temporary_date,
                    day_date: day.date,
                    are_equal: v.temporary_date === day.date
                  })
                }
                return match
              })
              const allVenues = [...stores, ...tempVenuesForDay]
              
              // デバッグログ
              if (tempVenuesForDay.length > 0) {
                console.log('✅ 臨時会場フィルタリング成功:', {
                  date: day.date,
                  tempVenuesForDay: tempVenuesForDay.map(v => ({ id: v.id, name: v.name, temporary_date: v.temporary_date }))
                })
              }
              
              return allVenues.map((venue, venueIndex) => {
                const isTemporary = venue.is_temporary === true
                
                return (
                <TableRow key={`${day.date}-${venue.id}`} className="h-10 sm:h-12 md:h-14">
                  {/* 日付・曜日統合セル */}
                  {venueIndex === 0 ? (
                    <TableCell 
                      className={`schedule-table-cell border-r text-schedule-xs !p-0 leading-none text-center align-middle ${day.dayOfWeek === '日' ? 'text-red-600' : day.dayOfWeek === '土' ? 'text-blue-600' : ''}`} 
                      rowSpan={allVenues.length}
                    >
                      <div className="flex flex-col items-center justify-center min-h-[40px] sm:min-h-[48px] md:min-h-[56px] gap-0">
                        <span className="font-semibold">{day.displayDate}</span>
                        <span className="text-xs">({day.dayOfWeek})</span>
                      </div>
                    </TableCell>
                  ) : null}
                  
                  {/* 店舗セル */}
                  <TableCell className="schedule-table-cell border-r venue-cell hover:bg-muted/30 transition-colors text-schedule-xs !p-0 leading-none text-center">
                    {venue.short_name}
                  </TableCell>
                  
                  {/* 午前セル */}
                  <TimeSlotCell
                    events={getEventsForSlot(day.date, venue.id, 'morning')}
                    date={day.date}
                    venue={venue.id}
                    timeSlot="morning"
                    availableStaff={shiftData[`${day.date}-morning`] || []}
                    categoryConfig={categoryConfig}
                    getReservationBadgeClass={getReservationBadgeClass}
                    onCancelConfirm={onCancelConfirm}
                    onUncancel={onUncancel}
                    onEdit={onEditPerformance}
                    onDelete={onDeletePerformance}
                    onAddPerformance={onAddPerformance}
                    onToggleReservation={onToggleReservation}
                    onDrop={onDrop}
                    onContextMenuCell={onContextMenuCell}
                    onContextMenuEvent={onContextMenuEvent}
                  />
                  
                  {/* 午後セル */}
                  <TimeSlotCell
                    events={getEventsForSlot(day.date, venue.id, 'afternoon')}
                    date={day.date}
                    venue={venue.id}
                    timeSlot="afternoon"
                    availableStaff={shiftData[`${day.date}-afternoon`] || []}
                    categoryConfig={categoryConfig}
                    getReservationBadgeClass={getReservationBadgeClass}
                    onCancelConfirm={onCancelConfirm}
                    onUncancel={onUncancel}
                    onEdit={onEditPerformance}
                    onDelete={onDeletePerformance}
                    onAddPerformance={onAddPerformance}
                    onDrop={onDrop}
                    onToggleReservation={onToggleReservation}
                    onContextMenuCell={onContextMenuCell}
                    onContextMenuEvent={onContextMenuEvent}
                  />
                  
                  {/* 夜間セル */}
                  <TimeSlotCell
                    events={getEventsForSlot(day.date, venue.id, 'evening')}
                    date={day.date}
                    venue={venue.id}
                    timeSlot="evening"
                    availableStaff={shiftData[`${day.date}-evening`] || []}
                    categoryConfig={categoryConfig}
                    getReservationBadgeClass={getReservationBadgeClass}
                    onCancelConfirm={onCancelConfirm}
                    onUncancel={onUncancel}
                    onEdit={onEditPerformance}
                    onToggleReservation={onToggleReservation}
                    onDelete={onDeletePerformance}
                    onAddPerformance={onAddPerformance}
                    onDrop={onDrop}
                    onContextMenuCell={onContextMenuCell}
                    onContextMenuEvent={onContextMenuEvent}
                  />
                  
                  {/* メモセル */}
                  <MemoCell
                    date={day.date}
                    venue={venue.id}
                    initialMemo={getMemo(day.date, venue.id)}
                    onSave={onSaveMemo}
                  />
                </TableRow>
                )
              })
            })}
          </TableBody>
        </Table>
    </div>
  )
}
