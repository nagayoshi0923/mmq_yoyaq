import { memo, ReactNode, useState } from 'react'
import { logger } from '@/utils/logger'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type ConfirmDialogVariant = 'default' | 'destructive' | 'danger' | 'warning'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description?: ReactNode
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmDialogVariant
  isLoading?: boolean
  disabled?: boolean
  children?: ReactNode
}

export const ConfirmDialog = memo(function ConfirmDialog({
  open,
  onOpenChange,
  onClose,
  onConfirm,
  title,
  description,
  message,
  confirmLabel = '実行する',
  cancelLabel = 'キャンセル',
  variant = 'default',
  isLoading = false,
  disabled = false,
  children,
}: ConfirmDialogProps) {
  const [internalLoading, setInternalLoading] = useState(false)
  const loading = isLoading || internalLoading
  const confirmVariant = variant === 'destructive' || variant === 'danger' || variant === 'warning'
    ? 'destructive'
    : 'default'

  const close = () => {
    if (onOpenChange) {
      onOpenChange(false)
      return
    }
    onClose?.()
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (loading) return
    if (onOpenChange) {
      onOpenChange(nextOpen)
      return
    }
    if (!nextOpen) onClose?.()
  }

  const handleConfirm = async () => {
    setInternalLoading(true)
    try {
      await onConfirm()
      close()
    } catch (error) {
      logger.error('ConfirmDialog onConfirm failed:', error)
    } finally {
      setInternalLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm pt-1">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {(message || children) && (
          <div className="text-sm text-muted-foreground space-y-3">
            {message && <p className="whitespace-pre-wrap">{message}</p>}
            {children}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            className="text-sm"
            onClick={close}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            className="text-sm"
            onClick={handleConfirm}
            disabled={loading || disabled}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? '処理中...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
