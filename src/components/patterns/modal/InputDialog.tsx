import { memo, ReactNode, useEffect, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type InputDialogVariant = 'default' | 'destructive'

interface InputDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  placeholder?: string
  defaultValue?: string
  multiline?: boolean
  required?: boolean
  confirmLabel?: string
  cancelLabel?: string
  variant?: InputDialogVariant
  onConfirm: (value: string) => void | Promise<void>
}

export const InputDialog = memo(function InputDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  defaultValue = '',
  multiline = false,
  required = false,
  confirmLabel = '実行する',
  cancelLabel = 'キャンセル',
  variant = 'default',
  onConfirm,
}: InputDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const [loading, setLoading] = useState(false)
  const confirmVariant = variant === 'destructive' ? 'destructive' : 'default'

  useEffect(() => {
    if (open) {
      setValue(defaultValue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open時のみリセット
  }, [open])

  const close = () => {
    onOpenChange(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (loading) return
    onOpenChange(nextOpen)
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm(value)
      close()
    } catch (error) {
      console.error('InputDialog onConfirm failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    if (e.nativeEvent.isComposing) return
    if (loading || (required && !value.trim())) return
    e.preventDefault()
    handleConfirm()
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

        <div>
          {multiline ? (
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              disabled={loading}
              autoFocus
            />
          ) : (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={loading}
              autoFocus
            />
          )}
        </div>

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
            disabled={loading || (required && !value.trim())}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? '処理中...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
