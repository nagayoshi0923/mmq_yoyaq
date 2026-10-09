/**
 * 主催者の引き継ぎを「引き継がない」（依頼を断る）。マイページのカードと引き継ぎ確認画面で共通。
 * ConfirmDialog で確かめてから private_group_handover_decline を呼ぶ。両者に通知ベルとチャットの記録が残る。
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/patterns/modal'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { getErrorMessage } from '@/lib/errorFields'
import { logger } from '@/utils/logger'
import { handoverDeclineConfirmText } from './privateGroupHandover'

interface HandoverDeclineButtonProps {
  requestId: string
  fromName: string
  label?: string
  className?: string
  /** 断ったあと（画面の読み直し・移動） */
  onDone?: () => void | Promise<unknown>
}

export function HandoverDeclineButton({ requestId, fromName, label = '引き継がない', className, onDone }: HandoverDeclineButtonProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const text = handoverDeclineConfirmText(fromName)

  const decline = async () => {
    try {
      const { data, error } = await privateGroupRpcApi.declineHandover(requestId)
      if (error) throw error
      const result = data as { ok?: boolean } | null
      if (result?.ok) toast.success('主催者の引き継ぎを断りました')
      else toast.info('この依頼はすでに終わっています（期限切れ・取り消し・同意済みのいずれか）')
    } catch (err) {
      logger.error('主催者の引き継ぎを断れませんでした', err)
      toast.error(getErrorMessage(err) || '主催者の引き継ぎを断れませんでした')
      throw err
    }
    await queryClient.invalidateQueries({ queryKey: ['mypage-data'], refetchType: 'all' }).catch(error => logger.warn('断ったあとの一覧の読み直しに失敗:', error))
    await onDone?.()
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={className ?? 'h-8 text-xs rounded-none'}
        onClick={e => {
          e.stopPropagation()
          setOpen(true)
        }}
        data-testid="handover-decline"
      >
        {label}
      </Button>
      <div onClick={e => e.stopPropagation()}>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={text.title}
          message={text.message}
          confirmLabel={text.confirmLabel}
          onConfirm={decline}
        />
      </div>
    </>
  )
}
