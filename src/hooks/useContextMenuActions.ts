// 右クリックメニューとコピー&ペースト操作を管理

import { useState, useCallback } from 'react'
import { scheduleApi } from '@/lib/api'
import { getTimeSlot } from '@/utils/scheduleUtils'
import { useOrganization } from '@/hooks/useOrganization'
import { useTimeSlotSettings } from '@/hooks/useTimeSlotSettings'
import type { ScheduleEvent } from '@/types/schedule'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

/**
 * time_slot（'朝'/'昼'/'夜'）を英語形式に変換
 */
function convertTimeSlot(timeSlot: string | undefined | null): 'morning' | 'afternoon' | 'evening' | null {
  if (!timeSlot) return null
  switch (timeSlot) {
    case '朝': return 'morning'
    case '昼': return 'afternoon'
    case '夜': return 'evening'
    default: return null
  }
}

/**
 * イベントの時間帯を取得（保存された枠を優先）
 */
function getEventTimeSlot(event: ScheduleEvent): 'morning' | 'afternoon' | 'evening' {
  const savedSlot = convertTimeSlot(event.time_slot)
  if (savedSlot) return savedSlot
  return getTimeSlot(event.start_time)
}

interface Store {
  id: string
  name: string
  short_name: string
}

interface UseContextMenuActionsProps {
  events: ScheduleEvent[]
  stores: Store[]
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
}

export function useContextMenuActions({ events, stores, setEvents }: UseContextMenuActionsProps) {
  // 組織IDを取得（マルチテナント対応）
  const { organizationId } = useOrganization()
  
  // 公演時間帯設定を取得（組織設定から）
  const { getSlotDefaults } = useTimeSlotSettings()
  
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

  // 🚨 CRITICAL: 重複チェック関数（ペースト用）
  const checkConflict = useCallback((date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening'): ScheduleEvent | null => {
    const conflictingEvents = events.filter(event => {
      const eventTimeSlot = getTimeSlot(event.start_time)
      return event.date === date &&
             event.venue === venue &&
             eventTimeSlot === timeSlot &&
             !event.is_cancelled
    })
    
    return conflictingEvents.length > 0 ? conflictingEvents[0] : null
  }, [events])

  // クリップボードから公演をペースト
  const handlePasteFromClipboard = useCallback(async (targetDate: string, targetVenue: string, targetTimeSlot: 'morning' | 'afternoon' | 'evening') => {
    if (!clipboardEvent) return

    setContextMenu(null)

    try {
      // 🚨 CRITICAL: ペースト先の重複チェック
      const conflict = checkConflict(targetDate, targetVenue, targetTimeSlot)
      if (conflict) {
        const timeSlotLabel = targetTimeSlot === 'morning' ? '午前' : targetTimeSlot === 'afternoon' ? '午後' : '夜間'
        const storeName = stores.find(s => s.id === targetVenue)?.name || targetVenue
        
        if (!confirm(
          `ペースト先の${targetDate} ${storeName} ${timeSlotLabel}には既に「${conflict.scenario}」の公演があります。\n` +
          `既存の公演を削除してペーストしますか？`
        )) {
          return
        }
        
        // 既存公演を削除
        await scheduleApi.delete(conflict.id)
        setEvents(prev => prev.filter(e => e.id !== conflict.id))
      }

      // 元の公演の時間帯を取得
      const sourceTimeSlot = getEventTimeSlot(clipboardEvent)
      
      // ペースト先の時間を計算（組織設定から取得）
      const defaults = getSlotDefaults(targetDate, targetTimeSlot)
      
      // 時間帯が同じなら元の時間を保持、違うならデフォルト時間を使用
      const isSameTimeSlot = sourceTimeSlot === targetTimeSlot
      const startTime = isSameTimeSlot ? clipboardEvent.start_time : defaults.start_time
      const endTime = isSameTimeSlot ? clipboardEvent.end_time : defaults.end_time

      // 新しい位置に公演を作成（元の公演は残す）
      // organization_idが取得できない場合はエラー
      if (!organizationId) {
        throw new Error('組織情報が取得できません。再ログインしてください。')
      }
      
      // 時間帯ラベルをペースト先に更新
      const timeSlotLabel = targetTimeSlot === 'morning' ? '朝' : targetTimeSlot === 'afternoon' ? '昼' : '夜'
      
      const newEventData = {
        date: targetDate,
        store_id: targetVenue,
        venue: stores.find(s => s.id === targetVenue)?.name || '',
        scenario: clipboardEvent.scenario,
        category: clipboardEvent.category,
        start_time: startTime,
        end_time: endTime,
        time_slot: timeSlotLabel, // ペースト先の時間帯に更新
        capacity: clipboardEvent.max_participants,
        gms: clipboardEvent.gms,
        gm_roles: clipboardEvent.gm_roles, // GMの役割情報を保持
        notes: clipboardEvent.notes,
        organization_id: organizationId, // マルチテナント対応
        // 状態フィールドを保持
        is_tentative: clipboardEvent.is_tentative || false,
        is_reservation_enabled: clipboardEvent.is_reservation_enabled || false,
        venue_rental_fee: clipboardEvent.venue_rental_fee,
        // 予約関連フィールドを保持
        reservation_name: clipboardEvent.reservation_name || null,
        is_reservation_name_overwritten: clipboardEvent.is_reservation_name_overwritten || false,
        is_private_request: clipboardEvent.is_private_request || false,
        // ペースト時はreservation_idはクリア（別の公演として扱う）
        reservation_id: null
      }

      const savedEvent = await scheduleApi.create(newEventData)

      // ローカル状態を更新
      const newEvent: ScheduleEvent = {
        ...savedEvent,
        venue: targetVenue,
        // 状態フィールドを保持
        is_tentative: clipboardEvent.is_tentative,
        is_reservation_enabled: clipboardEvent.is_reservation_enabled,
        // 予約関連フィールドを保持
        reservation_name: clipboardEvent.reservation_name,
        is_reservation_name_overwritten: clipboardEvent.is_reservation_name_overwritten,
        is_private_request: clipboardEvent.is_private_request
      }
      setEvents(prev => [...prev, newEvent])

      logger.log('公演をペーストしました')
    } catch (error) {
      logger.error('公演ペーストエラー:', error)
      showToast.error('公演のペーストに失敗しました')
    }
  }, [clipboardEvent, stores, setEvents, checkConflict, organizationId, getSlotDefaults])

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

