/**
 * 貸切リクエストの却下ダイアログと、却下メールのテンプレ編集。index.tsx から見た目を変えずに切り出したもの。
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Mail } from 'lucide-react'
import { TemplateEditDialog } from '@/components/settings/TemplateEditDialog'
import type { PrivateBookingRequest } from '../hooks/usePrivateBookingData'

export function RejectRequestDialog({ showRejectDialog, handleRejectCancel, openRejectTemplateEditor, resolvingRejectStore, rejectBodyLoading, rejectionReason, setRejectionReason, submitting, handleRejectConfirm, selectedRequest, rejectTemplateStoreId, rejectTemplateOrgId, rejectTemplateOpen, setRejectTemplateOpen }: {
  showRejectDialog: boolean
  handleRejectCancel: () => void
  openRejectTemplateEditor: () => void
  resolvingRejectStore: boolean
  rejectBodyLoading: boolean
  rejectionReason: string
  setRejectionReason: (v: string) => void
  submitting: boolean
  handleRejectConfirm: (request: PrivateBookingRequest | null) => void
  selectedRequest: PrivateBookingRequest | null
  rejectTemplateStoreId: string | null
  rejectTemplateOrgId: string | null
  rejectTemplateOpen: boolean
  setRejectTemplateOpen: (open: boolean) => void
}) {
  return (
    <>
    {/* 却下ダイアログ */}
    <Dialog open={showRejectDialog} onOpenChange={(open) => !open && handleRejectCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>貸切リクエストの却下</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">却下メール本文（このまま送信されます）</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-purple-700 hover:text-purple-900"
                onClick={openRejectTemplateEditor}
                disabled={resolvingRejectStore || rejectBodyLoading}
              >
                <Mail className="h-3 w-3 mr-1" />
                {resolvingRejectStore ? '読み込み中...' : '却下メールのテンプレを編集'}
              </Button>
            </div>
            {rejectBodyLoading ? (
              <div className="border rounded-md py-12 text-center text-sm text-muted-foreground">
                メール本文を読み込み中...
              </div>
            ) : (
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={14}
                placeholder="却下メールの本文"
                className="text-sm font-mono"
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">
              お客様に送られる却下メールの全文です。この場で自由に編集できます。次回以降の既定文面（テンプレート）を直すには「却下メールのテンプレを編集」から。
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleRejectCancel}
            disabled={submitting}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleRejectConfirm(selectedRequest)}
            disabled={submitting || rejectBodyLoading || !rejectionReason.trim()}
          >
            {submitting ? '処理中...' : '却下する'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 却下メール（private_rejection_template）のテンプレ編集。却下ダイアログの上に重ねて開く。
        貸切リクエストは店舗未確定が多いので、その場合は組織のメール設定を編集する */}
    <TemplateEditDialog
      templateKey="private_rejection_template"
      storeId={rejectTemplateStoreId}
      organizationId={rejectTemplateOrgId}
      open={rejectTemplateOpen}
      onOpenChange={setRejectTemplateOpen}
    />
    </>
  )
}
