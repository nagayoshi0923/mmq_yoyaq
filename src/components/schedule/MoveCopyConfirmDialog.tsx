import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import type { MoveCopyConfirm } from '@/hooks/eventOperations/useEventMoveCopy'

interface MoveCopyConfirmDialogProps {
  /** 表示する確認内容。null のとき非表示 */
  prompt: MoveCopyConfirm | null
  /** ユーザーの決定（true=実行 / false=やめる）を移動・複製フローへ返す */
  onResolve: (ok: boolean) => void
}

/**
 * 公演の移動・複製時の重複/間隔不足の確認ダイアログ。
 * ブラウザ標準の window.confirm を置き換え、アプリ内の styled ダイアログに統一する。
 */
export function MoveCopyConfirmDialog({ prompt, onResolve }: MoveCopyConfirmDialogProps) {
  const isDestructive = prompt?.variant === 'destructive'
  return (
    <Dialog open={!!prompt} onOpenChange={(open) => !open && onResolve(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={isDestructive ? 'h-5 w-5 text-red-600' : 'h-5 w-5 text-yellow-500'} />
            {prompt?.title}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap pt-1 text-gray-700">
            {prompt?.message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onResolve(false)}>
            キャンセル
          </Button>
          <Button
            variant={isDestructive ? 'destructive' : 'default'}
            className={isDestructive ? 'bg-red-600 hover:bg-red-700' : undefined}
            onClick={() => onResolve(true)}
          >
            {prompt?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
