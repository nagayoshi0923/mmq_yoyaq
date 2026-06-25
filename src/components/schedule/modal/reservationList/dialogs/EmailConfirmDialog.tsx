/**
 * 予約キャンセル時のメール送信確認ダイアログ（ReservationList から子コンポーネント抽出・挙動不変）。
 * JSX は元 ReservationList の該当ブロックを逐語移植し、クロージャ参照を props 化。
 * 閉じる時の emailContent リセットは親の onClose に持ち上げ。
 */
import type { Dispatch, SetStateAction } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { TemplateEditButton } from '@/components/settings/TemplateEditButton'
import { buildCancellationEmailBody } from '@/lib/cancellationEmail'
import type { ReservationCancellationEmailState } from '../cancellationEmailState'

interface EmailConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  emailContent: ReservationCancellationEmailState
  setEmailContent: Dispatch<SetStateAction<ReservationCancellationEmailState>>
  shouldSendEmail: boolean
  setShouldSendEmail: (value: boolean) => void
  isCancelling: boolean
  cancellationTemplateStoreId: string | null | undefined
  onClose: () => void
  onConfirm: () => void
}

export function EmailConfirmDialog({
  open,
  onOpenChange,
  emailContent,
  setEmailContent,
  shouldSendEmail,
  setShouldSendEmail,
  isCancelling,
  cancellationTemplateStoreId,
  onClose,
  onConfirm,
}: EmailConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>予約をキャンセル</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* 送信先 */}
          <div className="text-sm">
            <span className="text-muted-foreground">送信先: </span>
            <span className="font-medium">{emailContent.customerEmail}</span>
          </div>

          {/* メール本文 */}
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="email-body">メール本文</Label>
              <TemplateEditButton
                templateKey="store_cancellation_template"
                storeId={cancellationTemplateStoreId}
                label="予約者タブキャンセルメールのテンプレを編集"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                unavailableMessage="店舗が未選択のためテンプレートを編集できません"
                onSaved={(value) => {
                  setEmailContent(prev => ({
                    ...prev,
                    emailBody: buildCancellationEmailBody(prev, value)
                  }))
                }}
              />
            </div>
            <Textarea
              id="email-body"
              value={emailContent.emailBody}
              onChange={(e) => setEmailContent(prev => ({ ...prev, emailBody: e.target.value }))}
              className="mt-1 font-mono text-xs"
              rows={16}
            />
          </div>
        </div>
        <div className="flex flex-col gap-4 pt-4 border-t flex-shrink-0">
          {/* メール送信チェックボックス */}
          {emailContent.customerEmail && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="send-cancel-email"
                checked={shouldSendEmail}
                onCheckedChange={(checked) => setShouldSendEmail(!!checked)}
              />
              <label
                htmlFor="send-cancel-email"
                className="text-sm font-medium cursor-pointer"
              >
                キャンセル確認メールを送信する
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isCancelling}
            >
              やめる
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={isCancelling}
            >
              {isCancelling ? '処理中...' : 'キャンセル確定'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
