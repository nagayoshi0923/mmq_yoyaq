import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Trash2 } from 'lucide-react'

interface ActionButtonsProps {
  onApprove: () => void
  onReject: () => void
  onCancel: () => void
  onDelete?: () => void
  disabled: boolean
  submitting?: boolean
}

/**
 * 承認/却下/削除ボタンコンポーネント
 */
export const ActionButtons = ({
  onApprove,
  onReject,
  onCancel,
  onDelete,
  disabled,
  submitting = false
}: ActionButtonsProps) => {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 text-sm"
          onClick={onCancel}
          size="sm"
        >
          戻る
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
      {onDelete && (
        <Button
          variant="ghost"
          className="w-full text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={onDelete}
          disabled={submitting}
          size="sm"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          この申込を完全に削除する
        </Button>
      )}
    </div>
  )
}

