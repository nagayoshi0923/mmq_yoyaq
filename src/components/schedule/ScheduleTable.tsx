// スケジュールテーブルの本体（汎用化版）

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TimeSlotCell } from '@/components/schedule/TimeSlotCell'
import { MemoCell } from '@/components/schedule/MemoCell'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff } from '@/types'

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
  const { currentDate, monthDays, stores } = viewConfig
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
              <col style={{ width: 'clamp(32px, 5vw, 48px)' }} />
              <col style={{ width: 'clamp(24px, 3vw, 32px)' }} />
              <col style={{ width: 'clamp(110px, 15vw, 200px)' }} />
              <col style={{ width: 'clamp(110px, 15vw, 200px)' }} />
              <col style={{ width: 'clamp(110px, 15vw, 200px)' }} />
              <col style={{ width: 'clamp(24px, 3vw, 32px)' }} />
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
              return stores.map((store, storeIndex) => (
                <TableRow key={`${day.date}-${store.id}`} className="h-10 sm:h-12 md:h-14">
                  {/* 日付・曜日統合セル */}
                  {storeIndex === 0 ? (
                    <TableCell className={`schedule-table-cell border-r text-schedule-xs !p-0 leading-none text-center align-middle ${day.dayOfWeek === '日' ? 'text-red-600' : day.dayOfWeek === '土' ? 'text-blue-600' : ''}`} rowSpan={stores.length}>
                      <div className="flex flex-col items-center justify-center min-h-[40px] sm:min-h-[48px] md:min-h-[56px] gap-0">
                        <span className="font-semibold">{day.displayDate}</span>
                        <span className="text-xs">({day.dayOfWeek})</span>
                      </div>
                    </TableCell>
                  ) : null}
                  
                  {/* 店舗セル */}
                  <TableCell className="schedule-table-cell border-r venue-cell hover:bg-muted/30 transition-colors text-schedule-xs !p-0 leading-none text-center">
                    {store.short_name}
                  </TableCell>
                  
                  {/* 午前セル */}
                  <TimeSlotCell
                    events={getEventsForSlot(day.date, store.id, 'morning')}
                    date={day.date}
                    venue={store.id}
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
                    events={getEventsForSlot(day.date, store.id, 'afternoon')}
                    date={day.date}
                    venue={store.id}
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
                    events={getEventsForSlot(day.date, store.id, 'evening')}
                    date={day.date}
                    venue={store.id}
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
                    venue={store.id}
                    initialMemo={getMemo(day.date, store.id)}
                    onSave={onSaveMemo}
                  />
                </TableRow>
              ))
            })}
          </TableBody>
        </Table>
    </div>
  )
}
