// スケジュールテーブルの本体（汎用化版）

import { useState, useEffect, useRef, useCallback } from 'react'
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
  const { monthDays, stores, temporaryVenues = [], getVenueNameForDate } = viewConfig
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

  // スティッキー日付バーの状態
  const [currentVisibleDate, setCurrentVisibleDate] = useState<string | null>(null)
  const [showStickyDate, setShowStickyDate] = useState(false)
  const tableRef = useRef<HTMLDivElement>(null)

  // 操作行の高さを取得（動的に計算）
  const [toolbarHeight, setToolbarHeight] = useState(0)
  
  useEffect(() => {
    // 操作行の高さを計算（data-schedule-toolbar属性を持つ要素）
    const updateToolbarHeight = () => {
      const toolbar = document.querySelector('[data-schedule-toolbar]')
      if (toolbar) {
        setToolbarHeight(toolbar.getBoundingClientRect().height)
      }
    }
    
    // 初回計算とリサイズ時に再計算
    updateToolbarHeight()
    window.addEventListener('resize', updateToolbarHeight)
    const timeoutId = setTimeout(updateToolbarHeight, 100)
    
    return () => {
      window.removeEventListener('resize', updateToolbarHeight)
      clearTimeout(timeoutId)
    }
  }, [])

  // スクロール時に現在表示されている日付を追跡
  const handleScroll = useCallback(() => {
    if (!tableRef.current) return

    const toolbar = document.querySelector('[data-schedule-toolbar]')
    if (!toolbar) return
    
    const toolbarRect = toolbar.getBoundingClientRect()
    const tableHeader = tableRef.current.querySelector('thead')
    const tableHeaderHeight = tableHeader?.getBoundingClientRect().height || 40
    const stickyBarHeight = 30 // スティッキーバーの高さ
    
    // テーブルの位置を取得
    const tableRect = tableRef.current.getBoundingClientRect()
    
    // テーブルヘッダーが操作行の下に隠れたらスティッキーバーを表示
    const shouldShow = tableRect.top < toolbarRect.bottom - tableHeaderHeight

    // 各日付行を走査して現在表示されている日付を特定
    const dateRows = tableRef.current.querySelectorAll('[data-date]')
    let foundDate: string | null = null

    for (const row of dateRows) {
      const rect = row.getBoundingClientRect()
      if (rect.top <= toolbarRect.bottom + tableHeaderHeight + stickyBarHeight) {
        foundDate = row.getAttribute('data-date')
      } else {
        break
      }
    }

    setShowStickyDate(shouldShow && foundDate !== null)
    if (foundDate) {
      setCurrentVisibleDate(foundDate)
    }
  }, [])

  // スクロールイベントリスナーを設定
  useEffect(() => {
    const scrollContainer = document.querySelector('.overflow-y-auto') || window
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  // 現在表示されている日付の情報を取得
  const currentDayInfo = monthDays.find(d => d.date === currentVisibleDate)
  const currentHoliday = currentVisibleDate ? getJapaneseHoliday(currentVisibleDate) : null
  const isHolidayOrSunday = currentHoliday || currentDayInfo?.dayOfWeek === '日'
  const dateTextColor = isHolidayOrSunday ? 'text-red-600' : currentDayInfo?.dayOfWeek === '土' ? 'text-blue-600' : 'text-foreground'

  // テーブルヘッダーの高さ（sticky日付バー用）
  const tableHeaderHeight = 40 // 固定値

  return (
    <div ref={tableRef} className="overflow-x-auto -mx-2 sm:mx-0 relative">
      {/* スティッキー日付バー（操作行とテーブルヘッダーの下に表示） */}
      {showStickyDate && currentDayInfo && (
        <div 
          className="sticky z-40 h-[30px] bg-slate-700 text-white flex items-center px-3 text-sm font-medium shadow-md"
          style={{ top: `${toolbarHeight + tableHeaderHeight}px`, marginBottom: '-30px' }}
        >
          <span className={dateTextColor === 'text-red-600' ? 'text-red-300' : dateTextColor === 'text-blue-600' ? 'text-blue-300' : ''}>
            {currentDayInfo.displayDate}（{currentDayInfo.dayOfWeek}）
            {currentHoliday && <span className="ml-2 text-red-300 text-xs">{currentHoliday}</span>}
          </span>
        </div>
      )}
      <Table className="table-fixed w-full border-collapse min-w-[534px] sm:min-w-[700px] md:min-w-[800px]">
        <colgroup>
          <col className="w-[32px] sm:w-[40px] md:w-[48px]" />
          <col className="w-[24px] sm:w-[28px] md:w-[32px]" />
          <col />
          <col />
          <col />
          <col className="w-[160px]" />
        </colgroup>
        <TableHeader className="sticky z-30 bg-muted" style={{ top: `${toolbarHeight}px` }}>
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
            const venueCount = allVenues.length
            
            return allVenues.map((venue, venueIndex) => {
              const isTemporary = venue.is_temporary === true
              const isFirstVenueOfDay = venueIndex === 0
              
              return (
                <TableRow 
                  key={`${day.date}-${venue.id}`} 
                  className={`min-h-[80px] group bg-background hover:bg-muted/5 ${isFirstVenueOfDay ? 'border-t-[3px] border-t-slate-400' : ''}`}
                  data-date={day.date}
                >
                  {/* 日付・曜日セル - 最初の会場行のみ表示、rowSpanで結合 */}
                  {isFirstVenueOfDay && (() => {
                    const holiday = getJapaneseHoliday(day.date)
                    const isHolidayOrSunday = holiday || day.dayOfWeek === '日'
                    const textColor = isHolidayOrSunday ? 'text-red-600' : day.dayOfWeek === '土' ? 'text-blue-600' : ''
                    
                    return (
                      <TableCell 
                        rowSpan={venueCount}
                        className={`sticky left-0 z-20 bg-background group-hover:bg-muted/5 border-r text-sm !p-0 leading-none text-center align-top ${textColor}`}
                      >
                        <div className="flex flex-col items-center justify-start py-2 gap-0.5 sm:gap-1 bg-background">
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
                  })()}
                  
                  {/* 店舗セル */}
                  <TableCell className="sticky left-[32px] sm:static z-20 sm:z-auto bg-background group-hover:bg-muted/5 border-r venue-cell text-xs sm:text-sm font-medium !p-0 leading-none text-center">
                    {(() => {
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
