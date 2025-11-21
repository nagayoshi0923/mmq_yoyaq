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
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4 sm:pt-6 border-t">
      <Button
        variant="outline"
        className="flex-1 text-xs sm:text-sm"
        onClick={onCancel}
      >
        キャンセル
      </Button>
      <Button
        variant="destructive"
        className="flex-1 text-xs sm:text-sm"
        onClick={onReject}
        disabled={disabled}
      >
        <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
        却下する
      </Button>
      <Button
        variant="default"
        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm"
        onClick={onApprove}
        disabled={disabled}
      >
        <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
        承認する
      </Button>
    </div>
  )
}

