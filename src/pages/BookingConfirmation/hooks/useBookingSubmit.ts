import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formatDate } from '../utils/bookingFormatters'

/**
 * 参加費を計算する関数
 */
const calculateParticipationFee = async (scenarioId: string, startTime: string, date: string): Promise<number> => {
  try {
    // シナリオの料金設定を取得
    const { data: scenario, error } = await supabase
      .from('scenarios')
      .select('participation_fee, participation_costs')
      .eq('id', scenarioId)
      .single()

    if (error) {
      logger.error('シナリオ料金設定取得エラー:', error)
      return 3000 // デフォルト料金
    }

    if (!scenario) return 3000

    // 基本料金
    let baseFee = scenario.participation_fee || 3000

    // 時間帯別料金設定をチェック
    if (scenario.participation_costs && scenario.participation_costs.length > 0) {
      const timeSlot = getTimeSlot(startTime)
      const timeSlotCost = scenario.participation_costs.find(cost => 
        cost.time_slot === timeSlot && cost.status === 'active'
      )

      if (timeSlotCost) {
        if (timeSlotCost.type === 'percentage') {
          baseFee = Math.round(baseFee * (1 + timeSlotCost.amount / 100))
        } else {
          baseFee = timeSlotCost.amount
        }
      }
    }

    return baseFee
  } catch (error) {
    logger.error('料金計算エラー:', error)
    return 3000 // デフォルト料金
  }
}

/**
 * 時間帯を判定する関数
 */
const getTimeSlot = (startTime: string): string => {
  const hour = parseInt(startTime.slice(0, 2))
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/**
 * 予約制限をチェックする関数
 */
const checkReservationLimits = async (
  eventId: string,
  participantCount: number,
  eventDate: string,
  startTime: string
): Promise<{ allowed: boolean; reason?: string }> => {
  try {
    // 予約設定を取得
    const { data: reservationSettings, error: settingsError } = await supabase
      .from('reservation_settings')
      .select('max_participants_per_booking, advance_booking_days, same_day_booking_cutoff, max_bookings_per_customer')
      .eq('store_id', eventId) // TODO: 実際のstore_idを取得する必要がある
      .maybeSingle()

    if (settingsError && settingsError.code !== 'PGRST116') {
      logger.error('予約設定取得エラー:', settingsError)
      return { allowed: true } // エラーの場合は制限しない
    }

    // 公演の最大参加人数をチェック
    const { data: eventData, error: eventError } = await supabase
      .from('schedule_events')
      .select('max_participants, current_participants, reservation_deadline_hours')
      .eq('id', eventId)
      .single()

    if (eventError) {
      logger.error('公演データ取得エラー:', eventError)
      return { allowed: true }
    }

    // 最大参加人数チェック
    if (eventData.max_participants && participantCount > eventData.max_participants) {
      return { allowed: false, reason: `最大参加人数は${eventData.max_participants}名です` }
    }

    // 現在の参加人数チェック
    const currentParticipants = eventData.current_participants || 0
    if (eventData.max_participants && (currentParticipants + participantCount) > eventData.max_participants) {
      return { allowed: false, reason: `残り${eventData.max_participants - currentParticipants}名分の空きしかありません` }
    }

    // 予約締切チェック
    if (eventData.reservation_deadline_hours) {
      const eventDateTime = new Date(`${eventDate}T${startTime}`)
      const now = new Date()
      const hoursUntilEvent = (eventDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
      
      if (hoursUntilEvent < eventData.reservation_deadline_hours) {
        return { allowed: false, reason: `予約締切は公演開始の${eventData.reservation_deadline_hours}時間前です` }
      }
    }

    // 予約設定の制限チェック
    if (reservationSettings) {
      // 1回の予約の最大参加人数
      if (reservationSettings.max_participants_per_booking && participantCount > reservationSettings.max_participants_per_booking) {
        return { allowed: false, reason: `1回の予約で最大${reservationSettings.max_participants_per_booking}名までです` }
      }

      // 事前予約日数制限
      if (reservationSettings.advance_booking_days) {
        const eventDateTime = new Date(`${eventDate}T${startTime}`)
        const now = new Date()
        const daysUntilEvent = (eventDateTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        
        if (daysUntilEvent > reservationSettings.advance_booking_days) {
          return { allowed: false, reason: `最大${reservationSettings.advance_booking_days}日前まで予約可能です` }
        }
      }
    }

    return { allowed: true }
  } catch (error) {
    logger.error('予約制限チェックエラー:', error)
    return { allowed: true } // エラーの場合は制限しない
  }
}

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
      // 予約制限をチェック
      const limitCheck = await checkReservationLimits(
        props.eventId,
        participantCount,
        props.eventDate,
        props.startTime
      )

      if (!limitCheck.allowed) {
        throw new Error(limitCheck.reason || '予約制限により予約できません')
      }

      // 料金を計算
      const calculatedFee = await calculateParticipationFee(
        props.scenarioId,
        props.startTime,
        props.eventDate
      )
      // 予約番号を生成 (YYMMDD-XXXX形式: 11桁)
      const now = new Date()
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
      const reservationNumber = `${dateStr}-${randomStr}`
      
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
          base_price: calculatedFee * participantCount,
          total_price: calculatedFee * participantCount,
          final_price: calculatedFee * participantCount,
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

