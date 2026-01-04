import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle } from 'lucide-react'

interface ActionButtonsProps {
  onApprove: () => void
  onReject: () => void
  onCancel: () => void
  disabled: boolean
  submitting?: boolean // 却下ボタン用（選択状態に関係なく押せる）
}

/**
 * 承認/却下/キャンセルボタンコンポーネント
 */
export const ActionButtons = ({
  onApprove,
  onReject,
  onCancel,
  disabled,
  submitting = false
}: ActionButtonsProps) => {
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        className="flex-1 text-sm"
        onClick={onCancel}
        size="sm"
      >
        キャンセル
      </Button>
      <Button
        variant="destructive"
        className="flex-1 text-sm"
        onClick={onReject}
        disabled={submitting}
        size="sm"
      >
        <XCircle className="w-4 h-4 mr-1.5" />
        却下
      </Button>
      <Button
        variant="default"
        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm"
        onClick={onApprove}
        disabled={disabled}
        size="sm"
      >
        <CheckCircle2 className="w-4 h-4 mr-1.5" />
        承認
      </Button>
    </div>
  )
}

