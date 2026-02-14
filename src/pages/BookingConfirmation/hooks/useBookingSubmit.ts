import { useState } from 'react'
import { useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formatDate } from '../utils/bookingFormatters'
import { getCurrentParticipantsCount } from '@/lib/participantUtils'
import { reservationApi } from '@/lib/reservationApi'

/**
 * 参加費を計算する関数
 */
const calculateParticipationFee = async (scenarioId: string, startTime: string, date: string): Promise<number> => {
  // シナリオの料金設定を取得
  const { data: scenario, error } = await supabase
    .from('scenarios')
    .select('participation_fee, participation_costs')
    .eq('id', scenarioId)
    .single()

  if (error) {
    logger.error('シナリオ料金設定取得エラー:', error)
    throw new Error('料金情報の取得に失敗しました。ページを再読み込みしてください。')
  }

  if (!scenario) {
    throw new Error('シナリオ情報が見つかりません。')
  }

  // 基本料金（必須フィールド）
  const baseFeeRaw = scenario.participation_fee
  if (baseFeeRaw === null || baseFeeRaw === undefined) {
    throw new Error('このシナリオの料金設定がありません。管理者にお問い合わせください。')
  }
  
  let baseFee = baseFeeRaw

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

    // 2. 同じ日時の別公演への予約をチェック（schedule_eventsから正確な時間を取得）
    if (eventDate && startTime && customerEmail) {
      // 同じ日付の予約を取得（schedule_eventsと結合して正確な公演時間を取得）
      const { data: sameTimeReservations, error: sameTimeError } = await supabase
        .from('reservations')
        .select(`
          id, 
          participant_count, 
          customer_name, 
          reservation_number,
          schedule_event_id,
          title,
          schedule_events!schedule_event_id (
            date,
            start_time,
            end_time,
            scenarios (
              title,
              duration
            )
          )
        `)
        .eq('customer_email', customerEmail)
        .in('status', ['pending', 'confirmed', 'gm_confirmed'])
        .neq('schedule_event_id', eventId)
      
      if (!sameTimeError && sameTimeReservations && sameTimeReservations.length > 0) {
        // 予約しようとしている公演の時間帯を計算
        const targetStartTime = new Date(`${eventDate}T${startTime}`)
        // デフォルト公演時間: 180分（3時間）
        const DEFAULT_DURATION_MS = 180 * 60 * 1000
        const targetEndTime = new Date(targetStartTime.getTime() + DEFAULT_DURATION_MS)
        
        for (const res of sameTimeReservations) {
          const scheduleEvent = res.schedule_events as { 
            date?: string; 
            start_time?: string; 
            end_time?: string;
            scenarios?: { title?: string; duration?: number } 
          } | null
          
          if (!scheduleEvent?.date || !scheduleEvent?.start_time) continue
          
          // 同じ日付かチェック
          if (scheduleEvent.date !== eventDate) continue
          
          const resStartTime = new Date(`${scheduleEvent.date}T${scheduleEvent.start_time}`)
          
          // 終了時間を計算（end_timeがあれば使用、なければdurationから計算）
          let resEndTime: Date
          if (scheduleEvent.end_time) {
            resEndTime = new Date(`${scheduleEvent.date}T${scheduleEvent.end_time}`)
          } else {
            const durationMs = ((scheduleEvent.scenarios?.duration || 180) + 30) * 60 * 1000 // 公演時間 + 30分バッファ
            resEndTime = new Date(resStartTime.getTime() + durationMs)
          }
          
          // 時間帯の重複チェック
          // 重複条件: 新予約の開始 < 既存の終了 かつ 新予約の終了 > 既存の開始
          const isOverlapping = targetStartTime < resEndTime && targetEndTime > resStartTime
          
          if (isOverlapping) {
            return { 
              hasDuplicate: true, 
              existingReservation: { 
                ...res,
                isTimeConflict: true,
                conflictEventTitle: scheduleEvent.scenarios?.title || res.title
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
  startTime: string,
  customerEmail?: string
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
      return { allowed: false, reason: '予約制限の確認に失敗しました。時間をおいて再度お試しください。' }
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
        return { allowed: false, reason: '予約制限の確認に失敗しました。時間をおいて再度お試しください。' }
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

    // 過去日付チェック（安全対策）
    const eventDateTime = new Date(`${eventDate}T${startTime}`)
    const now = new Date()
    if (eventDateTime < now) {
      return { allowed: false, reason: 'この公演は既に開始されています' }
    }

    // 予約締切チェック
    if (eventData.reservation_deadline_hours !== null && eventData.reservation_deadline_hours !== undefined) {
      const deadlineHours = eventData.reservation_deadline_hours
      const hoursUntilEvent = (eventDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
      
      if (hoursUntilEvent < deadlineHours) {
        const reason = deadlineHours === 0
          ? '予約締切は公演開始までです'
          : `予約締切は公演開始の${deadlineHours}時間前です`
        return { allowed: false, reason }
      }
    }

    // 予約設定の制限チェック
    if (reservationSettings) {
      // 当日予約締切（時間前）
      if (reservationSettings.same_day_booking_cutoff !== null && reservationSettings.same_day_booking_cutoff !== undefined) {
        const todayYmd = now.toISOString().slice(0, 10)
        if (eventDate === todayYmd) {
          const hoursUntilEvent = (eventDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
          if (hoursUntilEvent < reservationSettings.same_day_booking_cutoff) {
            return { allowed: false, reason: `当日予約は公演開始の${reservationSettings.same_day_booking_cutoff}時間前までです` }
          }
        }
      }

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

      // 顧客ごとの予約件数制限（同日）
      if (reservationSettings.max_bookings_per_customer && reservationSettings.max_bookings_per_customer > 0 && customerEmail) {
        const { data: bookings, error: bookingsError } = await supabase
          .from('reservations')
          .select(
            `
            id,
            schedule_events!schedule_event_id (
              date
            )
          `
          )
          .eq('customer_email', customerEmail)
          .in('status', ['pending', 'confirmed', 'gm_confirmed'])
          .eq('schedule_events.date', eventDate)

        if (bookingsError) {
          logger.error('予約件数制限チェックエラー:', bookingsError)
          return { allowed: false, reason: '予約制限の確認に失敗しました。時間をおいて再度お試しください。' }
        }

        const count = bookings?.length || 0
        if (count >= reservationSettings.max_bookings_per_customer) {
          return { allowed: false, reason: `同日の予約は最大${reservationSettings.max_bookings_per_customer}件までです` }
        }
      }
    }

    return { allowed: true }
  } catch (error) {
    logger.error('予約制限チェックエラー:', error)
    return { allowed: false, reason: '予約制限の確認に失敗しました。時間をおいて再度お試しください。' } // fail-closed
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
  // 冪等性: 同一フォーム送信のリトライでは同じ予約番号を使う
  const reservationNumberRef = useRef<string | null>(null)
  const [completedReservation, setCompletedReservation] = useState<{
    reservationNumber: string
    participantCount: number
    totalPrice: number
    discountAmount?: number
  } | null>(null)

  /**
   * 予約を送信
   */
  const handleSubmit = async (
    customerName: string,
    customerEmail: string,
    customerPhone: string,
    participantCount: number,
    notes: string,
    customerNickname?: string,
    customerCouponId?: string | null
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
        props.startTime,
        customerEmail
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
              nickname: customerNickname || null,
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
              nickname: customerNickname || null,
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

      // 冪等性: 予約番号（YYMMDD-XXXX）を1回だけ生成してリトライでも固定
      if (!reservationNumberRef.current) {
        const now = new Date()
        const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
        reservationNumberRef.current = `${dateStr}-${randomStr}`
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
        organization_id: organizationId,
        reservation_number: reservationNumberRef.current,
        customer_coupon_id: customerCouponId || null
      } as any)

      // 予約確認メールを送信
      try {
        const emailResponse = await supabase.functions.invoke('send-booking-confirmation', {
          body: {
            reservationId: reservationData.id,
            organizationId,
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

      // 完了した予約情報を保存（サーバー側で計算された最終金額を使用）
      setCompletedReservation({
        reservationNumber: reservationData.reservation_number,
        participantCount: participantCount,
        totalPrice: reservationData.final_price ?? (props.participationFee * participantCount),
        discountAmount: reservationData.discount_amount ?? 0
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

