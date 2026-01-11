// スケジュールテーブルの本体（汎用化版）

import { useEffect, useCallback, useRef } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TimeSlotCell } from '@/components/schedule/TimeSlotCell'
import { MemoCell } from '@/components/schedule/MemoCell'
import { getJapaneseHoliday } from '@/utils/japaneseHolidays'
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
  getVenueNameForDate?: (venueId: string, date: string) => string  // 日付ごとの臨時会場名を取得
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
  onToggleTentative: (event: ScheduleEvent) => Promise<void>
  onToggleReservation: (event: ScheduleEvent) => void
  onConvertToMemo: (event: ScheduleEvent) => void
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
  events?: ScheduleEvent[]  // オプション: イベント一覧
}

export function ScheduleTable({
  viewConfig,
  dataProvider,
  eventHandlers,
  displayConfig
}: ScheduleTableProps) {
  const { currentDate, monthDays, stores, temporaryVenues = [], getVenueNameForDate } = viewConfig
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

  const tableRef = useRef<HTMLDivElement>(null)
  
  // 日付テキストをテーブルヘッダーの下端に追従させる
  const updateDatePositions = useCallback(() => {
    if (!tableRef.current) return
    
    // 操作行（カテゴリタブ）の下端 + テーブルヘッダー高さ = 日付追従の基準位置
    const toolbar = document.querySelector('[data-schedule-toolbar]')
    const toolbarBottom = toolbar ? toolbar.getBoundingClientRect().bottom : 0
    const headerHeight = 40 // テーブルヘッダーの高さ
    const baseTop = toolbarBottom + headerHeight
    
    // 全ての日付セルを処理
    const dateCells = tableRef.current.querySelectorAll('[data-date-cell]')
    dateCells.forEach((cell) => {
      const cellRect = cell.getBoundingClientRect()
      const dateText = cell.querySelector('[data-date-text]') as HTMLElement
      if (!dateText) return
      
      const dateTextHeight = dateText.offsetHeight
      
      // セルの上端がbaseTopより上にある場合、日付を下に移動
      if (cellRect.top < baseTop && cellRect.bottom > baseTop + dateTextHeight) {
        const offset = baseTop - cellRect.top
        const maxOffset = cellRect.height - dateTextHeight
        dateText.style.transform = `translateY(${Math.max(0, Math.min(offset, maxOffset))}px)`
      } else {
        dateText.style.transform = 'translateY(0)'
      }
    })
  }, [])
  
  useEffect(() => {
    const scrollContainer = document.querySelector('.overflow-y-auto') || window
    const handleScroll = () => requestAnimationFrame(updateDatePositions)
    
    // 初回実行を少し遅延
    const timeoutId = setTimeout(() => {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
      handleScroll()
    }, 100)
    
    return () => {
      clearTimeout(timeoutId)
      scrollContainer.removeEventListener('scroll', handleScroll)
    }
  }, [updateDatePositions])

  return (
    <div ref={tableRef} className="-mx-2 sm:mx-0 relative overflow-x-auto">
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
              <TableRow className="bg-muted h-10">
                <TableHead className="sticky left-0 z-50 bg-muted border-r text-xs sm:text-sm font-bold !p-0 !h-auto text-center">
                  <span className="hidden sm:inline">日付</span>
                  <span className="sm:hidden">日</span>
                </TableHead>
                <TableHead className="sticky left-[32px] sm:static z-50 sm:z-auto bg-muted border-r text-xs sm:text-sm font-bold !p-0 !h-auto text-center">
                  <span className="hidden sm:inline">会場</span>
                  <span className="sm:hidden">店</span>
                </TableHead>
                <TableHead className="bg-muted border-r text-xs sm:text-sm font-bold whitespace-nowrap !p-0 !h-auto text-center">午前</TableHead>
                <TableHead className="bg-muted border-r text-xs sm:text-sm font-bold whitespace-nowrap !p-0 !h-auto text-center">午後</TableHead>
                <TableHead className="bg-muted border-r text-xs sm:text-sm font-bold whitespace-nowrap !p-0 !h-auto text-center">夜間</TableHead>
                <TableHead className="bg-muted text-sm font-bold !p-0 !h-auto text-center">メモ</TableHead>
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
                // 日付の最初の行には太いボーダーを追加
                const isFirstVenueOfDay = venueIndex === 0
                
                return (
                <TableRow 
                  key={`${day.date}-${venue.id}`} 
                  className={`min-h-[80px] group bg-background hover:bg-muted/5 ${isFirstVenueOfDay ? 'border-t-[3px] border-t-slate-400' : ''}`}
                >
                  {/* 日付・曜日セル - rowSpanで結合、日付テキストがスクロールに追従 */}
                  {venueIndex === 0 ? (() => {
                    const holiday = getJapaneseHoliday(day.date)
                    const isHolidayOrSunday = holiday || day.dayOfWeek === '日'
                    const textColor = isHolidayOrSunday ? 'text-red-600' : day.dayOfWeek === '土' ? 'text-blue-600' : ''
                    
                    return (
                      <TableCell 
                        className={`sticky left-0 z-20 bg-background schedule-table-cell border-r text-sm !p-0 leading-none text-center align-top ${textColor}`}
                        rowSpan={allVenues.length}
                        data-date-cell={day.date}
                      >
                        {/* 日付テキスト - スクロール時にセル表示領域の上端に追従 */}
                        <div 
                          data-date-text={day.date}
                          className="flex flex-col items-center justify-center py-2 gap-0.5 sm:gap-1 bg-background transition-transform duration-75"
                        >
                          <span className="font-bold text-xs sm:text-base">{day.displayDate.replace(/月/g,'')}</span>
                          <span className={`text-[10px] sm:text-xs scale-90 sm:scale-100 origin-center ${isHolidayOrSunday ? 'text-red-500' : 'text-muted-foreground'}`}>
                            ({day.dayOfWeek})
                          </span>
                          {holiday && (
                            <span className="text-[8px] sm:text-[10px] text-red-500 leading-tight break-all text-center px-0.5">
                              {holiday}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    )
                  })() : null}
                  
                  {/* 店舗セル (Sticky on Mobile) */}
                  <TableCell className="sticky left-[32px] sm:static z-20 sm:z-auto bg-background group-hover:bg-muted/5 schedule-table-cell border-r venue-cell text-xs sm:text-sm font-medium !p-0 leading-none text-center">
                    {(() => {
                      // 臨時会場の場合は日付ごとのカスタム名を使用
                      const displayName = isTemporary && getVenueNameForDate
                        ? getVenueNameForDate(venue.id, day.date)
                        : venue.short_name
                      
                      return (
                        <div className="flex flex-col items-center justify-center w-full h-full sm:flex-row sm:block">
                          <div className="sm:hidden flex flex-col items-center gap-0.5">
                            {displayName.split('').map((char, i) => (
                              <span key={i} className="leading-none">{char}</span>
                            ))}
                          </div>
                          <span className="hidden sm:inline">{displayName}</span>
                        </div>
                      )
                    })()}
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
