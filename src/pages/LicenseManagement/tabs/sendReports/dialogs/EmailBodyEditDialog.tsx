/**
 * 送信済みメールの確認・編集ダイアログ（SendReports から子コンポーネント抽出・挙動不変）。
 * JSX は元 SendReports の該当ブロックを逐語移植し、クロージャ参照を props 化しただけ。
 */
import type { Dispatch, SetStateAction } from 'react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { EmailBodyEditTarget } from '../types'

interface EmailBodyEditDialogProps {
  open: boolean
  onClose: () => void
  target: EmailBodyEditTarget | null
  setTarget: Dispatch<SetStateAction<EmailBodyEditTarget | null>>
  year: number
  month: number
  isSaving: boolean
  onSave: () => void
}

export function EmailBodyEditDialog({
  open,
  onClose,
  target,
  setTarget,
  year,
  month,
  isSaving,
  onSave,
}: EmailBodyEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) { onClose() } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>送信済みメールの確認・編集</DialogTitle>
          <DialogDescription>
            {target?.authorName} 宛 {year}年{month}月分
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-sm">件名</Label>
            <Input
              value={target?.subject ?? ''}
              onChange={(e) => setTarget(prev => prev ? { ...prev, subject: e.target.value } : prev)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">本文</Label>
            <Textarea
              value={target?.emailBody ?? ''}
              onChange={(e) => setTarget(prev => prev ? { ...prev, emailBody: e.target.value } : prev)}
              className="font-mono text-xs h-96 resize-none"
              disabled={isSaving}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            キャンセル
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
