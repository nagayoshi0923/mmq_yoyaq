import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'

interface PlayedRegistrationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scenarioTitle: string
  scenarioMasterId: string
  customerId: string | null
  onRegistered?: () => void
}

export function PlayedRegistrationDialog({
  open,
  onOpenChange,
  scenarioTitle,
  scenarioMasterId,
  customerId,
  onRegistered,
}: PlayedRegistrationDialogProps) {
  const [playedDate, setPlayedDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!customerId) return

    setIsSubmitting(true)
    try {
      const { error } = await supabase
        .from('manual_play_history')
        .insert({
          customer_id: customerId,
          scenario_title: scenarioTitle,
          scenario_master_id: scenarioMasterId,
          played_at: playedDate || null,
        })

      if (error) throw error

      onOpenChange(false)
      showToast.success('体験済みに登録しました')
      onRegistered?.()
    } catch (error) {
      logger.error('体験済み登録エラー:', error)
      showToast.error('登録に失敗しました')
    } finally {
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
