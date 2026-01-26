import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formatDate } from '../utils/bookingFormatters'
import { getCurrentParticipantsCount } from '@/lib/participantUtils'
import { reservationApi } from '@/lib/reservationApi'

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
      const timeSlotCost = scenario.participation_costs.find((cost: { time_slot: string; status: string; type: string; amount: number }) => 
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
 * 重複予約をチェックする関数
 * @param eventId - 予約しようとしている公演ID
 * @param customerEmail - 顧客メールアドレス
 * @param customerPhone - 顧客電話番号（オプション）
 * @param eventDate - 公演日付（同時間帯チェック用）
 * @param startTime - 公演開始時間（同時間帯チェック用）
 */
export const checkDuplicateReservation = async (
  eventId: string,
  customerEmail: string,
  customerPhone?: string,
  eventDate?: string,
  startTime?: string
): Promise<{ hasDuplicate: boolean; existingReservation?: any; isTimeConflict?: boolean }> => {
  try {
    // 1. 同じ公演に対する既存の予約を確認
    let query = supabase
      .from('reservations')
      .select('id, participant_count, customer_name, customer_email, reservation_number, schedule_event_id')
      .eq('schedule_event_id', eventId)
      .in('status', ['pending', 'confirmed', 'gm_confirmed'])

    // メールアドレスでチェック
    if (customerEmail) {
      query = query.eq('customer_email', customerEmail)
    }

    const { data, error } = await query.limit(1)

    if (error) {
      logger.error('重複予約チェックエラー:', error)
      return { hasDuplicate: false }
    }

    if (data && data.length > 0) {
      return { hasDuplicate: true, existingReservation: data[0] }
    }

    // 電話番号でも追加チェック（メールが見つからなかった場合）
    if (customerPhone && !data?.length) {
      const { data: phoneData, error: phoneError } = await supabase
        .from('reservations')
        .select('id, participant_count, customer_name, customer_phone, reservation_number')
        .eq('schedule_event_id', eventId)
        .eq('customer_phone', customerPhone)
        .in('status', ['pending', 'confirmed', 'gm_confirmed'])
        .limit(1)

      if (phoneError) {
        logger.error('電話番号での重複予約チェックエラー:', phoneError)
        return { hasDuplicate: false }
      }

      if (phoneData && phoneData.length > 0) {
        return { hasDuplicate: true, existingReservation: phoneData[0] }
      }
    }

    // 2. 同じ日時の別公演への予約をチェック
    if (eventDate && startTime && customerEmail) {
      // 同じ日付の予約を取得（公演時間情報も含める）
      const { data: sameTimeReservations, error: sameTimeError } = await supabase
        .from('reservations')
        .select(`
          id, 
          participant_count, 
          customer_name, 
          reservation_number,
          schedule_event_id,
          requested_datetime,
          duration,
          title
        `)
        .eq('customer_email', customerEmail)
        .in('status', ['pending', 'confirmed', 'gm_confirmed'])
        .neq('schedule_event_id', eventId)
      
      if (!sameTimeError && sameTimeReservations && sameTimeReservations.length > 0) {
        // 予約しようとしている公演の時間帯を計算
        const targetStartTime = new Date(`${eventDate}T${startTime}`)
        // デフォルト公演時間: 120分（2時間）
        const DEFAULT_DURATION_MS = 120 * 60 * 1000
        const targetEndTime = new Date(targetStartTime.getTime() + DEFAULT_DURATION_MS)
        
        for (const res of sameTimeReservations) {
          if (!res.requested_datetime) continue
          
          const resStartTime = new Date(res.requested_datetime)
          
          // 同じ日付かチェック
          if (resStartTime.toDateString() !== targetStartTime.toDateString()) continue
          
          // 既存予約の終了時間を計算
          const resDurationMs = (res.duration || 120) * 60 * 1000
          const resEndTime = new Date(resStartTime.getTime() + resDurationMs)
          
          // 時間帯の重複チェック
          // 重複条件: 新予約の開始 < 既存の終了 かつ 新予約の終了 > 既存の開始
          const isOverlapping = targetStartTime < resEndTime && targetEndTime > resStartTime
          
          if (isOverlapping) {
            return { 
              hasDuplicate: true, 
              existingReservation: { 
                ...res,
                isTimeConflict: true
              },
              isTimeConflict: true
            }
          }
        }
      }
    }

    return { hasDuplicate: false }
  } catch (error) {
    logger.error('重複予約チェックエラー:', error)
    return { hasDuplicate: false }
  }
}

/**
 * 🚨 CRITICAL: 予約制限をチェックする関数
 * 
 * 重要: 空席チェックは予約テーブルから直接集計した値を使用します。
 * DBのcurrent_participantsは古い可能性があるため、信頼しません。
 */
const checkReservationLimits = async (
  eventId: string,
  participantCount: number,
  eventDate: string,
  startTime: string
): Promise<{ allowed: boolean; reason?: string }> => {
  try {
    // 公演の最大参加人数とstore_idを取得
    const { data: eventData, error: eventError } = await supabase
      .from('schedule_events')
      .select('max_participants, capacity, reservation_deadline_hours, store_id')
      .eq('id', eventId)
      .single()

    if (eventError) {
      logger.error('公演データ取得エラー:', eventError)
      return { allowed: true }
    }

    // 予約設定を取得（正しいstore_idを使用）
    let reservationSettings = null
    if (eventData.store_id) {
      const { data: settings, error: settingsError } = await supabase
        .from('reservation_settings')
        .select('max_participants_per_booking, advance_booking_days, same_day_booking_cutoff, max_bookings_per_customer')
        .eq('store_id', eventData.store_id)
        .maybeSingle()

      if (settingsError && settingsError.code !== 'PGRST116') {
        logger.error('予約設定取得エラー:', settingsError)
      } else {
        reservationSettings = settings
      }
    }

    // 最大参加人数（max_participants か capacity を使用）
    const maxParticipants = eventData.max_participants || eventData.capacity || 8

    // 最大参加人数チェック（1回の予約で定員を超える場合）
    if (participantCount > maxParticipants) {
      return { allowed: false, reason: `最大参加人数は${maxParticipants}名です` }
    }

    // 🚨 CRITICAL: 現在の参加人数を予約テーブルから直接集計
    // DBのcurrent_participantsは古い可能性があるため、信頼しない
    const currentParticipants = await getCurrentParticipantsCount(eventId)
    logger.log(`空席チェック: eventId=${eventId}, current=${currentParticipants}, max=${maxParticipants}, requesting=${participantCount}`)

    if ((currentParticipants + participantCount) > maxParticipants) {
      const available = maxParticipants - currentParticipants
      if (available <= 0) {
        return { allowed: false, reason: 'この公演は満席です' }
      }
      return { allowed: false, reason: `残り${available}名分の空きしかありません` }
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
  const [completedReservation, setCompletedReservation] = useState<{
    reservationNumber: string
    participantCount: number
    totalPrice: number
  } | null>(null)

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
      const eventDateTime = `${props.eventDate}T${props.startTime}`
      
      // 組織IDを取得
      const { data: eventOrg, error: eventOrgError } = await supabase
        .from('schedule_events')
        .select('organization_id')
        .eq('id', props.eventId)
        .single()

      if (eventOrgError) {
        logger.error('組織ID取得エラー:', eventOrgError)
        throw new Error('予約処理に失敗しました。もう一度お試しください。')
      }

      const organizationId = eventOrg.organization_id

      // 顧客レコードを取得または作成
      let customerId: string | null = null
      
      // #region agent log
      logger.log('[DEBUG-E] 顧客レコード処理開始', {userId:props.userId,customerEmail});
      fetch('http://127.0.0.1:7242/ingest/652dea74-319d-4149-8f63-f971b06e1aac',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useBookingSubmit.ts:customerStart',message:'顧客レコード処理開始',data:{userId:props.userId,customerEmail},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      try {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', props.userId)
          .single()
        
        // #region agent log
        logger.log('[DEBUG-E] 既存顧客チェック結果', {hasExisting:!!existingCustomer,existingId:existingCustomer?.id});
        fetch('http://127.0.0.1:7242/ingest/652dea74-319d-4149-8f63-f971b06e1aac',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useBookingSubmit.ts:customerCheck',message:'既存顧客チェック結果',data:{hasExisting:!!existingCustomer,existingId:existingCustomer?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
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
              email: customerEmail,
              organization_id: organizationId
            })
            .select('id')
            .single()
          
          // #region agent log
          logger.log('[DEBUG-E] 新規顧客作成結果', {success:!customerError,newCustomerId:newCustomer?.id,error:customerError?.message,organizationId});
          fetch('http://127.0.0.1:7242/ingest/652dea74-319d-4149-8f63-f971b06e1aac',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useBookingSubmit.ts:customerCreate',message:'新規顧客作成結果',data:{success:!customerError,newCustomerId:newCustomer?.id,error:customerError?.message,organizationId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          
          if (!customerError && newCustomer) {
            customerId = newCustomer.id
          }
        }
      } catch (error) {
        // #region agent log
        logger.log('[DEBUG-E] 顧客処理で例外発生', {error:String(error)});
        fetch('http://127.0.0.1:7242/ingest/652dea74-319d-4149-8f63-f971b06e1aac',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useBookingSubmit.ts:customerError',message:'顧客処理で例外発生',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        logger.error('顧客レコードの作成/更新エラー:', error)
      }
      
      if (!customerId) {
        throw new Error('顧客情報の取得に失敗しました。もう一度お試しください。')
      }

      const reservationData = await reservationApi.create({
        schedule_event_id: props.eventId,
        title: `${props.scenarioTitle} - ${formatDate(props.eventDate)}`,
        scenario_id: props.scenarioId,
        store_id: props.storeId || null,
        customer_id: customerId,
        requested_datetime: eventDateTime,
        duration: 180,
        participant_count: participantCount,
        base_price: calculatedFee * participantCount,
        options_price: 0,
        total_price: calculatedFee * participantCount,
        discount_amount: 0,
        final_price: calculatedFee * participantCount,
        unit_price: calculatedFee,
        payment_status: 'pending',
        status: 'confirmed',
        customer_notes: notes || null,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        reservation_source: 'web',
        created_by: props.userId,
        organization_id: organizationId
      })

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
            reservationNumber: reservationData.reservation_number
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

      // 完了した予約情報を保存
      setCompletedReservation({
        reservationNumber: reservationData.reservation_number,
        participantCount: participantCount,
        totalPrice: props.participationFee * participantCount
      })
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
    completedReservation,
    handleSubmit
  }
}

