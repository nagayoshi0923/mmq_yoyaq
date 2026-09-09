import type { Dispatch, SetStateAction } from 'react'
import type { ScheduleEvent } from '@/types/schedule'

interface PerformanceFooterProps {
  readOnly: boolean
  mode: 'add' | 'edit'
  onDeleteEvent?: (event: ScheduleEvent) => Promise<void>
  setDeleteConfirming: Dispatch<SetStateAction<boolean>>
  onClose: () => void
  handleSave: () => Promise<void>
  /** initForm の非同期初期化が完了するまで true。完了前は保存ボタンを無効化する（B7） */
  isFormInitializing: boolean
}

/** フッターアクションボタン（削除/キャンセル/保存）。シェル側 footer 内に配置 */
export function PerformanceFooter({
  readOnly,
  mode,
  onDeleteEvent,
  setDeleteConfirming,
  onClose,
  handleSave,
  isFormInitializing,
}: PerformanceFooterProps) {
  return (
    <div className="scenario-edit-dialog__actions">
      {!readOnly && mode === 'edit' && onDeleteEvent && (
        <button
          type="button"
          className="scenario-edit-dialog__btn"
          onClick={() => setDeleteConfirming(true)}
          style={{ color: '#b91c1c', borderColor: '#fecaca' }}
        >
          この予定を削除
        </button>
      )}
      <button type="button" className="scenario-edit-dialog__btn" onClick={onClose}>
        {readOnly ? '閉じる' : 'キャンセル'}
      </button>
      {!readOnly && (
        <button
          type="button"
          className="scenario-edit-dialog__btn-primary"
          onClick={() => { void handleSave() }}
          disabled={isFormInitializing}
        >
          {mode === 'add' ? '追加' : '保存'}
        </button>
      )}
    </div>
  )
}
