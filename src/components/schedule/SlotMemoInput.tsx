/**
 * スロットメモ入力コンポーネント
 * 空スロット：localStorageに一時保存
 * 公演追加時に備考として引き継がれる
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
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
}

export function SlotMemoInput({
  date,
  storeId,
  timeSlot
}: SlotMemoInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  
  // localStorageからメモを取得
  const [memo, setMemo] = useState(() => {
    return getEmptySlotMemo(date, storeId, timeSlot)
  })

  // テキストエリアの高さを自動調整
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    // 一旦最小高さにリセット
    textarea.style.height = '18px'
    // スクロール高さに合わせて調整
    const scrollHeight = textarea.scrollHeight
    textarea.style.height = `${Math.min(scrollHeight, 54)}px` // 最大54px（約3行）
  }, [])

  // 編集モードになったら高さ調整
  useEffect(() => {
    if (isEditing) {
      adjustHeight()
    }
  }, [isEditing, memo, adjustHeight])

  // デバウンス保存
  const debouncedSave = useCallback(
    (newMemo: string) => {
      const timer = setTimeout(() => {
        saveEmptySlotMemo(date, storeId, timeSlot, newMemo)
      }, 500)
      return () => clearTimeout(timer)
    },
    [date, storeId, timeSlot]
  )

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMemo = e.target.value
    setMemo(newMemo)
    debouncedSave(newMemo)
    adjustHeight()
  }

  const handleBlur = () => {
    setIsEditing(false)
    // フォーカスが外れた時も保存
    saveEmptySlotMemo(date, storeId, timeSlot, memo)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <Textarea
        ref={textareaRef}
        value={memo}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="memo"
        className="w-full text-[11px] p-0.5 resize-none border-0 focus:border-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none placeholder:text-muted-foreground/50"
        style={{ 
          backgroundColor: '#F6F9FB',
          lineHeight: '1.3',
          height: '18px',
          minHeight: '18px'
        }}
        autoFocus
      />
    )
  }

  return (
    <div
      className={`w-full cursor-pointer p-0.5 text-[11px] whitespace-pre-wrap text-left hover:bg-gray-100 leading-tight ${memo ? 'text-gray-700' : 'text-gray-300'}`}
      style={{ 
        backgroundColor: '#F6F9FB',
        minHeight: '18px'
      }}
      onClick={() => setIsEditing(true)}
    >
      {memo || 'memo'}
    </div>
  )
}

