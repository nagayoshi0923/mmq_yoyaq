import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId, QUEENS_WALTZ_ORG_ID } from '@/lib/organization'
import { logger } from '@/utils/logger'
import type { TimeSlot } from '../types'

// 貸切予約用RPCエラーコード → ユーザー向けメッセージのマッピング
const PRIVATE_BOOKING_ERROR_MESSAGES: Record<string, string> = {
  'P0001': '参加人数が正しくありません',
  'P0020': 'お名前を入力してください',
  'P0021': 'メールアドレスを入力してください',
  'P0022': '電話番号を入力してください',
  'P0023': '候補日時を選択してください',
  'P0024': 'シナリオが見つかりません',
  'P0025': '参加人数が上限を超えています',
  'P0009': '顧客情報が見つかりません',
  'P0011': 'この操作を行う権限がありません'
}

interface UsePrivateBookingSubmitProps {
  scenarioTitle: string
  scenarioId: string
  participationFee: number
  maxParticipants: number
  selectedTimeSlots: Array<{date: string, slot: TimeSlot}>
  selectedStoreIds: string[]
  stores: any[]
  userId?: string
}

/**
 * 貸切予約送信処理フック
 */
export function usePrivateBookingSubmit(props: UsePrivateBookingSubmitProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  /**
   * 貸切予約リクエストを送信
   */
  const handleSubmit = async (
    customerName: string,
    customerEmail: string,
    customerPhone: string,
    notes: string
  ) => {
    if (!props.userId) {
      throw new Error('ログインが必要です')
    }

    setIsSubmitting(true)

    try {
      // 顧客レコードを取得または作成
      let customerId: string | null = null
      
      try {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', props.userId)
          .single()
        
        if (existingCustomer) {
          customerId = existingCustomer.id
          
          await supabase
            .from('customers')
            .update({
              name: customerName,
              phone: customerPhone,
              email: customerEmail
            })
            .eq('id', customerId)
        } else {
          // organization_idを取得（ログインユーザーから、またはデフォルト）
          const organizationId = await getCurrentOrganizationId() || QUEENS_WALTZ_ORG_ID
          
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              user_id: props.userId,
              name: customerName,
              phone: customerPhone,
              email: customerEmail,
              organization_id: organizationId
            })
            .select('id')
            .single()
          
          if (!customerError && newCustomer) {
            customerId = newCustomer.id
          }
        }
      } catch (error) {
        logger.error('顧客レコードの作成/更新エラー:', error)
      }

      if (!customerId) {
        throw new Error('顧客情報の取得に失敗しました。もう一度お試しください。')
      }

      // 候補日時のバリデーション
      if (props.selectedTimeSlots.length === 0) {
        throw new Error('候補日時を選択してください')
      }
      
      const firstSlot = props.selectedTimeSlots[0]
      
      // 日付形式のバリデーション
      if (!firstSlot.date || !firstSlot.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        logger.error('無効な日付形式:', firstSlot.date)
        throw new Error('日付が正しく設定されていません。最初からやり直してください。')
      }
      
      // 親予約番号を生成（全候補で共通）(YYMMDD-XXXX形式: 11桁)
      const now = new Date()
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
      const baseReservationNumber = `${dateStr}-${randomStr}`
      
      // 候補日時をJSONB形式で準備
      const candidateDatetimes = {
        candidates: props.selectedTimeSlots.map((slot, index) => ({
          order: index + 1,
          date: slot.date,
          timeSlot: slot.slot.label,
          startTime: slot.slot.startTime,
          endTime: slot.slot.endTime,
          status: 'pending'
        })),
        requestedStores: props.selectedStoreIds.map(id => {
          const store = props.stores.find(s => s.id === id)
          return {
            storeId: id,
            storeName: store?.name || '',
            storeShortName: store?.short_name || ''
          }
        })
      }
      
      // RPC経由で貸切予約を作成（サーバー側でバリデーション・料金計算を強制）
      const { data: reservationId, error: rpcError } = await supabase.rpc('create_private_booking_request', {
        p_scenario_id: props.scenarioId,
        p_customer_id: customerId,
        p_customer_name: customerName,
        p_customer_email: customerEmail,
        p_customer_phone: customerPhone,
        p_participant_count: props.maxParticipants,
        p_candidate_datetimes: candidateDatetimes,
        p_notes: notes || null,
        p_reservation_number: baseReservationNumber  // 冪等性キー
      })
      
      if (rpcError) {
        logger.error('貸切リクエストエラー:', rpcError)
        const errorCode = rpcError.code || ''
        const errorMessage = PRIVATE_BOOKING_ERROR_MESSAGES[errorCode] || '貸切リクエストの送信に失敗しました。もう一度お試しください。'
        throw new Error(errorMessage)
      }

      // 予約IDを取得（RPC戻り値からの取得）
      const parentReservationId = reservationId as string
      
      // 予約情報を取得（メール送信用）
      const { data: parentReservation } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', parentReservationId)
        .single()

      // GM確認レコードはRPC関数内で作成済み

      // 貸切申し込み完了メールを送信
      if (parentReservationId && customerEmail) {
        try {
          const candidateDates = candidateDatetimes.candidates.map(c => ({
            date: c.date,
            timeSlot: c.timeSlot,
            startTime: c.startTime,
            endTime: c.endTime
          }))

          const { error: emailError } = await supabase.functions.invoke('send-private-booking-request-confirmation', {
            body: {
              reservationId: parentReservationId,
              customerEmail,
              customerName,
              scenarioTitle: props.scenarioTitle,
              reservationNumber: baseReservationNumber,
              candidateDates,
              requestedStores: candidateDatetimes.requestedStores,
              participantCount: props.maxParticipants,
              estimatedPrice: props.participationFee * props.maxParticipants,
              notes: notes || undefined
            }
          })

          if (emailError) {
            logger.error('貸切申し込み完了メール送信エラー:', emailError)
            // メール送信エラーは予約処理の失敗とはしない
          } else {
            logger.log('貸切申し込み完了メールを送信しました')
          }
        } catch (emailError) {
          logger.error('貸切申し込み完了メール送信エラー:', emailError)
          // メール送信エラーは予約処理の失敗とはしない
        }
      }

      // Discord通知はSupabase Webhookで自動送信されるため、ここでは呼び出さない
      // （reservationsテーブルへのINSERT時にnotify-private-booking-discordが発火）

      setSuccess(true)
      
    } catch (error) {
      logger.error('貸切リクエスト処理エラー:', error)
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    isSubmitting,
    success,
    handleSubmit
  }
}

