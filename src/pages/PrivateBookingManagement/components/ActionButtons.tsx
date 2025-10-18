import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle } from 'lucide-react'

interface ActionButtonsProps {
  status: string
  selectedCandidateOrder: number | null
  selectedStoreId: string
  selectedGMId: string
  submitting: boolean
  onApprove: () => void
  onReject: () => void
}

/**
 * 承認/却下ボタンコンポーネント
 */
export const ActionButtons = ({
  status,
  selectedCandidateOrder,
  selectedStoreId,
  selectedGMId,
  submitting,
  onApprove,
  onReject
}: ActionButtonsProps) => {
  // GM確認待ち または 店舗確認待ち の場合のみボタンを表示
  if (!['gm_confirmed', 'pending_store'].includes(status)) {
    return null
  }

  const canApprove = selectedCandidateOrder !== null && selectedStoreId && selectedGMId

  return (
    <div className="flex gap-3 pt-6 border-t">
      <Button
        variant="default"
        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
        onClick={onApprove}
        disabled={!canApprove || submitting}
      >
        <CheckCircle2 className="w-4 h-4 mr-2" />
        承認する
      </Button>
      <Button
        variant="destructive"
        className="flex-1"
        onClick={onReject}
        disabled={submitting}
      >
        <XCircle className="w-4 h-4 mr-2" />
        却下する
      </Button>
    </div>
  )
}

