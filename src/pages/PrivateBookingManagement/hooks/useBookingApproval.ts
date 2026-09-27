import { apiClient } from '@/lib/apiClient'
import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { useOrganization } from '@/hooks/useOrganization'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { getPrivateBookingDisplayEndTime } from '@/lib/privateBookingScenarioTime'
import { normalizeToJapanCalendarYmd } from '@/lib/japanCalendarDate'
import { reservationApi } from '@/lib/reservationApi'
import type { PrivateBookingRequest } from './usePrivateBookingData'
import type { RpcApprovePrivateBookingParams } from '@/lib/rpcTypes'
import { pendingOperation } from '@/lib/pendingOperation'
import { useAuth } from '@/contexts/AuthContext'
import { showToast } from '@/utils/toast'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { formatJstDateJa } from '@/utils/jstDate'
import { getDefaultPrivateRejectionTemplate } from '@/lib/templateRegistry'
import { startTimeToEn, timeSlotEnToCandidate, timeSlotEnToLabel } from '@/lib/timeSlot'



// 却下ダイアログの初期本文に入れる既定の理由。テンプレ側に「今後のご検討」等の
// 定型文があるため、ここは具体的な理由1文に留めて重複を避ける。
const DEFAULT_REJECTION_REASON = 'ご希望の日程では貸切での受付が難しい状況です。'
// reservationApi.cancel に渡すキャンセル記録用の理由（メール全文とは別物）
const REJECTION_CANCEL_REASON = '貸切リクエストを却下しました'

function buildRejectionCandidateDatesText(
  candidates: Array<{ date?: string; startTime?: string; endTime?: string }> | undefined
): string {
  if (!candidates || candidates.length === 0) return ''
  return candidates
    .map((c, i) => `候補${i + 1}: ${formatJstDateJa(c.date || '', true) || c.date || ''} ${(c.startTime || '').slice(0, 5)} - ${(c.endTime || '').slice(0, 5)}`)
    .join('\n')
}

// 却下メールの全文を組み立てる（テンプレの差し込み変数を実値に置換）。
// 送信側 send-private-booking-rejection / チャット共有本文と同じ置換ルール。
function buildRejectionEmailBody(template: string, vars: {
  customerName: string
  scenarioTitle: string
  rejectionReason: string
  candidateDatesText: string
  companyName: string
}): string {
  return template
    .replace(/{customer_name}/g, vars.customerName || '')
    .replace(/{scenario_title}/g, vars.scenarioTitle || '')
    .replace(/{rejection_reason}/g, vars.rejectionReason || '')
    .replace(/{candidate_dates}/g, vars.candidateDatesText || '')
    .replace(/{company_name}/g, vars.companyName || '')
}

interface UseBookingApprovalProps {
  onSuccess: () => void | Promise<void>
}

/**
 * 貸切リクエストの承認・却下処理を管理するフック
 */
