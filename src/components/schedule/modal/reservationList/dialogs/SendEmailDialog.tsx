/**
 * 選択した予約者への一括メール送信モーダル（ReservationList から子コンポーネント抽出・挙動不変）。
 * JSX は元 ReservationList の該当ブロックを逐語移植し、送信処理は親 onSend へ持ち上げ。
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface SendEmailRecipient {
  id: string
  customer_notes?: string | null
  customer_id?: string | null
}

interface SendEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipientCount: number
  recipients: SendEmailRecipient[]
  subject: string
  setSubject: (value: string) => void
  body: string
  setBody: (value: string) => void
  sending: boolean
  onClose: () => void
  onSend: () => void
}

export function SendEmailDialog({
  open,
  onOpenChange,
  recipientCount,
  recipients,
  subject,
  setSubject,
  body,
  setBody,
  sending,
  onClose,
  onSend,
}: SendEmailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>メール送信</DialogTitle>
          <DialogDescription>
            選択した{recipientCount}件の予約者にメールを送信します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="email-subject">件名</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="例: 公演のご案内"
            />
          </div>

          <div>
            <Label htmlFor="email-body">本文</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="メール本文を入力してください..."
              rows={10}
            />
          </div>

          <div className="text-xs text-muted-foreground">
            <p className="font-medium mb-1">送信先:</p>
            <ul className="list-disc list-inside space-y-1">
              {recipients.map(r => (
                <li key={r.id}>
                  {r.customer_notes || '顧客名なし'} ({r.customer_id})
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={sending}
            >
              キャンセル
            </Button>
            <Button
              onClick={onSend}
              disabled={sending || recipientCount === 0}
            >
              {sending ? '送信中...' : `送信 (${recipientCount}件)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
