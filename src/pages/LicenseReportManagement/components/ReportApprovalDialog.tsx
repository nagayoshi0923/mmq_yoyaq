/**
 * 報告承認/却下ダイアログ
 */
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Check, X } from 'lucide-react'
import { approveExternalReport, rejectExternalReport } from '@/lib/api/externalReportsApi'
import { toast } from 'sonner'
import type { ExternalPerformanceReport } from '@/types'

interface ReportApprovalDialogProps {
  report: ExternalPerformanceReport
  action: 'approve' | 'reject'
  reviewerId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ReportApprovalDialog({
  report,
  action,
  reviewerId,
  isOpen,
  onClose,
  onSuccess,
}: ReportApprovalDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  const isApprove = action === 'approve'
  const scenarioTitle = (report.scenarios as any)?.title || '不明なシナリオ'
  const orgName = (report.organizations as any)?.name || '不明な組織'

  const handleSubmit = async () => {
    if (!isApprove && !rejectionReason.trim()) {
      toast.error('却下理由を入力してください')
      return
    }

    setIsLoading(true)
    try {
      if (isApprove) {
        await approveExternalReport(report.id, reviewerId)
        toast.success('報告を承認しました')
      } else {
        await rejectExternalReport(report.id, reviewerId, rejectionReason.trim())
        toast.success('報告を却下しました')
      }
      onSuccess()
    } catch (error) {
      console.error('Failed to process report:', error)
      toast.error(isApprove ? '承認に失敗しました' : '却下に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isApprove ? (
              <>
                <Check className="w-5 h-5 text-green-600" />
                報告を承認
              </>
            ) : (
              <>
                <X className="w-5 h-5 text-red-600" />
                報告を却下
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            以下の報告を{isApprove ? '承認' : '却下'}しますか？
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 報告内容の確認 */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">シナリオ:</span>
              <span className="ml-2 font-medium">{scenarioTitle}</span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">報告元:</span>
              <span className="ml-2">{orgName}</span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">公演日:</span>
              <span className="ml-2">{report.performance_date}</span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">公演回数:</span>
              <span className="ml-2">{report.performance_count}回</span>
            </div>
            {report.participant_count && (
              <div>
                <span className="text-sm text-muted-foreground">参加者数:</span>
                <span className="ml-2">{report.participant_count}名</span>
              </div>
            )}
          </div>

          {/* 却下理由（却下時のみ） */}
          {!isApprove && (
            <div className="space-y-2">
              <Label htmlFor="rejection_reason">却下理由 *</Label>
              <Textarea
                id="rejection_reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="却下の理由を入力してください"
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            キャンセル
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            variant={isApprove ? 'default' : 'destructive'}
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isApprove ? '承認する' : '却下する'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

