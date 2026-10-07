import { registerPlayedScenario } from '@/lib/registerPlayedScenario'
import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'

interface PlayedRegistrationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scenarioTitle: string
  scenarioMasterId: string
  customerId: string | null
  customerIds?: string[]
  onRegistered?: () => void
}

export function PlayedRegistrationDialog({
  open,
  onOpenChange,
  scenarioTitle,
  scenarioMasterId,
  customerId,
  customerIds,
  onRegistered,
}: PlayedRegistrationDialogProps) {
  const [playedDate, setPlayedDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitPending = useRef(false)

  const handleSubmit = async () => {
    if (!customerId || submitPending.current) return
    submitPending.current = true

    setIsSubmitting(true)
    try {
      const registered = await registerPlayedScenario(customerIds?.length ? customerIds : [customerId], scenarioMasterId, scenarioTitle, playedDate || null)
      if (!registered) {
        showToast.error(`手動のプレイ履歴は最大${MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER}件まで登録できます`)
        return
      }

      onOpenChange(false)
      showToast.success('体験済みに登録しました')
      onRegistered?.()
    } catch (error) {
      logger.error('体験済み登録エラー:', error)
      showToast.error('登録に失敗しました')
    } finally {
      submitPending.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>体験済みに登録</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="text-sm text-muted-foreground">
            「{scenarioTitle}」を体験済みに登録します。
          </div>
          <div className="space-y-2">
            <Label>体験日（任意）</Label>
            <SingleDatePopover
              date={playedDate}
              onDateChange={(date) => setPlayedDate(date || '')}
              placeholder="日付を選択"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? '登録中...' : '登録する'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
