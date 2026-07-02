import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import type { EventFormData, ScheduleEvent } from '@/types/schedule'

interface PerformanceFooterProps {
  CATEGORY_TONE: Record<string, { bg: string; section: string; border: string }>
  formData: EventFormData
  readOnly: boolean
  mode: 'add' | 'edit'
  onDeleteEvent?: (event: ScheduleEvent) => Promise<void>
  setDeleteConfirming: Dispatch<SetStateAction<boolean>>
  onClose: () => void
  handleSave: () => Promise<void>
  /** initForm の非同期初期化が完了するまで true。完了前は保存ボタンを無効化する（B7） */
  isFormInitializing: boolean
}

/** フッターアクションボタン（削除/キャンセル/保存）。PerformanceModal から逐語抽出（presentational・挙動不変） */
export function PerformanceFooter({
  CATEGORY_TONE,
  formData,
  readOnly,
  mode,
  onDeleteEvent,
  setDeleteConfirming,
  onClose,
  handleSave,
  isFormInitializing,
}: PerformanceFooterProps) {
  return (
        <div
          className="flex items-center justify-end gap-1.5 p-1.5 sm:p-2 border-t shrink-0"
          style={CATEGORY_TONE[formData.category]
            ? { backgroundColor: CATEGORY_TONE[formData.category].bg, borderTopColor: CATEGORY_TONE[formData.category].border }
            : undefined}
        >
          <div className="flex gap-1.5 shrink-0 w-full sm:w-auto justify-end">
            {!readOnly && mode === 'edit' && onDeleteEvent && (
              <Button
                variant="outline"
                onClick={() => setDeleteConfirming(true)}
                className="min-w-[60px] sm:min-w-[80px] text-[11px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground mr-auto"
              >
                この予定を削除
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className="min-w-[60px] sm:min-w-[80px] text-[11px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
              {readOnly ? '閉じる' : 'キャンセル'}
            </Button>
            {!readOnly && (
              <Button onClick={handleSave} disabled={isFormInitializing} className="min-w-[60px] sm:min-w-[80px] text-[11px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
                {mode === 'add' ? '追加' : '保存'}
              </Button>
            )}
          </div>
        </div>
  )
}
