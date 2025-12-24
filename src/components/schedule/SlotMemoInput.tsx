/**
 * スロットメモ入力コンポーネント
 * 空スロット：localStorageに一時保存
 * 公演ありスロット：schedule_events.notesと同期
 */
import React, { useState, useEffect, useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'

// localStorageのキー生成
function getSlotMemoKey(date: string, storeId: string, timeSlot: string): string {
  return `slot-memo-${date}-${storeId}-${timeSlot}`
}

// 空スロット用のメモを取得
export function getEmptySlotMemo(date: string, storeId: string, timeSlot: string): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(getSlotMemoKey(date, storeId, timeSlot)) || ''
}

// 空スロット用のメモを保存
export function saveEmptySlotMemo(date: string, storeId: string, timeSlot: string, memo: string): void {
  if (typeof window === 'undefined') return
  const key = getSlotMemoKey(date, storeId, timeSlot)
  if (memo.trim()) {
    localStorage.setItem(key, memo)
  } else {
    localStorage.removeItem(key)
  }
}

// 空スロット用のメモを削除（公演作成時に呼び出す）
export function clearEmptySlotMemo(date: string, storeId: string, timeSlot: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(getSlotMemoKey(date, storeId, timeSlot))
}

interface SlotMemoInputProps {
  date: string
  storeId: string
  timeSlot: 'morning' | 'afternoon' | 'evening'
  // 公演がある場合はnotesを渡す（DBと同期）
  eventNotes?: string
  eventId?: string
  onNotesChange?: (eventId: string, notes: string) => Promise<void>
}

export function SlotMemoInput({
  date,
  storeId,
  timeSlot,
  eventNotes,
  eventId,
  onNotesChange
}: SlotMemoInputProps) {
  const hasEvent = !!eventId
  
  // 空スロットの場合はlocalStorageから、公演ありの場合はeventNotesを使用
  const [memo, setMemo] = useState(() => {
    if (hasEvent) {
      return eventNotes || ''
    }
    return getEmptySlotMemo(date, storeId, timeSlot)
  })
  
  const [isSaving, setIsSaving] = useState(false)

  // eventNotesが変わったら同期
  useEffect(() => {
    if (hasEvent) {
      setMemo(eventNotes || '')
    }
  }, [hasEvent, eventNotes])

  // デバウンス保存
  const debouncedSave = useCallback(
    (() => {
      let timer: NodeJS.Timeout
      return (newMemo: string) => {
        clearTimeout(timer)
        timer = setTimeout(async () => {
          if (hasEvent && eventId && onNotesChange) {
            setIsSaving(true)
            try {
              await onNotesChange(eventId, newMemo)
            } finally {
              setIsSaving(false)
            }
          } else {
            // 空スロットの場合はlocalStorageに保存
            saveEmptySlotMemo(date, storeId, timeSlot, newMemo)
          }
        }, 500)
      }
    })(),
    [hasEvent, eventId, onNotesChange, date, storeId, timeSlot]
  )

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMemo = e.target.value
    setMemo(newMemo)
    debouncedSave(newMemo)
  }

  return (
    <Textarea
      value={memo}
      onChange={handleChange}
      placeholder="memo"
      className="w-full h-8 min-h-[32px] max-h-[48px] text-[10px] sm:text-[11px] p-1 resize-none border-0 bg-transparent focus:bg-gray-50 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none placeholder:text-muted-foreground/40"
      style={{ lineHeight: '1.3' }}
    />
  )
}

