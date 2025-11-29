import React, { useState, useEffect, useCallback } from 'react'
import { TableCell } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

interface MemoCellProps {
  date: string
  venue: string
  initialMemo?: string
  onSave?: (date: string, venue: string, memo: string) => void
  className?: string
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

function MemoCellBase({ date, venue, initialMemo = '', onSave, className }: MemoCellProps) {
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
    <TableCell className={`schedule-table-cell !p-0 !align-top h-10 sm:h-12 md:h-14 ${className || ''}`}>
      {isEditing ? (
        <Textarea
          value={memo}
          onChange={(e) => handleMemoChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="memo"
          className="w-full h-full text-[12px] p-0.5 resize-none border-0 focus:border-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none placeholder:text-muted-foreground/50"
          style={{ 
            backgroundColor: '#F6F9FB',
            transition: 'background-color 0.2s ease'
          }}
          autoFocus
        />
      ) : (
        <div
          className={`w-full h-full cursor-pointer p-0.5 text-[12px] whitespace-pre-wrap text-left hover:bg-gray-50 leading-tight flex items-start ${memo ? 'text-gray-700' : 'text-gray-300'}`}
          style={{ 
            backgroundColor: '#F6F9FB',
            transition: 'background-color 0.2s ease'
          }}
          onClick={handleEdit}
        >
          {memo || 'memo'}
        </div>
      )}
    </TableCell>
  )
}

// React.memoでメモ化してエクスポート
export const MemoCell = React.memo(MemoCellBase)
