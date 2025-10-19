import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formatDate } from '../utils/bookingFormatters'

interface UseBookingSubmitProps {
  eventId: string
  scenarioTitle: string
  scenarioId: string
  storeId?: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  storeAddress?: string
  participationFee: number
  currentParticipants: number
  userId?: string
}

/**
 * 予約送信処理フック
 */
export function useBookingSubmit(props: UseBookingSubmitProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  /**
   * 予約を送信
   */
  const handleSubmit = async (
    customerName: string,
    customerEmail: string,
    customerPhone: string,
    participantCount: number,
    notes: string
  ) => {
    if (!props.userId) {
      throw new Error('ログインが必要です')
    }

    setIsSubmitting(true)

    try {
      // 予約番号を生成
      const reservationNumber = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`
      const eventDateTime = `${props.eventDate}T${props.startTime}`
      
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
          
          // 顧客情報を更新
          await supabase
            .from('customers')
            .update({
              name: customerName,
              phone: customerPhone,
              email: customerEmail
            })
            .eq('id', customerId)
        } else {
          // 新規顧客レコードを作成
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              user_id: props.userId,
              name: customerName,
              phone: customerPhone,
              email: customerEmail
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
      
      // 予約データを作成
      const { data: reservationData, error: reservationError } = await supabase
        .from('reservations')
        .insert({
          event_id: props.eventId,
          schedule_event_id: props.eventId,
          title: `${props.scenarioTitle} - ${formatDate(props.eventDate)}`,
          reservation_number: reservationNumber,
          scenario_id: props.scenarioId,
          store_id: props.storeId || null,
          customer_id: customerId,
          requested_datetime: eventDateTime,
          actual_datetime: eventDateTime,
          duration: 180,
          participant_count: participantCount,
          base_price: props.participationFee * participantCount,
          total_price: props.participationFee * participantCount,
          final_price: props.participationFee * participantCount,
          status: 'confirmed',
          customer_notes: notes || null,
          created_by: props.userId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone
        })
        .select()
        .single()

      if (reservationError) {
        logger.error('予約エラー:', reservationError)
        throw new Error('予約の作成に失敗しました。もう一度お試しください。')
      }

      // 公演の参加者数を更新
      const { error: updateError } = await supabase
        .from('schedule_events')
        .update({
          current_participants: props.currentParticipants + participantCount
        })
        .eq('id', props.eventId)

      if (updateError) {
        logger.error('参加者数の更新エラー:', updateError)
      }

      // 予約確認メールを送信
      try {
        const emailResponse = await supabase.functions.invoke('send-booking-confirmation', {
          body: {
            reservationId: reservationData.id,
            customerEmail: customerEmail,
            customerName: customerName,
            scenarioTitle: props.scenarioTitle,
            eventDate: props.eventDate,
            startTime: props.startTime,
            endTime: props.endTime,
            storeName: props.storeName,
            storeAddress: props.storeAddress,
            participantCount: participantCount,
            totalPrice: props.participationFee * participantCount,
            reservationNumber: reservationNumber
          }
        })

        if (emailResponse.error) {
          logger.error('メール送信エラー:', emailResponse.error)
        } else {
          logger.log('予約確認メールを送信しました')
        }
      } catch (emailError) {
        logger.error('メール送信処理エラー:', emailError)
      }

      setSuccess(true)
      
    } catch (error) {
      logger.error('予約処理エラー:', error)
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

