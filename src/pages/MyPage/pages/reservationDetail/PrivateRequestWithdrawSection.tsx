/**
 * 予約詳細の「申込の取り下げ」（店舗の返事待ちの貸切申込）。
 * マイページの貸切カードの「操作」・グループページと同じ WithdrawRequestDialog を出し、
 * グループを残す（既定。候補日を直して申し込み直せる）か、グループも閉じるかを選ぶ（2026-10-20 社長決定）。
 * グループの無い直接申込は選択肢を出さず、従来どおり取り下げるだけ。
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { readPrivateGroup } from '@/lib/privateGroupRead'
import { getErrorMessage } from '@/lib/errorFields'
import { logger } from '@/utils/logger'
import { useWithdrawPrivateRequestMutation } from '../../hooks/useReservationDetailQuery'
import { WithdrawRequestDialog } from '../../components/PrivateBookingCards/WithdrawRequestDialog'

interface PrivateRequestWithdrawSectionProps {
  reservationId: string
  /** 紐づく貸切グループ（直接申込は null） */
  groupId: string | null
  /** 取り下げたあと（画面の移動）。groupKept: 申込だけ取り下げてグループは残した */
  onDone: (detail: { groupKept: boolean }) => void
}

/** 自分以外の参加メンバーの人数（「メンバー N 名に知らせます」）。読めなければ人数なしの文面にする */
function useWithdrawGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: ['reservation-detail', 'withdraw-group', groupId ?? ''],
    enabled: Boolean(groupId),
    staleTime: 30_000,
    queryFn: async () => {
      const snapshot = await readPrivateGroup({ groupId })
      const joined = (snapshot.group.members ?? []).filter(member => member.status === 'joined')
      return { otherMembers: Math.max(0, joined.length - 1) }
    },
  })
}

export function PrivateRequestWithdrawSection({ reservationId, groupId, onDone }: PrivateRequestWithdrawSectionProps) {
  const [open, setOpen] = useState(false)
  const hasGroup = Boolean(groupId)
  const members = useWithdrawGroupMembers(groupId)
  const withdraw = useWithdrawPrivateRequestMutation(reservationId, detail => {
    toast.success(detail.groupKept ? '申込を取り下げました。候補日を直してもう一度申し込めます' : '申込を取り下げました')
    onDone(detail)
  })

  return (
    <>
      <div className="pt-3 border-t border-amber-200 flex items-center justify-between gap-3" data-testid="private-request-withdraw">
        <div>
          <p className="text-sm text-amber-700">申込の取り下げ</p>
          <p className="text-xs text-amber-600 mt-1">
            {hasGroup
              ? '日程確定前なのでキャンセル料はかかりません。グループを残すか、一緒に閉じるかを選べます。'
              : '日程確定前なのでキャンセル料はかかりません。'}
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="h-11 px-4 text-sm shrink-0"
          onClick={() => setOpen(true)}
        >
          取り下げる
        </Button>
      </div>
      <WithdrawRequestDialog
        open={open}
        onOpenChange={setOpen}
        hasGroup={hasGroup}
        otherMembers={members.data?.otherMembers ?? 0}
        onConfirm={async mode => {
          try {
            await withdraw.mutateAsync({ keepGroup: hasGroup && mode === 'keep_group' })
          } catch (error) {
            logger.error('貸切申込の取り下げに失敗しました', error)
            toast.error(getErrorMessage(error) || '申込を取り下げられませんでした')
            throw error
          }
        }}
      />
    </>
  )
}
