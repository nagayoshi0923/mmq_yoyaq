/**
 * 貸切の「操作」の実処理（マイページのカード・グループ画面で共通）。
 * 赤い操作（閉じる・取り下げ・キャンセル・抜ける）は ConfirmDialog で影響を数字で見せてから実行する。
 * - グループを閉じる: cancel_unrequested_private_group_with_notice（行は消さず履歴を残す。チャットにお知らせ）
 * - 申込を取り下げる: /api/reservations?action=cancel-with-group-lock（予約詳細の「取り下げる」と同じ処理）
 * - キャンセル: reservationApi.cancel（予約詳細の「キャンセル」と同じ。キャンセル規定で不可なら無効にして理由を出す）
 * - グループから抜ける: private_group_leave_with_notice（申込後・確定後は店舗へ人数変更を知らせる）
 * - 主催者の引き継ぎ（段階 3）: 依頼はメンバー管理シートの「主催者にする」、取り消しはメニューの「引き継ぎの依頼を取り消す」
 */
import { useCallback, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/patterns/modal'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { reservationApi } from '@/lib/reservationApi'
import { PRIVATE_REQUEST_WITHDRAWN_REASON } from '@/lib/constants/reservationStatus'
import { formatPolicyHours } from '@/lib/publicCancellationPolicy'
import { getErrorMessage } from '@/lib/errorFields'
import { logger } from '@/utils/logger'
import { reservationDetailKeys, useReservationDetailQuery } from '../../hooks/useReservationDetailQuery'
import {
  privateBookingConfirmText,
  privateBookingStatusLabel,
  type PrivateBookingDangerAction,
  type PrivateBookingPhase,
} from './privateBookingMenu'
import type { PrivateGroupMemberRow } from './privateGroupSummary'
import { PrivateGroupInquiryDialog } from './PrivateGroupInquiryDialog'
import { PrivateGroupMemberSheet } from './PrivateGroupMemberSheet'
import { handoverCancelConfirmText, type PrivateGroupHandoverInfo } from './privateGroupHandover'

export interface PrivateBookingActionTarget {
  groupId: string | null
  inviteCode: string | null
  reservationId: string | null
  reservationNumber: string | null
  organizationId: string | null
  title: string
  isOrganizer: boolean
  phase: PrivateBookingPhase
  /** 参加中の人数（自分を含む） */
  memberCount: number
  candidateDates: number
  confirmedDate: string | null
  hasSurvey: boolean
  hasUnansweredDates: boolean
  myMemberId: string | null
  members: PrivateGroupMemberRow[]
  /** 自分（主催者）が依頼中の主催者の引き継ぎ */
  handover: PrivateGroupHandoverInfo | null
  /** 問い合わせの返信先 */
  replyEmail: string
  replyName: string
}

interface Options {
  /** 赤い操作が終わったあと（一覧の読み直し・画面の移動） */
  onDone?: (action: PrivateBookingDangerAction) => void | Promise<unknown>
  /** メンバーを外したあと */
  onMembersChanged?: () => void | Promise<unknown>
}

export interface CancelAvailability {
  loading: boolean
  allowed: boolean
  reason: string | null
}

export function usePrivateBookingActions(target: PrivateBookingActionTarget, options: Options = {}) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<PrivateBookingDangerAction | null>(null)
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [policyWanted, setPolicyWanted] = useState(false)
  const [cancelHandoverOpen, setCancelHandoverOpen] = useState(false)
  const preparePolicy = useCallback(() => setPolicyWanted(true), [])

  // 確定後のキャンセルは予約詳細と同じキャンセル規定で可否を決める（必要になってから読む）
  const needsPolicy = policyWanted && target.isOrganizer && target.phase === 'confirmed' && Boolean(target.reservationId)
  const policy = useReservationDetailQuery(needsPolicy ? target.reservationId ?? undefined : undefined)
  const cancelAvailability: CancelAvailability = (() => {
    if (!needsPolicy || policy.isLoading) return { loading: needsPolicy, allowed: false, reason: null }
    const data = policy.data
    if (!data) return { loading: false, allowed: false, reason: '予約の情報を読めませんでした。店舗へご連絡ください。' }
    if (data.reservation.status !== 'confirmed') return { loading: false, allowed: false, reason: 'この予約はマイページからキャンセルできません。店舗へご連絡ください。' }
    if (!data.canCancelByPolicy) {
      return {
        loading: false,
        allowed: false,
        reason: `キャンセル料金が発生する期間のため、マイページからのキャンセルはできません（${formatPolicyHours(data.cancelDeadlineHours)}まで）。店舗へご連絡ください。`,
      }
    }
    return { loading: false, allowed: true, reason: null }
  })()

  const refreshLists = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['mypage-data'], refetchType: 'all' }),
      target.reservationId
        ? queryClient.invalidateQueries({ queryKey: reservationDetailKeys.detail(target.reservationId), refetchType: 'all' })
        : Promise.resolve(),
    ]).catch(error => logger.warn('操作は保存済み・一覧の読み直しに失敗:', error))
  }

  const execute = async (action: PrivateBookingDangerAction) => {
    try {
      if (action === 'close_group') {
        if (!target.groupId) throw new Error('グループが見つかりません')
        const { data, error } = await privateGroupRpcApi.closeUnrequestedWithNotice(target.groupId)
        if (error) throw new Error(error.code === '55P03' ? 'ほかの操作が進行中です。画面を更新してからお試しください。' : error.message)
        if (data !== true) throw new Error('グループを閉じたことを確認できませんでした')
        toast.success('グループを閉じました')
      } else if (action === 'withdraw') {
        if (!target.reservationId) throw new Error('申込が見つかりません')
        // 本人確認は DB 側が auth.uid() で行うため customer_id は不要（予約詳細の取り下げと同じ）
        await reservationApi.cancelWithGroupLock(target.reservationId, null, PRIVATE_REQUEST_WITHDRAWN_REASON)
        toast.success('申込を取り下げました')
      } else if (action === 'cancel') {
        if (!target.reservationId) throw new Error('予約が見つかりません')
        if (!cancelAvailability.allowed) throw new Error(cancelAvailability.reason || 'キャンセルできません')
        await reservationApi.cancel(target.reservationId, 'お客様によるキャンセル')
        toast.success('貸切をキャンセルしました')
      } else {
        if (!target.groupId) throw new Error('グループが見つかりません')
        const { data, error } = await privateGroupRpcApi.leave(target.groupId)
        if (error) throw error
        const storeNotified = (data as { store_notified?: boolean } | null)?.store_notified === true
        toast.success(storeNotified ? 'グループから抜けました。店舗に人数変更を知らせました' : 'グループから抜けました')
      }
    } catch (err) {
      logger.error('貸切の操作に失敗しました', { action, err })
      toast.error(getErrorMessage(err) || '操作に失敗しました')
      throw err
    }
    await refreshLists()
    await options.onDone?.(action)
  }

  const copyInvite = async () => {
    if (!target.inviteCode) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/group/invite/${target.inviteCode}`)
      toast.success('招待リンクをコピーしました')
    } catch {
      toast.error('コピーできませんでした')
    }
  }

  const cancelHandover = async () => {
    if (!target.handover) return
    try {
      const { data, error } = await privateGroupRpcApi.cancelHandover(target.handover.id)
      if (error) throw error
      const result = data as { ok?: boolean; status?: string } | null
      if (result?.ok) toast.success('引き継ぎの依頼を取り消しました')
      else toast.info('この依頼はすでに終わっています（期限切れ・お断り・同意済みのいずれか）')
    } catch (err) {
      logger.error('引き継ぎの依頼を取り消せませんでした', err)
      toast.error(getErrorMessage(err) || '引き継ぎの依頼を取り消せませんでした')
      throw err
    }
    await refreshLists()
    await options.onMembersChanged?.()
  }
  const cancelHandoverText = target.handover ? handoverCancelConfirmText(target.handover.toName) : null

  const confirm = pending
    ? privateBookingConfirmText(pending, {
      otherMembers: Math.max(0, target.memberCount - 1),
      candidateDates: target.candidateDates,
      confirmedDate: target.confirmedDate,
      phase: target.phase,
    })
    : null

  const dialogs: ReactNode = (
    <>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={next => { if (!next) setPending(null) }}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        variant="destructive"
        onConfirm={async () => { if (pending) await execute(pending) }}
      />
      <PrivateGroupInquiryDialog
        open={inquiryOpen}
        onOpenChange={setInquiryOpen}
        info={{
          organizationId: target.organizationId,
          reservationNumber: target.reservationNumber,
          title: target.title,
          statusLabel: privateBookingStatusLabel(target.phase, target.confirmedDate),
          inviteCode: target.inviteCode,
        }}
        replyEmail={target.replyEmail}
        replyName={target.replyName}
      />
      <ConfirmDialog
        open={cancelHandoverOpen}
        onOpenChange={setCancelHandoverOpen}
        title={cancelHandoverText?.title ?? ''}
        message={cancelHandoverText?.message}
        confirmLabel={cancelHandoverText?.confirmLabel}
        onConfirm={cancelHandover}
      />
      {target.isOrganizer && target.groupId && (
        <PrivateGroupMemberSheet
          open={membersOpen}
          onOpenChange={setMembersOpen}
          groupId={target.groupId}
          members={target.members}
          myMemberId={target.myMemberId}
          phase={target.phase}
          handover={target.handover}
          onChanged={async () => {
            await refreshLists()
            await options.onMembersChanged?.()
          }}
        />
      )}
    </>
  )

  return {
    target,
    /** 赤い操作の確認ダイアログを開く */
    requestDanger: (action: PrivateBookingDangerAction) => setPending(action),
    openInquiry: () => setInquiryOpen(true),
    openMembers: () => setMembersOpen(true),
    /** 主催者の引き継ぎ依頼を取り消す確認を開く */
    requestCancelHandover: () => setCancelHandoverOpen(true),
    copyInvite,
    /** マイページの一覧（カード）と予約詳細を読み直す */
    refreshLists,
    /** キャンセル規定を読み始める（メニューを開いたとき・申込内容の箱を出したとき） */
    preparePolicy,
    cancelAvailability,
    dialogs,
  }
}

export type PrivateBookingActions = ReturnType<typeof usePrivateBookingActions>
