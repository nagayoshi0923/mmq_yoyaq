// スケジュールテーブルの本体

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

interface ScheduleTableProps {
  currentDate: Date
  monthDays: MonthDay[]
  stores: Array<{ id: string; name: string; short_name: string }>
  getEventsForSlot: (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => ScheduleEvent[]
  shiftData: Record<string, Array<Staff & { timeSlot: string }>>
  categoryConfig: any
  getReservationBadgeClass: (current: number, max: number) => string
  getMemo: (date: string, venue: string) => string
  onSaveMemo: (date: string, venue: string, memo: string) => Promise<void>
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

export function ScheduleTable({
  currentDate,
  monthDays,
  stores,
  getEventsForSlot,
  shiftData,
  categoryConfig,
  getReservationBadgeClass,
  getMemo,
  onSaveMemo,
  onAddPerformance,
  onEditPerformance,
  onDeletePerformance,
  onCancelConfirm,
  onUncancel,
  onToggleReservation,
  onDrop,
  onContextMenuCell,
  onContextMenuEvent
}: ScheduleTableProps) {
  return (
    <Card>
      <CardHeader className="bg-muted/30 border-b border-border">
        <CardTitle>リストカレンダー - {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月</CardTitle>
        <CardDescription className="text-muted-foreground">
          ※公演のタイトルが未決定の場合、当該公演は薄い色で警告表示されます<br/>
          ※シナリオやGMが未定の場合は赤い色で警告表示されます
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table className="table-fixed w-full">
          <colgroup>
            <col className="w-24" />
            <col className="w-16" />
            <col className="w-24" />
            <col style={{ width: '300px' }} />
            <col style={{ width: '300px' }} />
            <col style={{ width: '300px' }} />
            <col className="w-32" />
          </colgroup>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="border-r">日付</TableHead>
              <TableHead className="border-r">曜日</TableHead>
              <TableHead className="border-r">会場</TableHead>
              <TableHead className="border-r">午前 (~12:00)</TableHead>
              <TableHead className="border-r">午後 (12:00-17:00)</TableHead>
              <TableHead className="border-r">夜間 (17:00~)</TableHead>
              <TableHead>メモ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthDays.map(day => {
              return stores.map((store, storeIndex) => (
                <TableRow key={`${day.date}-${store.id}`} className="h-16">
                  {/* 日付セル */}
                  {storeIndex === 0 ? (
                    <TableCell className="schedule-table-cell border-r text-sm" rowSpan={stores.length}>
                      {day.displayDate}
                    </TableCell>
                  ) : null}
                  
                  {/* 曜日セル */}
                  {storeIndex === 0 ? (
                    <TableCell className={`schedule-table-cell border-r text-sm ${day.dayOfWeek === '日' ? 'text-red-600' : day.dayOfWeek === '土' ? 'text-blue-600' : ''}`} rowSpan={stores.length}>
                      {day.dayOfWeek}
                    </TableCell>
                  ) : null}
                  
                  {/* 店舗セル */}
                  <TableCell className="schedule-table-cell border-r venue-cell hover:bg-muted/30 transition-colors text-sm">
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
      </CardContent>
    </Card>
  )
}