export function useBookingApproval({ onSuccess }: UseBookingApprovalProps) {
  // 組織IDを取得（マルチテナント対応）
  const { organizationId } = useOrganization()
  const { user } = useAuth()
  const approvingRef = useRef(false)
  const { isCustomHoliday } = useCustomHolidays()
  
  const [submitting, setSubmitting] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')  // 却下メールの全文（編集可能）
  const [rejectBodyLoading, setRejectBodyLoading] = useState(false)  // 全文の組み立て中
  const [deleteConfirmRequestId, setDeleteConfirmRequestId] = useState<string | null>(null)  // 完全削除の確認対象

  // 承認処理
  const handleApprove = useCallback(async (
    requestId: string,
    selectedRequest: PrivateBookingRequest | null,
    selectedGMId: string,
    selectedSubGmId: string | null,
    selectedStoreId: string,
    selectedCandidateOrder: number | null,
    stores: any[],
    overrideStartTime?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!selectedGMId || !selectedStoreId || !selectedCandidateOrder) {
      logger.error('承認に必要な情報が不足しています')
      return { success: false, error: '承認に必要な情報が不足しています' }
    }

    const requiredGm = selectedRequest?.required_gm_count ?? 1
    if (requiredGm >= 2) {
      if (!selectedSubGmId?.trim() || selectedSubGmId === selectedGMId) {
        return {
          success: false,
          error:
            '必要GM数が2名のシナリオです。メインGMとサブGMで、異なる2名を選択してください。',
        }
      }
    }

    if (approvingRef.current) return { success: false, error: '承認処理中です。しばらくお待ちください。' }
    if (!user?.id || !organizationId) return { success: false, error: 'ログイン状態と組織を確認してください。' }
    approvingRef.current = true
    let approvalCommitted = false
    try {
      setSubmitting(true)

      // 選択された候補日時のみを残す
      const selectedCandidate = selectedRequest?.candidate_datetimes?.candidates?.find(
        c => c.order === selectedCandidateOrder
      )
      
      if (!selectedCandidate) {
        setSubmitting(false)
        return { success: false, error: '候補日時が見つかりません' }
      }

      const selectedDateYmd = normalizeToJapanCalendarYmd(selectedCandidate.date)
      if (!selectedDateYmd) {
        setSubmitting(false)
        return {
          success: false,
          error: '候補日が無効です。画面を更新してから再度お試しください。',
        }
      }

      const selectedStartTime = (overrideStartTime || selectedCandidate.startTime || '').trim().slice(0, 5)
      if (!/^\d{2}:\d{2}$/.test(selectedStartTime)) {
        setSubmitting(false)
        return { success: false, error: '開始時刻が不正です。' }
      }
      if (selectedStartTime < '09:00') {
        setSubmitting(false)
        return { success: false, error: '開始時刻は9:00以降にしてください。' }
      }

      const resolveEndTime = (
        c: { startTime: string; endTime: string; date: string },
        dateYmd: string
      ) =>
        selectedRequest?.scenario_timing
          ? getPrivateBookingDisplayEndTime(
              c.startTime,
              dateYmd,
              selectedRequest.scenario_timing,
              isCustomHoliday
            )
          : c.endTime

      const selectedEndTime = resolveEndTime(
        { ...selectedCandidate, startTime: selectedStartTime },
        selectedDateYmd
      )
      if (selectedEndTime <= selectedStartTime || selectedEndTime > '23:00') {
        setSubmitting(false)
        return {
          success: false,
          error: 'この開始時刻では終了が23:00を超えます。もっと早い時刻を選んでください。',
        }
      }

      // 募集停止は「実際に置く枠」（開始時刻から再判定）で見る。
      // 候補の照合用 timeSlot は元の希望枠のまま RPC に渡す。
      const canonicalTimeSlot = startTimeToEn(selectedStartTime)
      if (!organizationId || !canonicalTimeSlot) {
        setSubmitting(false)
        return {
          success: false,
          error: '候補日時または組織情報が無効です。画面を更新してから再度お試しください。',
        }
      }

      const { data: blockedSlot, error: blockedSlotError } = await supabase
        .from('schedule_blocked_slots')
        .select('id')
        .filter('organization_id', 'eq', organizationId)
        .eq('date', selectedDateYmd)
        .eq('store_id', selectedStoreId)
        .eq('time_slot', canonicalTimeSlot)
        .maybeSingle()
      if (blockedSlotError) {
        logger.error('募集停止枠チェックエラー:', blockedSlotError)
        setSubmitting(false)
        return { success: false, error: '募集停止状況の確認に失敗しました。もう一度お試しください。' }
      }
      if (blockedSlot) {
        setSubmitting(false)
        const storeName = stores.find((store) => store.id === selectedStoreId)?.name || '選択店舗'
        return {
          success: false,
          error: `${selectedDateYmd} ${timeSlotEnToLabel(canonicalTimeSlot)}（${storeName}）は現在受付停止中です。募集再開後に承認するか、別の候補・店舗・時刻を選択してください。`,
        }
      }

      // 🚨 CRITICAL: 同じ日時・店舗に既存の公演がないかチェック
      // 再承認の場合は、この予約に紐づくイベントを除外する
      const existingEventsQuery = supabase
        .from('schedule_events_staff_view')
        .select('id, scenario, start_time, end_time, reservation_id')
        .eq('date', selectedDateYmd)
        .eq('store_id', selectedStoreId)
        .neq('is_cancelled', true)
      
      const { data: existingEvents, error: checkError } = await existingEventsQuery

      if (checkError) {
        logger.error('既存公演チェックエラー:', checkError)
      } else if (existingEvents && existingEvents.length > 0) {
        // 時間帯の重複チェック
        const candidateStart = selectedStartTime
        const candidateEnd = selectedEndTime

        for (const event of existingEvents) {
          // 再承認の場合、同じ予約のイベントは競合チェックから除外
          if (event.reservation_id === requestId) {
            continue
          }
          
          const eventStart = event.start_time?.substring(0, 5) || ''
          const eventEnd = event.end_time?.substring(0, 5) || ''

          // 直接重複チェック
          if (candidateStart < eventEnd && candidateEnd > eventStart) {
            setSubmitting(false)
            return {
              success: false,
              error: `${selectedDateYmd} ${candidateStart}〜${candidateEnd} の時間帯には既に「${event.scenario}」(${eventStart}〜${eventEnd})が入っています。`,
            }
          }

        }
      }

      // 全候補日を保持し、選択された候補のみ 'confirmed' にする（各 date を日本暦 YYYY-MM-DD に正規化して保存）
      const updatedCandidates = (selectedRequest?.candidate_datetimes?.candidates || []).map((c: any) => {
        const dateYmd = normalizeToJapanCalendarYmd(c.date) || c.date
        const isConfirmed = c.order === selectedCandidateOrder
        return {
          ...c,
          date: dateYmd,
          startTime: isConfirmed ? selectedStartTime : c.startTime,
          endTime: isConfirmed ? selectedEndTime : resolveEndTime(c, dateYmd),
          // 照合ヒント用に希望枠の timeSlot は維持する（RPCが開始時刻から公演枠を再判定）
          timeSlot: isConfirmed ? (c.timeSlot || timeSlotEnToCandidate(canonicalTimeSlot)) : c.timeSlot,
          status: isConfirmed ? 'confirmed' : 'pending',
        }
      })

      const updatedCandidateDatetimes = {
        ...selectedRequest?.candidate_datetimes,
        candidates: updatedCandidates,
        confirmedStore: selectedRequest?.candidate_datetimes?.requestedStores?.find(
          (s: any) => s.storeId === selectedStoreId
        ) || {
          storeId: selectedStoreId,
          storeName: stores.find(s => s.id === selectedStoreId)?.name || '',
          storeShortName: stores.find(s => s.id === selectedStoreId)?.short_name || ''
        }
      }

      // ✅ SEC-P0-04: 承認はDB側RPCでアトミックに実行（途中失敗の不整合を防ぐ）
      // シナリオタイトルから「【貸切希望】」プレフィックスを除去（schedule_eventsでシナリオマスタとマッチさせるため）
      const cleanScenarioTitle = (selectedRequest?.scenario_title || '')
        .replace(/^【貸切希望】/, '')
        .replace(/^【貸切】/, '')
        .trim()
      
      const rpcParams: RpcApprovePrivateBookingParams = {
        p_reservation_id: requestId,
        p_selected_date: selectedDateYmd,
        p_selected_start_time: selectedStartTime,
        p_selected_end_time: selectedEndTime,
        p_selected_store_id: selectedStoreId,
        p_selected_gm_id: selectedGMId,
        p_candidate_datetimes: updatedCandidateDatetimes,
        p_scenario_title: cleanScenarioTitle,
        p_customer_name: selectedRequest?.customer_name || '',
        p_selected_sub_gm_id: requiredGm >= 2 ? selectedSubGmId : null,
      }
      logger.log('貸切承認RPCパラメータ:', rpcParams)
      
      const operation = await pendingOperation(`private-approval:${organizationId}:${user.id}`, rpcParams)
      const { data: approval, error: approveError } = await supabase.rpc('approve_private_booking_with_notifications', { ...rpcParams, p_request_id: operation.id })

      if (approveError) {
        logger.error('貸切承認RPCエラー:', approveError)
        logger.error('RPCエラー詳細:', JSON.stringify(approveError, null, 2))
        if (['P0050', 'P0051', 'P0052'].includes(approveError.code)) {
          return { success: false, error: approveError.code === 'P0050'
            ? '申込と貸切グループの所属組織が一致しないため、承認できません。管理者に紐付けの確認を依頼してください。'
            : approveError.code === 'P0051'
              ? '貸切グループに別の申込が紐付いているため、承認できません。画面を更新し、管理者に確認してください。'
              : '貸切グループの作品設定が見つからないため、承認できません。作品の紐付けを確認してください。' }
        }
        if (approveError.code === 'P0019') {
          setSubmitting(false)
          return {
            success: false,
            error: 'この時間帯には既に別の公演が入っています。別の候補を選んでください。'
          }
        }
        if (approveError.code === 'P0040') {
          setSubmitting(false)
          return {
            success: false,
            error: 'この候補・店舗は現在受付停止中です。募集再開後に承認するか、別の候補・店舗を選択してください。',
          }
        }
        if (approveError.code === 'P0025') {
          setSubmitting(false)
          return {
            success: false,
            error: '選択した担当GMはこの時間帯に既に別の予定があります。別のGMまたは候補日時を選んでください。'
          }
        }
        if (approveError.code === 'P0026') {
          setSubmitting(false)
          return {
            success: false,
            error: 'メインGMとサブGMに同じ人は指定できません。別々のスタッフを選んでください。',
          }
        }
        if (approveError.code === 'P0027') {
          setSubmitting(false)
          return {
            success: false,
            error: 'この時間帯は店舗・作品・公演に設定された準備時間を確保できません。別の候補日時を選んでください。',
          }
        }
        if (approveError.code === 'P0041') {
          setSubmitting(false)
          return {
            success: false,
            error: '選択した日時が不正です。希望候補の日付で、9:00〜23:00の範囲にしてください。',
          }
        }
        if (approveError.code === 'P0018') {
          setSubmitting(false)
          return {
            success: false,
            error: 'このリクエストは既に処理済みの可能性があります。画面を更新してください。'
          }
        }
        if (approveError.code === 'P0010') {
          setSubmitting(false)
          return { success: false, error: '権限がありません' }
        }
        throw approveError
      }

      const scheduleEventId = approval?.schedule_event_id as string | undefined
      if (!scheduleEventId) throw new Error('承認結果を確認できませんでした。同じ内容で再試行してください。')
      approvalCommitted = true
      logger.log('貸切承認RPC成功:', { requestId, scheduleEventId })

      // RPC成功後に一覧を更新。通知・履歴の保存は同じRPCで完了している。
      // onSuccess の完了（一覧再フェッチなど）まで await して、submitting=true を保つ。
      // これにより承認ボタンの再活性化前にリストが最新化され、二度押しでの重複承認を防ぐ。
      try {
        await onSuccess()
        operation.complete()
      } catch (refreshError) {
        logger.error('承認後の一覧更新に失敗:', refreshError)
        showToast.warning('承認は保存済みですが、一覧を更新できませんでした。画面を開き直してください。')
      }
      // 承認・履歴・配送予定はDBで一括保存済み。画面を閉じてもサーバーが配送する。
      if (!approval.approval_delivery_queued) showToast.warning('旧版で承認済みの申込です。通知履歴で送信状況をご確認ください。')

      return { success: true }
    } catch (error) {
      logger.error('承認エラー:', error)
      return approvalCommitted ? { success: true } : { success: false, error: '承認処理中にエラーが発生しました。同じ内容で再試行してください。' }
    } finally {
      approvingRef.current = false
      setSubmitting(false)
    }
  }, [onSuccess, organizationId, isCustomHoliday, user?.id])

  // 却下クリック
  // 却下ダイアログを開く。フラグメント（理由）だけでなく、実際に送られる「全文」を
  // 組み立てて編集できるようにする（テンプレ private_rejection_template ＋既定理由）。
  const handleRejectClick = useCallback(async (requestId: string, request?: PrivateBookingRequest | null) => {
    setRejectRequestId(requestId)
    setRejectionReason('')
    setRejectBodyLoading(true)
    setShowRejectDialog(true)
    try {
      if (!organizationId) throw new Error('組織情報が必要です')
      // 予約と同じ組織の設定だけをプレビューする。
      const { data: reservation } = await supabase
        .from('reservations')
        .select('store_id, organization_id, title, customer_name')
        .eq('organization_id', organizationId)
        .eq('id', requestId)
        .maybeSingle()

      const storeId = reservation?.store_id as string | undefined
      const orgId = reservation?.organization_id as string | undefined
      let template = ''
      let companyName = ''
      let companyPhone = ''
      let companyEmail = ''
      const settings = await apiClient.get<Record<string,string | null>>(`/api/schedule?type=effective-email-settings&reservation_id=${encodeURIComponent(requestId)}`)
      template = settings?.private_rejection_template || ''
      companyName = settings?.company_name || ''
      companyPhone = settings?.company_phone || ''
      companyEmail = settings?.company_email || ''
      if (!template) {
        template = getDefaultPrivateRejectionTemplate(companyName, companyPhone, companyEmail)
      }

      const body = buildRejectionEmailBody(template, {
        customerName: request?.customer_name || reservation?.customer_name || '',
        scenarioTitle: request?.scenario_title || reservation?.title || '',
        // メール設定で編集できる既定理由。未設定ならアプリの固定既定文。
        rejectionReason: settings?.private_rejection_reason ?? DEFAULT_REJECTION_REASON,
        candidateDatesText: buildRejectionCandidateDatesText(request?.candidate_datetimes?.candidates),
        companyName,
      })
      setRejectionReason(body)
    } catch (e) {
      logger.error('却下メール本文の組み立てエラー:', e)
      setRejectionReason(DEFAULT_REJECTION_REASON)
    } finally {
      setRejectBodyLoading(false)
    }
  }, [organizationId])

  // 予約・公演・グループ・チャット通知とメール送信予定はサーバーで一括保存する。
  const handleRejectConfirm = useCallback(async (_selectedRequest?: PrivateBookingRequest | null) => {
    if (!rejectRequestId || !rejectionReason.trim() || !organizationId) return
    setSubmitting(true)
    let saved = false
    try {
      await reservationApi.cancel(rejectRequestId, REJECTION_CANCEL_REASON, {
        skipGroupCancel: true, skipCancellationEmail: true, cancelPrivateEvent: true,
        privateRejectionBody: rejectionReason,
      })
      saved = true
      setShowRejectDialog(false)
      setRejectRequestId(null)
      setRejectionReason('')
      showToast.success('貸切リクエストを却下しました', 'メールの送信予定を保存しました。却下済み一覧で送信状況を確認できます')
    } catch (error) {
      logger.error('却下エラー:', error)
      if (saved) {
        showToast.warning('却下は保存済みですが、メール送信を確認できません', '予約を再度却下せず、通知履歴を確認して個別にご連絡ください')
      } else {
        showToast.error(getSafeErrorMessage(error, '却下を保存できませんでした。状態を再読込して確認してください'))
      }
    } finally {
      // 再取得の失敗で、保存・送信結果を上書きしない。
      try { await onSuccess() } catch (error) { logger.error('却下後の一覧再取得に失敗:', error) }
      setSubmitting(false)
    }
  }, [rejectRequestId, rejectionReason, onSuccess, organizationId])

  // 却下キャンセル
  const handleRejectCancel = useCallback(() => {
    setShowRejectDialog(false)
    setRejectRequestId(null)
    setRejectionReason('')
  }, [])

  // 完全削除（確認ダイアログを開く）
  const handleDelete = useCallback((requestId: string) => {
    setDeleteConfirmRequestId(requestId)
  }, [])

  // 完全削除（確認後の実行）
  const runDelete = useCallback(async () => {
    const requestId = deleteConfirmRequestId
    if (!requestId) return

    setSubmitting(true)
    try {
      const { error: deleteError } = await supabase.rpc('delete_private_booking_request_atomic', {
        p_reservation_id: requestId,
      })
      if (deleteError) {
        logger.error('予約削除エラー:', deleteError)
        throw new Error(deleteError.message || '予約の削除に失敗しました')
      }

      logger.log('貸切申込を完全に削除しました:', requestId)
      setDeleteConfirmRequestId(null)
      onSuccess()
    } catch (error) {
      logger.error('削除エラー:', error)
      showToast.error(error instanceof Error ? error.message : '削除に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }, [deleteConfirmRequestId, onSuccess])

  return {
    submitting,
    showRejectDialog,
    rejectionReason,
    setRejectionReason,
    rejectBodyLoading,
    handleApprove,
    handleRejectClick,
    handleRejectConfirm,
    handleRejectCancel,
    handleDelete,
    deleteConfirmOpen: deleteConfirmRequestId !== null,
    setDeleteConfirmOpen: (open: boolean) => { if (!open) setDeleteConfirmRequestId(null) },
    runDelete,
  }
}
