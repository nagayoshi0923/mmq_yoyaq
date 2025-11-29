import React, { useState, useEffect, useCallback } from 'react'
import { TableCell } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileText } from 'lucide-react'

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
  const [dialogOpen, setDialogOpen] = useState(false)

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

  // PC用のハンドラー
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

  // モバイル用の保存ハンドラー（ダイアログを閉じる時）
  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      onSave?.(date, venue, memo)
    }
  }

  return (
    <TableCell className={`schedule-table-cell !p-0 !align-top h-10 sm:h-12 md:h-14 ${className || ''}`}>
      {/* PC表示 (lg以上): インライン編集 */}
      <div className="hidden lg:block w-full h-full">
        {isEditing ? (
          <Textarea
            value={memo}
            onChange={(e) => handleMemoChange(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="memo"
            className="w-full h-full text-xs lg:text-[10px] p-0.5 resize-none border-0 focus:border-0 focus:ring-0 rounded-none"
            style={{ 
              backgroundColor: '#F6F9FB',
              transition: 'background-color 0.2s ease'
            }}
            autoFocus
          />
        ) : (
          <div
            className={`w-full h-full cursor-pointer p-0.5 text-xs lg:text-[10px] whitespace-pre-wrap text-left hover:bg-gray-50 leading-tight flex items-start ${memo ? 'text-gray-700' : 'text-gray-300'}`}
            style={{ 
              backgroundColor: '#F6F9FB',
              transition: 'background-color 0.2s ease'
            }}
            onClick={handleEdit}
          >
            {memo || 'memo'}
          </div>
        )}
      </div>

      {/* モバイル/タブレット表示 (lg未満): アイコンボタン + ダイアログ */}
      <div className="lg:hidden w-full h-full flex items-center justify-center bg-gray-50/50">
        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className={`h-full w-full rounded-none hover:bg-muted/20 ${memo ? 'text-primary' : 'text-muted-foreground/30'}`}
            >
              <FileText className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>メモ編集</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Textarea
                value={memo}
                onChange={(e) => handleMemoChange(e.target.value)}
                placeholder="スケジュールに関するメモを入力してください"
                className="min-h-[150px]"
              />
            </div>
            <DialogFooter>
              <Button onClick={() => handleDialogClose(false)}>完了</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TableCell>
  )
}

// React.memoでメモ化してエクスポート
export const MemoCell = React.memo(MemoCellBase)
