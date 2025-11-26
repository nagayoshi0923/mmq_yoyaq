import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Copy, MoveRight } from 'lucide-react'

interface MoveOrCopyDialogProps {
  isOpen: boolean
  onClose: () => void
  onMove: () => void
  onCopy: () => void
  eventInfo: {
    scenario: string
    date: string
    storeName: string
    timeSlot: string
  } | null
}

export function MoveOrCopyDialog({ isOpen, onClose, onMove, onCopy, eventInfo }: MoveOrCopyDialogProps) {
  if (!eventInfo) return null

  const handleMove = () => {
    onMove()
    onClose()
  }

  const handleCopy = () => {
    onCopy()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>公演を移動・複製</DialogTitle>
          <DialogDescription>
            この公演をどうしますか？
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-md border">
            <div className="font-semibold mb-2">{eventInfo.scenario || 'シナリオ未定'}</div>
            <div className="text-xs text-muted-foreground">
              移動先: {eventInfo.date} {eventInfo.storeName} {eventInfo.timeSlot}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">移動：</span>元の公演を削除して移動先に配置します
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">複製：</span>元の公演は残し、移動先に新しい公演を作成します
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button 
            variant="outline" 
            onClick={handleCopy}
            className="border-blue-200 hover:bg-blue-50"
          >
            <Copy className="w-4 h-4 mr-2" />
            複製
          </Button>
          <Button 
            onClick={handleMove}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <MoveRight className="w-4 h-4 mr-2" />
            移動
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

