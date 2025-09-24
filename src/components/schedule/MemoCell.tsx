import React, { useState, useEffect, useCallback } from 'react'
import { TableCell } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Edit3 } from 'lucide-react'

interface MemoCellProps {
  date: string
  venue: string
  initialMemo?: string
  onSave?: (date: string, venue: string, memo: string) => void
}

// デバウンス用のカスタムフック
function useDebounce(callback: Function, delay: number) {
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)

  const debouncedCallback = useCallback((...args: any[]) => {
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

export function MemoCell({ date, venue, initialMemo = '', onSave }: MemoCellProps) {
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

  return (
    <TableCell className="schedule-table-cell p-2 align-top">
      <div
        className="min-h-[60px] p-2 cursor-pointer rounded-md"
        style={{ backgroundColor: '#F6F9FB' }}
        onClick={handleEdit}
      >
        {isEditing ? (
              <Textarea
                value={memo}
                onChange={(e) => handleMemoChange(e.target.value)}
                onBlur={handleBlur}
                placeholder=""
                className="w-full text-xs resize-none border-0 p-0 text-left"
                style={{ 
                  backgroundColor: '#F6F9FB',
                  height: '44px',
                  minHeight: '44px',
                  maxHeight: '44px',
                  lineHeight: '1.2',
                  textAlign: 'left'
                }}
                autoFocus
              />
        ) : (
          <div className="text-xs text-gray-700 whitespace-pre-wrap text-left" style={{ minHeight: '44px' }}>
            {memo}
          </div>
        )}
      </div>
    </TableCell>
  )
}
