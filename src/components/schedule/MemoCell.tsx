import React, { useState, useEffect, useCallback } from 'react'
import { TableCell } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

interface MemoCellProps {
  date: string
  venue: string
  initialMemo?: string
  onSave?: (date: string, venue: string, memo: string) => void
}

// デバウンス用のカスタムフック
function useDebounce(callback: Function, delay: number) {
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)

  const debouncedCallback = useCallback((...args: Parameters<typeof callback>) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    const newTimer = setTimeout(() => {
      callback(...args)
    }, delay)
    setDebounceTimer(newTimer)
  }, [callback, delay, debounceTimer])

  return debouncedCallback
}

function MemoCellBase({ date, venue, initialMemo = '', onSave }: MemoCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [memo, setMemo] = useState(initialMemo)

  useEffect(() => {
    setMemo(initialMemo)
  }, [initialMemo])

  // 自動保存（1秒後にデバウンス）
  const debouncedSave = useDebounce((newMemo: string) => {
    onSave?.(date, venue, newMemo)
  }, 1000)

  const handleMemoChange = (newMemo: string) => {
    setMemo(newMemo)
    debouncedSave(newMemo)
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleBlur = () => {
    setIsEditing(false)
    // フォーカスが外れた時も即座に保存
    onSave?.(date, venue, memo)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false)
      // エスケープキーで編集をキャンセル
      setMemo(initialMemo)
    }
  }

  return (
    <TableCell className="schedule-table-cell p-0.5 align-top">
      {isEditing ? (
        <Textarea
          value={memo}
          onChange={(e) => handleMemoChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder=""
          className="w-full text-[9px] sm:text-xs md:text-xs p-0.5 resize-none border-gray-200 focus:border-gray-300 focus:ring-0"
          style={{ 
            minHeight: '40px', 
            height: '40px',
            backgroundColor: '#F6F9FB',
            transition: 'background-color 0.2s ease'
          }}
          autoFocus
        />
      ) : (
        <div
          className="w-full cursor-pointer rounded border border-input p-0.5 text-[9px] sm:text-xs md:text-xs text-gray-700 whitespace-pre-wrap text-left hover:bg-gray-50 leading-tight"
          style={{ 
            backgroundColor: '#F6F9FB', 
            minHeight: '40px',
            transition: 'background-color 0.2s ease'
          }}
          onClick={handleEdit}
        >
          {memo || ''}
        </div>
      )}
    </TableCell>
  )
}

// React.memoでメモ化してエクスポート
export const MemoCell = React.memo(MemoCellBase)
