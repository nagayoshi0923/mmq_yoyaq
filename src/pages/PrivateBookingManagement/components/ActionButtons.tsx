import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle } from 'lucide-react'

interface ActionButtonsProps {
  onApprove: () => void
  onReject: () => void
  onCancel: () => void
  disabled: boolean
}

/**
 * 承認/却下/キャンセルボタンコンポーネント
 */
export const ActionButtons = ({
  onApprove,
  onReject,
  onCancel,
  disabled
}: ActionButtonsProps) => {
  return (
    <div className="flex gap-3 pt-6 border-t">
      <Button
        variant="outline"
        className="flex-1"
        onClick={onCancel}
      >
        キャンセル
      </Button>
      <Button
        variant="destructive"
        className="flex-1"
        onClick={onReject}
        disabled={disabled}
      >
        <XCircle className="w-4 h-4 mr-2" />
        却下する
      </Button>
      <Button
        variant="default"
        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
        onClick={onApprove}
        disabled={disabled}
      >
        <CheckCircle2 className="w-4 h-4 mr-2" />
        承認する
      </Button>
    </div>
  )
}

