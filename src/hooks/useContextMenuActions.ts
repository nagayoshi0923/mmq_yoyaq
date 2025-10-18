// 右クリックメニューとコピー&ペースト操作を管理

import { useState, useCallback } from 'react'
import { scheduleApi } from '@/lib/api'
import { TIME_SLOT_DEFAULTS } from '@/utils/scheduleUtils'
import type { ScheduleEvent } from '@/types/schedule'
import { logger } from '@/utils/logger'

interface Store {
  id: string
  name: string
  short_name: string
}

interface UseContextMenuActionsProps {
  stores: Store[]
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
}

export function useContextMenuActions({ stores, setEvents }: UseContextMenuActionsProps) {
  // コンテキストメニュー状態
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    type: 'event' | 'cell'
    event?: ScheduleEvent
    cellInfo?: { date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening' }
  } | null>(null)
  
  // クリップボード状態
  const [clipboardEvent, setClipboardEvent] = useState<ScheduleEvent | null>(null)

  // 公演カードの右クリックメニューを表示
  const handleEventContextMenu = useCallback((event: ScheduleEvent, x: number, y: number) => {
    setContextMenu({ x, y, type: 'event', event })
  }, [])

  // セルの右クリックメニューを表示
  const handleCellContextMenu = useCallback((date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening', x: number, y: number) => {
    setContextMenu({ x, y, type: 'cell', cellInfo: { date, venue, timeSlot } })
  }, [])

  // 公演をコピー（クリップボードに保存）
  const handleCopyToClipboard = useCallback((event: ScheduleEvent) => {
    setClipboardEvent(event)
    setContextMenu(null)
  }, [])

  // クリップボードから公演をペースト
  const handlePasteFromClipboard = useCallback(async (targetDate: string, targetVenue: string, targetTimeSlot: 'morning' | 'afternoon' | 'evening') => {
    if (!clipboardEvent) return

    setContextMenu(null)

    try {
      // 移動先の時間を計算
      const defaults = TIME_SLOT_DEFAULTS[targetTimeSlot]

      // 新しい位置に公演を作成（元の公演は残す）
      const newEventData = {
        date: targetDate,
        store_id: targetVenue,
        venue: stores.find(s => s.id === targetVenue)?.name || '',
        scenario: clipboardEvent.scenario,
        category: clipboardEvent.category,
        start_time: defaults.start_time,
        end_time: defaults.end_time,
        capacity: clipboardEvent.max_participants,
        gms: clipboardEvent.gms,
        notes: clipboardEvent.notes
      }

      const savedEvent = await scheduleApi.create(newEventData)

      // ローカル状態を更新
      setEvents(prev => [...prev, { ...savedEvent, venue: targetVenue }])

      logger.log('公演をペーストしました')
    } catch (error) {
      logger.error('公演ペーストエラー:', error)
      alert('公演のペーストに失敗しました')
    }
  }, [clipboardEvent, stores, setEvents])

  return {
    contextMenu,
    clipboardEvent,
    setContextMenu,
    handleEventContextMenu,
    handleCellContextMenu,
    handleCopyToClipboard,
    handlePasteFromClipboard
  }
}

