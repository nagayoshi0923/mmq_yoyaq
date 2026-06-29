import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface ConflictingEvent {
  scenario: string
  gms: string[]
  start_time: string
  end_time: string
}

interface ConflictWarningModalProps {
  isOpen: boolean
  onClose: () => void
  onContinue: () => void
  conflictInfo: {
    date: string
    storeName: string
    /** 重なりの種類: overlap=時間が完全に重複 / interval=前後の間隔が短い（既定は interval 扱い） */
    kind?: 'overlap' | 'interval'
    /** 該当公演の時間帯＋理由（例: "13:00〜15:00（間隔不足（次の公演の前に60分必要））"） */
    timeSlot: string
    conflictingEvent: ConflictingEvent
  } | null
}

export function ConflictWarningModal({
  isOpen,
  onClose,
  onContinue,
  conflictInfo
}: ConflictWarningModalProps) {
  if (!conflictInfo) return null

  // 破壊的操作ではない（既存公演は残す）ため overlap/interval どちらも警告トーンは amber。
  const isOverlap = conflictInfo.kind === 'overlap'
  const title = isOverlap ? '公演の時間が重複しています' : '前後の公演と間隔が短いです'
  const description = isOverlap
    ? '同じ店舗・日付で、既存の公演と時間が重なっています。'
    : '前後の公演との間隔が、推奨（60分）より短くなっています。'

  const handleContinue = () => {
    onContinue()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            <DialogTitle className="text-amber-700">{title}</DialogTitle>
          </div>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <div className="font-semibold text-gray-700">日付:</div>
              <div className="text-gray-900">{conflictInfo.date}</div>

              <div className="font-semibold text-gray-700">店舗:</div>
              <div className="text-gray-900">{conflictInfo.storeName}</div>

              <div className="font-semibold text-gray-700">{isOverlap ? '重複:' : '間隔:'}</div>
              <div className="text-gray-900">{conflictInfo.timeSlot}</div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 space-y-2">
            <div className="font-semibold text-sm text-gray-700 mb-2">既存の公演:</div>
            <div className="space-y-1">
              <div className="text-sm">
                <span className="font-medium">シナリオ:</span>{' '}
                <span className="text-gray-900">
                  {conflictInfo.conflictingEvent.scenario || '未定'}
                </span>
              </div>
              <div className="text-sm">
                <span className="font-medium">GM:</span>{' '}
                <span className="text-gray-900">
                  {conflictInfo.conflictingEvent.gms.length > 0
                    ? conflictInfo.conflictingEvent.gms.join(', ')
                    : '未定'}
                </span>
              </div>
              <div className="text-sm">
                <span className="font-medium">時間:</span>{' '}
                <span className="text-gray-900">
                  {conflictInfo.conflictingEvent.start_time} - {conflictInfo.conflictingEvent.end_time}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              このまま保存しても<span className="font-semibold">既存の公演は削除されません</span>。
              両方の公演がそのまま登録されます（前後30分など間隔の短い連続公演もこのまま保存できます）。
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            やめる
          </Button>
          <Button onClick={handleContinue}>
            このまま保存（両方残す）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
