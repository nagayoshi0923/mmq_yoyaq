import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/patterns/modal/ConfirmDialog'
import { withdrawPrivateGroupCandidate } from '@/lib/privateGroupCandidateDates'
import { formatJstDateJa } from '@/utils/jstDate'
import { toast } from 'sonner'
import type { PrivateGroupCandidateDate } from '@/types'
import { candidateTimeSlotFromDb } from '@/lib/timeSlot'

interface Props {
  groupId: string
  candidate: PrivateGroupCandidateDate
  onWithdrawn: () => unknown | Promise<unknown>
}

/** 削除前に対象と影響を確認。データと回答は取り下げ履歴として保持する。 */
export function WithdrawCandidateButton({ groupId, candidate, onWithdrawn }: Props) {
  const [step, setStep] = useState<'review' | 'confirm' | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const label = `${formatJstDateJa(candidate.date)} ${candidateTimeSlotFromDb(candidate.time_slot)} ${candidate.start_time}〜${candidate.end_time}`
  const withdraw = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await withdrawPrivateGroupCandidate(groupId, candidate.id)
      setStep(null)
      toast.success('候補日を削除しました')
      try { await onWithdrawn() } catch { toast.error('一覧を更新できませんでした。画面を更新してください。') }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '候補日を削除できませんでした。画面を更新してください。')
      throw error
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  return <>
    <Button variant="outline" size="sm" onClick={() => setStep('review')} disabled={saving} aria-label={`${label}を削除`}>
      削除
    </Button>
    <ConfirmDialog
      open={step === 'review'} onOpenChange={open => { if (!open) setStep(current => current === 'review' ? null : current) }}
      title="削除する候補日を確認" confirmLabel="次へ"
      message={<><p>{label}</p><p>候補一覧から取り下げます。これまでの回答は履歴として残り、他の候補には影響しません。</p></>}
      onConfirm={() => setStep('confirm')}
    />
    <ConfirmDialog
      open={step === 'confirm'} onOpenChange={open => { if (!open && !savingRef.current) setStep(null) }}
      title="この候補日を削除しますか？" confirmLabel="削除する" variant="destructive" isLoading={saving}
      message={<><p>{label}</p><p>再び追加した場合は、新しい候補として回答を集め直します。</p></>}
      onConfirm={withdraw}
    />
  </>
}
