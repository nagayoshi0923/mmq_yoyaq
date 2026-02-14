import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { memo, useMemo, useCallback } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { BookingFilters } from './BookingFilters'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { formatDateJST } from '@/utils/dateUtils'

interface ListViewData {
  date: number
  store: any
}

interface ListViewProps {
  listViewMonth: Date
  onMonthChange: (date: Date) => void
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  stores: any[]
  listViewData: ListViewData[]
  getEventsForDateStore: (date: number, storeId: string) => any[]
  getColorFromName: (color: string) => string
  scenarios: any[]
  onCardClick: (scenarioId: string) => void
  blockedSlots?: any[]
  privateBookingDeadlineDays?: number
  organizationSlug?: string
}

/**
 * リストビューコンポーネント
 */
export const ListView = memo(function ListView({
  listViewMonth,
  onMonthChange,
  selectedStoreIds,
  onStoreIdsChange,
  stores,
  listViewData,
  getEventsForDateStore,
  getColorFromName,
  scenarios,
  onCardClick,
  blockedSlots = [],
  privateBookingDeadlineDays = 7,
  organizationSlug
}: ListViewProps) {
  const navigate = useNavigate()
  
  // 最適化: シナリオをMapでインデックス化（O(1)アクセス）
  const scenarioMap = useMemo(() => {
    const map = new Map<string, any>()
    scenarios.forEach(scenario => {
      map.set(scenario.scenario_id, scenario)
      if (scenario.scenario_title) {
        map.set(scenario.scenario_title, scenario)
      }
    })
    return map
  }, [scenarios])
  
  // GMテスト等のブロックイベントを日付×店舗×時間帯でインデックス化
  const blockedEventsByDateStoreSlot = useMemo(() => {
    const map = new Map<string, any[]>()
    blockedSlots.forEach(event => {
      const dateStr = event.date
      const eventStoreId = event.store_id || event.venue
      const hour = parseInt(event.start_time?.split(':')[0] || '0')
      let timeSlot = 'morning'
      if (hour >= 12 && hour <= 17) timeSlot = 'afternoon'
      else if (hour >= 18) timeSlot = 'evening'
      
      const key = `${dateStr}:${eventStoreId}:${timeSlot}`
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(event)
    })
    return map
  }, [blockedSlots])

  // ブロックイベントを取得する関数
  const getBlockedEvents = useCallback((date: number, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    const dateObj = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)
    const dateStr = formatDateJST(dateObj)
    const key = `${dateStr}:${storeId}:${timeSlot}`
    return blockedEventsByDateStoreSlot.get(key) || []
  }, [blockedEventsByDateStoreSlot, listViewMonth])
  
  // 前公演のend_time + 1時間から開始時間を計算
  const defaultStartTimes: Record<string, string> = { morning: '09:00', afternoon: '14:00', evening: '19:00' }
  const slotEndTimes: Record<string, string> = { morning: '13:00', afternoon: '18:00', evening: '23:00' }
  
  const getSuggestedStartTime = (timeSlot: 'morning' | 'afternoon' | 'evening', precedingEvents: any[]) => {
    if (precedingEvents.length === 0) return defaultStartTimes[timeSlot]
    const latestEnd = precedingEvents.reduce((latest: string, e: any) => 
      (e.end_time || '') > latest ? (e.end_time || '') : latest, '')
    if (!latestEnd) return defaultStartTimes[timeSlot]
    // +1時間
    const [h, m] = latestEnd.split(':').map(Number)
    const suggested = `${String(h + 1).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
    return suggested > defaultStartTimes[timeSlot] ? suggested : defaultStartTimes[timeSlot]
  }
  
  const isSlotAvailable = (timeSlot: 'morning' | 'afternoon' | 'evening', precedingEvents: any[]) => {
    const startTime = getSuggestedStartTime(timeSlot, precedingEvents)
    return startTime < slotEndTimes[timeSlot]
  }
  
  const renderEventCell = (events: any[], store: any, timeSlot: 'morning' | 'afternoon' | 'evening', date: number, precedingEvents: any[] = []) => {
    // GMテスト等のブロックイベントを取得してマージ
    const blockedEvents = getBlockedEvents(date, store.id, timeSlot)
    const allEvents = [...events, ...blockedEvents].sort((a, b) => {
      return (a.start_time || '').localeCompare(b.start_time || '')
    })
    
    // 日付文字列を生成（YYYY-MM-DD形式）
    const dateStr = `${listViewMonth.getFullYear()}-${String(listViewMonth.getMonth() + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    
    // 貸切申込の締切チェック
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const targetDate = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)
    targetDate.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const canApplyPrivateBooking = diffDays >= privateBookingDeadlineDays
    
    if (allEvents.length === 0) {
      // 締切を過ぎている場合は貸切ボタンを表示しない
      if (!canApplyPrivateBooking) {
        return <div className="p-1 sm:p-2 text-xs text-gray-400 text-center">-</div>
      }
      // 前公演の終了時間 + 1時間後が開始時間
      // 前のスロットのイベント + ブロックイベントを考慮
      const allPrecedingEvents = [...precedingEvents]
      // 前スロットのブロックイベントも含める
      const precedingSlotNames: Record<string, string[]> = {
        morning: [],
        afternoon: ['morning'],
        evening: ['morning', 'afternoon']
      }
      precedingSlotNames[timeSlot].forEach(pSlot => {
        const pBlocked = getBlockedEvents(date, store.id, pSlot as 'morning' | 'afternoon' | 'evening')
        allPrecedingEvents.push(...pBlocked)
      })
      
      // スロットが利用可能かチェック
      if (!isSlotAvailable(timeSlot, allPrecedingEvents)) {
        return <div className="p-1 sm:p-2 text-xs text-gray-400 text-center">-</div>
      }
      
      const suggestedTime = getSuggestedStartTime(timeSlot, allPrecedingEvents)
      return (
        <div className="p-1 sm:p-2">
          <button
            className="w-full text-xs py-1 sm:py-1.5 px-1 sm:px-2 border border-dashed border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
            onClick={() => {
              const basePath = organizationSlug ? `/${organizationSlug}` : ''
              const storeParam = selectedStoreIds.length > 0 ? selectedStoreIds.join(',') : store.id
              navigate(`${basePath}/private-booking-select?date=${dateStr}&store=${storeParam}&slot=${timeSlot}&time=${suggestedTime}`)
            }}
          >
            {suggestedTime}〜 貸切申込
          </button>
        </div>
      )
    }

    return allEvents.map((event: any, idx: number) => {
      // useBookingDataで事前計算済みのplayer_count_maxを使用
      const maxParticipants = event.player_count_max || 8
      const currentParticipants = event.current_participants || 0
      const available = maxParticipants - currentParticipants
      const isFull = available === 0
      const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
      const isGmTest = event.category === 'gmtest' || event.category === 'testplay'
      const isReserved = isPrivateBooking || isGmTest // 予約済みかどうか
      const storeColor = getColorFromName(store.color)
      
      // シナリオ情報を取得（クリック時のscenario_id用）
      const scenario = scenarioMap.get(event.scenario_id) || 
                       scenarioMap.get(event.scenario) ||
                       event.scenario_data
      // useBookingDataで事前計算済みのkey_visual_urlを使用
      const imageUrl = event.key_visual_url

      // 予約済みの場合はdisabledボタン風の表示
      if (isReserved) {
        return (
          <div key={idx} className="p-1 sm:p-2">
            <div
              className="w-full text-xs py-1 sm:py-1.5 px-1 sm:px-2 border border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed flex items-center justify-between"
            >
              <span>{event.start_time?.slice(0, 5)}</span>
              <span>貸切満席</span>
            </div>
          </div>
        )
      }
      
      return (
        <div
          key={idx}
          className="text-xs transition-colors border-l-2 touch-manipulation cursor-pointer hover:bg-gray-50"
          style={{
            borderLeftColor: isFull ? '#9CA3AF' : storeColor,
            backgroundColor: isFull ? '#F3F4F6' : `${storeColor}15`,
            padding: '2px 3px',
            display: 'block'
          }}
          onClick={() => {
            if (scenario) {
              onCardClick(scenario.scenario_id)
            }
          }}
        >
          <div className="flex gap-0.5 sm:gap-2">
            {/* 左カラム: 画像 */}
            <div className={`flex-shrink-0 w-[28px] sm:w-[46px] self-stretch overflow-hidden ${
              imageUrl ? 'bg-gray-200' : 'bg-gray-200'
            }`}>
              {imageUrl ? (
                <OptimizedImage
                  src={imageUrl}
                  alt={event.scenario || scenario?.scenario_title || event.scenarios?.title || 'シナリオ画像'}
                  responsive={false}
                  useWebP={true}
                  quality={70}
                  lazy={true}
                  srcSetSizes={[50, 100]}
                  breakpoints={{ mobile: 50, tablet: 75, desktop: 100 }}
                  className="w-full h-full object-cover"
                  fallback={
                    <div className="w-full h-full bg-gray-200 relative">
                      <span className="absolute inset-0 flex items-center justify-center text-gray-400 text-[10px] sm:text-xs">
                        No Image
                      </span>
                    </div>
                  }
                />
              ) : (
                <div className="w-full h-full bg-gray-200 relative">
                  <span className="absolute inset-0 flex items-center justify-center text-gray-400 text-[10px] sm:text-xs">
                    No Image
                  </span>
                </div>
              )}
            </div>

            {/* 右カラム: 情報 */}
            <div className="flex flex-col gap-0 flex-1 min-w-0 justify-between">
              <div className="text-xs sm:text-sm text-left leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                  {event.start_time?.slice(0, 5)}
                </div>
              <div className="text-xs sm:text-sm text-left truncate leading-tight text-gray-800">
                {event.scenario || event.scenarios?.title}
              </div>
              <div className={`text-xs sm:text-sm text-right leading-tight ${isFull ? 'text-gray-500' : 'text-gray-600'}`}>
                {isFull ? '満席' : `残り${available}人`}
              </div>
            </div>
          </div>
        </div>
      )
    })
  }

  return (
    <div className="space-y-4">
      {/* 月ナビゲーション + 店舗フィルター（1行に配置） */}
      <BookingFilters
        currentMonth={listViewMonth}
        onMonthChange={onMonthChange}
        selectedStoreIds={selectedStoreIds}
        onStoreIdsChange={onStoreIdsChange}
        stores={stores}
      />

      {/* リスト表示テーブル */}
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <Table className="w-full table-fixed">
        <colgroup>
          <col className="hidden sm:table-column w-24" />
          <col className="w-12 sm:w-16" />
          <col className="w-auto" />
          <col className="w-auto" />
          <col className="w-auto" />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-muted/50">
              <TableHead className="hidden sm:table-cell border-r text-sm whitespace-nowrap">日付</TableHead>
              <TableHead className="border-r text-xs sm:text-sm whitespace-nowrap">
                会場
              </TableHead>
              <TableHead className="border-r text-xs sm:text-sm text-center">
                <span className="sm:hidden">朝</span>
                <span className="hidden sm:inline">朝公演</span>
                <div className="text-[10px] text-gray-400 font-normal">9:00-12:00</div>
              </TableHead>
              <TableHead className="border-r text-xs sm:text-sm text-center">
                <span className="sm:hidden">昼</span>
                <span className="hidden sm:inline">昼公演</span>
                <div className="text-[10px] text-gray-400 font-normal">14:00-18:00</div>
              </TableHead>
              <TableHead className="text-xs sm:text-sm text-center">
                <span className="sm:hidden">夜</span>
                <span className="hidden sm:inline">夜公演</span>
                <div className="text-[10px] text-gray-400 font-normal">19:00-23:00</div>
              </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listViewData.map(({ date, store }, index) => {
            const events = getEventsForDateStore(date, store.id)
            const dateObj = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)
            const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()]

            // 時間帯別にイベントを分類
            // 全てのイベントでtimeSlot（朝/昼/夜）を使用、timeSlotがない場合はstart_timeから判定
            const morningEvents = events.filter(event => {
              // timeSlotが設定されている場合はそれを使用
              if (event.timeSlot) {
                return event.timeSlot === '朝'
              }
              // フォールバック：start_timeから判定
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 9 && hour < 12
            })
            const afternoonEvents = events.filter(event => {
              // timeSlotが設定されている場合はそれを使用
              if (event.timeSlot) {
                return event.timeSlot === '昼'
              }
              // フォールバック：start_timeから判定（17時を含む）
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 12 && hour <= 17
            })
            const eveningEvents = events.filter(event => {
              // timeSlotが設定されている場合はそれを使用
              if (event.timeSlot) {
                return event.timeSlot === '夜'
              }
              // フォールバック：start_timeから判定（18時以降が夜間）
              const hour = parseInt(event.start_time?.split(':')[0] || '0')
              return hour >= 18
            })

            const isFirstRowOfDate = index === 0 || listViewData[index - 1]?.date !== date
            // 同じ日付の店舗数を計算（臨時会場のフィルタリングを考慮）
            const rowSpan = listViewData.filter(item => item.date === date).length

            return (
              <React.Fragment key={`${date}-${store.id}`}>
                {/* モバイル用：日付行（全幅） */}
                {isFirstRowOfDate && (
                  <TableRow className="sm:hidden bg-muted/30">
                    <TableCell colSpan={4} className={`text-left px-2 py-1.5 text-xs ${dayOfWeek === '日' ? 'text-red-600' : dayOfWeek === '土' ? 'text-blue-600' : ''}`}>
                      {listViewMonth.getMonth() + 1}/{date} ({dayOfWeek})
                  </TableCell>
                  </TableRow>
                )}

                <TableRow className={isFirstRowOfDate && index !== 0 ? 'border-t-2 border-gray-300' : ''}>
                  {/* 日付・曜日セル（統合）- デスクトップのみ表示 */}
                {isFirstRowOfDate && (
                    <TableCell className={`hidden sm:table-cell schedule-table-cell border-r text-sm align-top w-24 ${dayOfWeek === '日' ? 'text-red-600' : dayOfWeek === '土' ? 'text-blue-600' : ''}`} rowSpan={rowSpan}>
                      <div className="flex flex-col items-center">
                        <div className="">{listViewMonth.getMonth() + 1}/{date}</div>
                        <div className="text-sm">{dayOfWeek}</div>
                      </div>
                  </TableCell>
                )}

                {/* 店舗セル */}
                  <TableCell className="schedule-table-cell border-r venue-cell hover:bg-muted/30 transition-colors text-xs sm:text-sm w-10 sm:w-16">
                    <div className="whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: getColorFromName(store.color) }}>
                    {store.short_name || store.name}
                  </div>
                </TableCell>

                {/* 朝公演セル */}
                <TableCell className="schedule-table-cell p-0">
                  <div className="flex flex-col">
                    {renderEventCell(morningEvents, store, 'morning', date, [])}
                  </div>
                </TableCell>

                {/* 昼公演セル */}
                <TableCell className="schedule-table-cell p-0">
                  <div className="flex flex-col">
                    {renderEventCell(afternoonEvents, store, 'afternoon', date, morningEvents)}
                  </div>
                </TableCell>

                {/* 夜公演セル */}
                <TableCell className="schedule-table-cell p-0">
                  <div className="flex flex-col">
                    {renderEventCell(eveningEvents, store, 'evening', date, [...morningEvents, ...afternoonEvents])}
                  </div>
                </TableCell>
              </TableRow>
              </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  )
})

