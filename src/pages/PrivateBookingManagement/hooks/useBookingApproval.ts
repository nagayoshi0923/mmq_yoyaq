import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { useOrganization } from '@/hooks/useOrganization'
import { reservationApi } from '@/lib/reservationApi'
import type { PrivateBookingRequest } from './usePrivateBookingData'

interface UseBookingApprovalProps {
  onSuccess: () => void
}

/**
 * 貸切リクエストの承認・却下処理を管理するフック
 */
export function useBookingApproval({ onSuccess }: UseBookingApprovalProps) {
  // 組織IDを取得（マルチテナント対応）
  const { organizationId } = useOrganization()
  
  const [submitting, setSubmitting] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  // 承認処理
  const handleApprove = useCallback(async (
    requestId: string,
    selectedRequest: PrivateBookingRequest | null,
    selectedGMId: string,
    selectedStoreId: string,
    selectedCandidateOrder: number | null,
    stores: any[]
  ): Promise<{ success: boolean; error?: string }> => {
    if (!selectedGMId || !selectedStoreId || !selectedCandidateOrder) {
      logger.error('承認に必要な情報が不足しています')
      return { success: false, error: '承認に必要な情報が不足しています' }
    }

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

      // 🚨 CRITICAL: 同じ日時・店舗に既存の公演がないかチェック
      const { data: existingEvents, error: checkError } = await supabase
        .from('schedule_events')
        .select('id, scenario, start_time, end_time')
        .eq('date', selectedCandidate.date)
        .eq('store_id', selectedStoreId)
        .neq('is_cancelled', true)

      if (checkError) {
        logger.error('既存公演チェックエラー:', checkError)
      } else if (existingEvents && existingEvents.length > 0) {
        // 時間帯の重複チェック
        const candidateStart = selectedCandidate.startTime
        const candidateEnd = selectedCandidate.endTime

        for (const event of existingEvents) {
          const eventStart = event.start_time?.substring(0, 5) || ''
          const eventEnd = event.end_time?.substring(0, 5) || ''

          // 時間帯が重複しているかチェック
          if (candidateStart < eventEnd && candidateEnd > eventStart) {
            setSubmitting(false)
            return { 
              success: false, 
              error: `${selectedCandidate.date} ${candidateStart}〜${candidateEnd} の時間帯には既に「${event.scenario}」(${eventStart}〜${eventEnd})が入っています。` 
            }
          }
        }
      }

      const updatedCandidateDatetimes = {
        ...selectedRequest?.candidate_datetimes,
        candidates: [{
          ...selectedCandidate,
          status: 'confirmed'
        }],
        confirmedStore: selectedRequest?.candidate_datetimes?.requestedStores?.find(
          (s: any) => s.storeId === selectedStoreId
        ) || {
          storeId: selectedStoreId,
          storeName: stores.find(s => s.id === selectedStoreId)?.name || '',
          storeShortName: stores.find(s => s.id === selectedStoreId)?.short_name || ''
        }
      }

      // ✅ SEC-P0-04: 承認はDB側RPCでアトミックに実行（途中失敗の不整合を防ぐ）
      const { data: scheduleEventId, error: approveError } = await supabase.rpc('approve_private_booking', {
        p_reservation_id: requestId,
        p_selected_date: selectedCandidate.date,
        p_selected_start_time: selectedCandidate.startTime,
        p_selected_end_time: selectedCandidate.endTime,
        p_selected_store_id: selectedStoreId,
        p_selected_gm_id: selectedGMId,
        p_candidate_datetimes: updatedCandidateDatetimes,
        p_scenario_title: selectedRequest?.scenario_title || '',
        p_customer_name: selectedRequest?.customer_name || ''
      })

      if (approveError) {
        logger.error('貸切承認RPCエラー:', approveError)
        if (approveError.code === 'P0019') {
          setSubmitting(false)
          return {
            success: false,
            error: 'この時間帯には既に別の公演が入っています。別の候補を選んでください。'
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

      logger.log('貸切承認RPC成功:', { requestId, scheduleEventId })

      // 貸切予約確定メールを送信
      try {
        // 承認後の予約データを取得（total_priceを含む）
        const { data: updatedReservation, error: reservationError } = await supabase
          .from('reservations')
          .select('total_price, final_price, customer_email, customer_name, reservation_number, customer_notes')
          .eq('id', requestId)
          .single()

        if (reservationError) {
          logger.error('予約データ取得エラー:', reservationError)
        }

        const customerEmail = selectedRequest?.customer_email || updatedReservation?.customer_email
        const customerName = selectedRequest?.customer_name
        if (customerEmail && customerName) {
          // GMの名前を取得
          const { data: gmStaff, error: gmError } = await supabase
            .from('staff')
            .select('name')
            .eq('id', selectedGMId)
            .single()

          if (gmError) {
            logger.error('GM情報取得エラー:', gmError)
          }

          // 店舗の住所を取得
          const selectedStore = stores.find(s => s.id === selectedStoreId)
          const storeAddress = selectedStore?.address || undefined

          // total_priceまたはfinal_priceを使用（優先順位: final_price > total_price）
          const priceToUse = updatedReservation?.final_price || updatedReservation?.total_price || 0

          await supabase.functions.invoke('send-private-booking-confirmation', {
            body: {
              reservationId: requestId,
              customerEmail,
              customerName,
              scenarioTitle: selectedRequest?.scenario_title || '',
              eventDate: selectedCandidate.date,
              startTime: selectedCandidate.startTime,
              endTime: selectedCandidate.endTime,
              storeName: stores.find(s => s.id === selectedStoreId)?.name || '',
              storeAddress,
              participantCount: selectedRequest?.participant_count || 0,
              totalPrice: priceToUse,
              reservationNumber: selectedRequest?.reservation_number || updatedReservation?.reservation_number || '',
              gmName: gmStaff?.name || undefined,
              notes: selectedRequest?.notes || updatedReservation?.customer_notes || undefined
            }
          })
          logger.log('貸切予約確定メール送信成功:', customerEmail)
        }
      } catch (emailError) {
        logger.error('メール送信エラー:', emailError)
        // メール送信失敗しても承認処理は続行
      }

      onSuccess()
      return { success: true }
    } catch (error) {
      logger.error('承認エラー:', error)
      return { success: false, error: '承認処理中にエラーが発生しました' }
    } finally {
      setSubmitting(false)
    }
  }, [onSuccess, organizationId])

  // 却下クリック
  const handleRejectClick = useCallback((requestId: string) => {
    const defaultMessage = `誠に申し訳ございませんが、ご希望の日程では店舗の空きがなく、貸切での受付が難しい状況です。

別の日程でのご検討をお願いできますでしょうか。
または、通常公演へのご参加も歓迎しております。

ご不明点等ございましたら、お気軽にお問い合わせください。`
    
    setRejectionReason(defaultMessage)
    setRejectRequestId(requestId)
    setShowRejectDialog(true)
  }, [])

  // 却下確定
  const handleRejectConfirm = useCallback(async (selectedRequest?: PrivateBookingRequest | null) => {
    if (!rejectRequestId || !rejectionReason.trim()) return

    try {
      setSubmitting(true)

      // 予約情報を取得（メール送信用）
      const { data: reservation, error: fetchError } = await supabase
        .from('reservations')
        .select('*, customers(*)')
        .eq('id', rejectRequestId)
        .single()

      if (fetchError) throw fetchError

      // 予約をキャンセル（在庫返却 + 通知）
      // 貸切予約の却下なので、reservationApi.cancel()を使用してキャンセル待ち通知も送信
      await reservationApi.cancel(rejectRequestId, rejectionReason)

      // 却下メール（貸切専用）を送信
      if (reservation && reservation.customers) {
        try {
          // 候補日時を取得
          const candidateDates = reservation.candidate_datetimes?.candidates?.map((c: any) => ({
            date: c.date,
            startTime: c.startTime,
            endTime: c.endTime
          })) || []

          await supabase.functions.invoke('send-private-booking-rejection', {
            body: {
              reservationId: reservation.id,
              customerEmail: reservation.customers.email,
              customerName: reservation.customers.name,
              scenarioTitle: reservation.scenario_title || '',
              rejectionReason: rejectionReason,
              candidateDates: candidateDates.length > 0 ? candidateDates : undefined
            }
          })
          logger.log('貸切リクエスト却下メール送信成功')
        } catch (emailError) {
          logger.error('却下メール送信エラー:', emailError)
          // メール送信失敗しても却下処理は続行
        }
      }

      setRejectionReason('')
      setShowRejectDialog(false)
      setRejectRequestId(null)
      onSuccess()
    } catch (error) {
      logger.error('却下エラー:', error)
    } finally {
      setSubmitting(false)
    }
  }, [rejectRequestId, rejectionReason, onSuccess])

  // 却下キャンセル
  const handleRejectCancel = useCallback(() => {
    setShowRejectDialog(false)
    setRejectRequestId(null)
    setRejectionReason('')
  }, [])

  return {
    submitting,
    showRejectDialog,
    rejectionReason,
    setRejectionReason,
    handleApprove,
    handleRejectClick,
    handleRejectConfirm,
    handleRejectCancel
  }
}

