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

  const handleContinue = () => {
    onContinue()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <DialogTitle className="text-red-600">公演の重複警告</DialogTitle>
          </div>
          <DialogDescription>
            同じ日時・店舗・時間帯に既に公演が存在します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="font-semibold text-gray-700">日付:</div>
              <div className="text-gray-900">{conflictInfo.date}</div>
              
              <div className="font-semibold text-gray-700">店舗:</div>
              <div className="text-gray-900">{conflictInfo.storeName}</div>
              
              <div className="font-semibold text-gray-700">時間帯:</div>
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

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              ⚠️ このまま保存すると、既存の公演が削除され、新しい公演で上書きされます。
              本当に続行しますか？
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleContinue}
            className="bg-red-600 hover:bg-red-700"
          >
            既存公演を削除して上書き
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

