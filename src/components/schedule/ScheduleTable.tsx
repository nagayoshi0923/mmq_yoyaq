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
  stores: Array<{ id: string; name: string; short_name: string; is_temporary?: boolean }>
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
    <div className="overflow-x-auto -mx-2 sm:mx-0 relative">
      {/* 
        モバイル(375px)の場合の計算:
        日付(32) + 会場(24) + 時間枠(106*3=318) = 374px (画面内に収まる)
        メモ(160) = スクロールではみ出す
        合計 min-w = 534px
      */}
      <Table className="table-fixed w-full border-collapse min-w-[534px] sm:min-w-[700px] md:min-w-[800px]">
            <colgroup>
              <col className="w-[32px] sm:w-[40px] md:w-[48px]" />
              <col className="w-[24px] sm:w-[28px] md:w-[32px]" />
              <col />
              <col />
              <col />
              <col className="w-[160px]" />
            </colgroup>
            <TableHeader>
              <TableRow className="bg-muted/50 h-12">
                <TableHead className="sticky left-0 z-30 bg-muted/50 border-r text-xs sm:text-sm font-bold !p-0 !h-auto text-center">
                  <span className="hidden sm:inline">日付</span>
                  <span className="sm:hidden">日</span>
                </TableHead>
                <TableHead className="sticky left-[32px] sm:static z-30 sm:z-auto bg-muted/50 border-r text-xs sm:text-sm font-bold !p-0 !h-auto text-center">
                  <span className="hidden sm:inline">会場</span>
                  <span className="sm:hidden">店</span>
                </TableHead>
                <TableHead className="border-r text-xs sm:text-sm font-bold whitespace-nowrap !p-0 !h-auto text-center">午前</TableHead>
                <TableHead className="border-r text-xs sm:text-sm font-bold whitespace-nowrap !p-0 !h-auto text-center">午後</TableHead>
                <TableHead className="border-r text-xs sm:text-sm font-bold whitespace-nowrap !p-0 !h-auto text-center">夜間</TableHead>
                <TableHead className="text-sm font-bold !p-0 !h-auto text-center">メモ</TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {monthDays.map(day => {
              // 通常の店舗と臨時会場を結合
              const tempVenuesForDay = temporaryVenues.filter(v => {
                const dates = v.temporary_dates || []
                return dates.includes(day.date)
              })
              const allVenues = [...stores, ...tempVenuesForDay]
              
              return allVenues.map((venue, venueIndex) => {
                const isTemporary = venue.is_temporary === true
                
                return (
                <TableRow key={`${day.date}-${venue.id}`} className="min-h-[80px] group bg-background hover:bg-muted/5">
                  {/* 日付・曜日統合セル (Sticky) */}
                  {venueIndex === 0 ? (
                    <TableCell 
                      className={`sticky left-0 z-20 bg-background group-hover:bg-muted/5 schedule-table-cell border-r text-sm !p-0 leading-none text-center align-middle ${day.dayOfWeek === '日' ? 'text-red-600' : day.dayOfWeek === '土' ? 'text-blue-600' : ''}`} 
                      rowSpan={allVenues.length}
                    >
                      <div className="flex flex-col items-center justify-center min-h-[40px] sm:min-h-[48px] md:min-h-[56px] gap-0.5 sm:gap-1">
                        <span className="font-bold text-xs sm:text-base">{day.displayDate.replace(/月/g,'')}</span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground scale-90 sm:scale-100 origin-center">({day.dayOfWeek})</span>
                      </div>
                    </TableCell>
                  ) : null}
                  
                  {/* 店舗セル (Sticky on Mobile) */}
                  <TableCell className="sticky left-[32px] sm:static z-20 sm:z-auto bg-background group-hover:bg-muted/5 schedule-table-cell border-r venue-cell text-xs sm:text-sm font-medium !p-0 leading-none text-center">
                    <div className="flex flex-col items-center justify-center w-full h-full sm:flex-row sm:block">
                      <div className="sm:hidden flex flex-col items-center gap-0.5">
                        {venue.short_name.split('').map((char, i) => (
                          <span key={i} className="leading-none">{char}</span>
                        ))}
                      </div>
                      <span className="hidden sm:inline">{venue.short_name}</span>
                    </div>
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
