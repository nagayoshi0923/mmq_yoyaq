import { BaseModal } from './BaseModal'
import { Button } from '@/components/ui/button'
import { memo } from 'react'

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger' | 'warning'
}

/**
 * ConfirmModal - 確認ダイアログ
 * 
 * @example
 * ```tsx
 * <ConfirmModal
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onConfirm={handleDelete}
 *   title="削除確認"
 *   message="本当に削除しますか？この操作は取り消せません。"
 *   variant="danger"
 *   confirmLabel="削除する"
 * />
 * ```
 */
export const ConfirmModal = memo(function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  message,
  confirmLabel = '確認',
  cancelLabel = 'キャンセル',
  variant = 'default'
}: ConfirmModalProps) {
  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      variant={variant}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            onClick={() => {
              onConfirm()
              onClose()
            }}
            variant={variant === 'danger' || variant === 'warning' ? 'destructive' : 'default'}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm">{message}</p>
    </BaseModal>
  )
})

