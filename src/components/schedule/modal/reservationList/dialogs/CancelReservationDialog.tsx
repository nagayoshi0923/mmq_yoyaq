/**
 * 予約キャンセル確認ダイアログ（ReservationList から子コンポーネント抽出・挙動不変）。
 * JSX は元 ReservationList の該当ブロックを逐語移植し、クロージャ参照を props 化しただけ。
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Reservation, Customer } from '@/types'

interface CancelReservationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reservation: Reservation | null
  onClose: () => void
  isCancelling: boolean
  onConfirm: () => void
}

export function CancelReservationDialog({
  open,
  onOpenChange,
  reservation,
  onClose,
  isCancelling,
  onConfirm,
}: CancelReservationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>予約をキャンセルしますか？</DialogTitle>
          <DialogDescription>
            キャンセル確認メールが送信されます。
          </DialogDescription>
        </DialogHeader>
        {reservation && (
          <div className="space-y-2 py-4">
            <div className="text-sm">
              <span className="font-medium">予約者:</span>{' '}
              {reservation.customer_name ||
                (reservation.customers ?
                  (Array.isArray(reservation.customers) ? reservation.customers[0]?.name : (reservation.customers as Customer)?.name) :
                  '顧客名なし')}
            </div>
            <div className="text-sm">
              <span className="font-medium">参加者数:</span> {reservation.participant_count}名
            </div>
            <div className="text-sm">
              <span className="font-medium">予約番号:</span> {reservation.reservation_number || 'なし'}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isCancelling}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isCancelling}
          >
            {isCancelling ? '処理中...' : 'キャンセル確定'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
