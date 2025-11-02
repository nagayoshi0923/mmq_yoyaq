import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { PrivateBookingRequest } from './usePrivateBookingData'

interface UseBookingApprovalProps {
  onSuccess: () => void
}

/**
 * 貸切リクエストの承認・却下処理を管理するフック
 */
export function useBookingApproval({ onSuccess }: UseBookingApprovalProps) {
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
  ) => {
    if (!selectedGMId || !selectedStoreId || !selectedCandidateOrder) {
      logger.error('承認に必要な情報が不足しています')
      return
    }

    try {
      setSubmitting(true)

      // 選択された候補日時のみを残す
      const selectedCandidate = selectedRequest?.candidate_datetimes?.candidates?.find(
        c => c.order === selectedCandidateOrder
      )
      
      if (!selectedCandidate) {
        setSubmitting(false)
        return
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

      // 予約ステータスを更新
      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'confirmed',
          gm_staff: selectedGMId,
          store_id: selectedStoreId,
          candidate_datetimes: updatedCandidateDatetimes,
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId)

      if (error) throw error

      // スケジュールに記録
      const startTime = new Date(`${selectedCandidate.date}T${selectedCandidate.startTime}:00`)
      const endTime = new Date(`${selectedCandidate.date}T${selectedCandidate.endTime}:00`)
      const selectedStore = stores.find(s => s.id === selectedStoreId)
      const storeName = selectedStore?.name || '店舗不明'

      if (selectedCandidate.date && selectedCandidate.startTime && selectedCandidate.endTime && storeName) {
        const { error: scheduleError } = await supabase
          .from('schedule_events')
          .insert({
            date: selectedCandidate.date,
            venue: storeName,
            scenario: selectedRequest?.scenario_title || '',
            start_time: selectedCandidate.startTime,
            end_time: selectedCandidate.endTime,
            start_at: startTime.toISOString(),
            end_at: endTime.toISOString(),
            store_id: selectedStoreId,
            gms: selectedGMId ? [selectedGMId] : [],
            is_reservation_enabled: true,
            status: 'confirmed',
            category: 'open'
          })

        if (scheduleError) {
          logger.error('スケジュール記録エラー:', scheduleError)
        } else {
          logger.log('スケジュール記録完了')
        }
      }

      // 貸切予約確定メールを送信
      try {
        const customerEmail = selectedRequest?.customer_email
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
              totalPrice: selectedRequest?.total_price || 0,
              reservationNumber: selectedRequest?.reservation_number || '',
              gmName: gmStaff?.name || undefined,
              notes: selectedRequest?.notes || undefined
            }
          })
          logger.log('貸切予約確定メール送信成功:', customerEmail)
        }
      } catch (emailError) {
        logger.error('メール送信エラー:', emailError)
        // メール送信失敗しても承認処理は続行
      }

      onSuccess()
    } catch (error) {
      logger.error('承認エラー:', error)
    } finally {
      setSubmitting(false)
    }
  }, [onSuccess])

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

      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'cancelled',
          cancellation_reason: rejectionReason,
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', rejectRequestId)

      if (error) throw error

      // 却下メールを送信
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

