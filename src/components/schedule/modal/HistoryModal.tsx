// 公演履歴を表示する専用モーダル
// セルの右クリックメニューや公演カードから履歴を確認できる

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EventHistoryTab } from './EventHistoryTab'
import type { CellInfo } from '@/lib/api/eventHistoryApi'

interface HistoryModalProps {
  isOpen: boolean
  onClose: () => void
  eventId?: string          // 公演ID（既存公演の場合）
  cellInfo?: CellInfo       // セル情報（削除された公演の履歴を見る場合）
  organizationId?: string   // 組織ID
  title?: string            // モーダルのタイトル
}

export function HistoryModal({ 
  isOpen, 
  onClose, 
  eventId,
  cellInfo,
  organizationId,
  title = '更新履歴'
}: HistoryModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <EventHistoryTab 
            eventId={eventId}
            cellInfo={cellInfo}
            organizationId={organizationId}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

