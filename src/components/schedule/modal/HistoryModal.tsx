// 公演履歴を表示する専用モーダル
// セルの右クリックメニューや公演カードから履歴を確認できる

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EventHistoryTab } from './EventHistoryTab'
import type { CellInfo } from '@/lib/api/eventHistoryApi'

interface HistoryModalProps {
  isOpen: boolean
  onClose: () => void
  cellInfo?: CellInfo       // セル情報（日付＋会場＋時間帯）
  organizationId?: string   // 組織ID
  title?: string            // モーダルのタイトル
  stores?: Array<{ id: string; name: string }>  // 店舗一覧（UUID→名前解決用）
}

export function HistoryModal({
  isOpen,
  onClose,
  cellInfo,
  organizationId,
  title = '更新履歴',
  stores
}: HistoryModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <EventHistoryTab
            cellInfo={cellInfo}
            organizationId={organizationId}
            stores={stores}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

