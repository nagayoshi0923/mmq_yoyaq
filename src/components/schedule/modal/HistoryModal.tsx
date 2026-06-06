// 公演履歴を表示する専用モーダル
// セルの右クリックメニューや公演カードから履歴を確認できる

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EventHistoryTab } from './EventHistoryTab'
import type { CellInfo } from '@/lib/api/eventHistoryApi'
import type { Scenario, Staff as StaffType, Store } from '@/types'

interface HistoryModalProps {
  isOpen: boolean
  onClose: () => void
  cellInfo?: CellInfo       // セル情報（日付＋会場＋時間帯）
  organizationId?: string   // 組織ID
  title?: string            // モーダルのタイトル
  stores?: Store[]          // 店舗一覧（UUID→名前解決 + スナップショットモーダル用）
  scenarios?: Scenario[]    // スナップショットモーダルに渡す
  staff?: StaffType[]       // スナップショットモーダルに渡す
}

export function HistoryModal({
  isOpen,
  onClose,
  cellInfo,
  organizationId,
  title = '更新履歴',
  stores,
  scenarios,
  staff
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
            scenarios={scenarios}
            staff={staff}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

