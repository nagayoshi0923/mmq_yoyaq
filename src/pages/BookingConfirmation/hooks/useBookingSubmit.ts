import { calculateParticipationFee as calculateDateParticipationFee } from '@/pages/ScenarioDetailPage/utils/pricingUtils'
import { trackReservationComplete } from '@/lib/analytics'
import { useState } from 'react'
import { useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formatDate } from '../utils/bookingFormatters'
import { reservationApi } from '@/lib/reservationApi'
import { hasNonEmptyCustomerPhone, MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING } from '@/lib/customerPhonePolicy'
import { clearBookingDataSnapshot } from '@/pages/PublicBookingTop/utils/bookingDataSnapshot'
import { RESERVATION_SOURCE } from '@/lib/constants'

/**
 * 参加費を計算する関数
 */
const calculateParticipationFee = async (
  scenarioId: string,
  startTime: string,
  date: string,
  organizationId?: string
): Promise<number> => {
  // シナリオの料金設定を取得（organization_scenarios_with_master: 組織固有の participation_fee）
  let query = supabase
    .from('organization_scenarios_with_master')
    .select('participation_fee, participation_costs')
    .eq('id', scenarioId)
  if (organizationId) {
    query = query.eq('organization_id', organizationId)
  }
  const { data: scenario, error } = await query.maybeSingle()

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
  
  // 保存単価は reservationApi.create → 予約作成RPC側で独自休日を再取得して確定する。
  // ここは表示用の再計算なので、休日取得の一時失敗で予約自体を中断しない。
  const { data: holidays, error: holidayError } = await supabase.rpc(
    'get_public_custom_holidays', { p_organization_id: organizationId }
  )
  if (holidayError) {
    logger.warn('休日設定の取得に失敗（表示用）。予約作成側で再確定します:', holidayError)
  }
  const customHolidays: string[] = holidays?.[0]?.custom_holidays ?? []
  return calculateDateParticipationFee(baseFeeRaw, scenario.participation_costs, date,
    day => customHolidays.includes(day), startTime)
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
            scenario_masters:scenario_master_id (
              title,
              official_duration
            )
          )
        `)
        .eq('customer_email', customerEmail)
        .in('status', ['pending', 'confirmed', 'gm_confirmed'])
        .neq('schedule_event_id', eventId)
      
      if (!sameTimeError && sameTimeReservations && sameTimeReservations.length > 0) {
        // 予約しようとしている公演の時間帯を計算
        const targetStartTime = new Date(`${eventDate}T${startTime}+09:00`)
        // デフォルト公演時間: 180分（3時間）
        const DEFAULT_DURATION_MS = 180 * 60 * 1000
        const targetEndTime = new Date(targetStartTime.getTime() + DEFAULT_DURATION_MS)
        
        for (const res of sameTimeReservations) {
          const scheduleEvent = res.schedule_events as { 
            date?: string; 
            start_time?: string; 
            end_time?: string;
            scenario_masters?: { title?: string; official_duration?: number } 
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
            const durationMs = ((scheduleEvent.scenario_masters?.official_duration || 180) + 30) * 60 * 1000 // 公演時間 + 30分バッファ
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
                conflictEventTitle: scheduleEvent.scenario_masters?.title || res.title
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
export const checkReservationLimits = async (
  eventId: string,
  participantCount: number,
  eventDate: string,
  startTime: string
): Promise<{ allowed: boolean; reason?: string }> => {
  try {
    // 公演の最大参加人数・現在参加人数・store_idを取得（公開用ビュー）
    // current_participants はトリガーで常に再計算されるため、正確な集計値として使用
    const { data: eventData, error: eventError } = await supabase
      .from('schedule_events_public')
      .select('max_participants, capacity, current_participants, reservation_deadline_hours, store_id')
      .eq('id', eventId)
      .single()

    if (eventError) {
      logger.error('公演データ取得エラー:', eventError)
      return { allowed: false, reason: '予約制限の確認に失敗しました。時間をおいて再度お試しください。' }
    }

    // 最大参加人数（max_participants か capacity を使用）
    const maxParticipants = eventData.max_participants || eventData.capacity || 8

    // 最大参加人数チェック（1回の予約で定員を超える場合）
    if (participantCount > maxParticipants) {
      return { allowed: false, reason: `最大参加人数は${maxParticipants}名です` }
    }

    // 🚨 CRITICAL: 現在の参加人数を schedule_events_public.current_participants から取得
    // reservations テーブルは RLS により顧客自身の行しか見えないため直接集計できない。
    // current_participants はトリガー（recalc_current_participants_for_event）によって
    // INSERT/UPDATE/DELETE 後に常に再計算されるため、信頼できる集計値として使用する。
    const currentParticipants = eventData.current_participants ?? 0
    logger.log(`空席チェック: eventId=${eventId}, current=${currentParticipants}, max=${maxParticipants}, requesting=${participantCount}`)

    if ((currentParticipants + participantCount) > maxParticipants) {
      const available = maxParticipants - currentParticipants
      if (available <= 0) {
        return { allowed: false, reason: 'この公演は満席です' }
      }
      return { allowed: false, reason: `残り${available}名分の空きしかありません` }
    }

    // 過去日付チェック（安全対策）
    const eventDateTime = new Date(`${eventDate}T${startTime}+09:00`)
    const now = new Date()
    if (eventDateTime < now) {
      return { allowed: false, reason: 'この公演は既に開始されています' }
    }

    // 追加募集の判断待ちと、開催決定後の通常受付をDBと同じ締切で判断する。
    const { data: bookingWindows, error: bookingWindowError } = await supabase.rpc('get_performance_booking_window', { p_event_id: eventId })
    if (bookingWindowError) return { allowed: false, reason: '予約締切を確認できません。再度お試しください。' }
    const bookingDeadline = bookingWindows?.[0]?.effective_booking_deadline
    if (bookingDeadline && now.getTime() >= new Date(bookingDeadline).getTime()) {
      return { allowed: false, reason: '予約の受付期限を過ぎています' }
    }

    // 予約締切チェック
    if (!bookingDeadline && eventData.reservation_deadline_hours !== null && eventData.reservation_deadline_hours !== undefined) {
      const deadlineHours = eventData.reservation_deadline_hours
      const hoursUntilEvent = (eventDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
      
      if (hoursUntilEvent < deadlineHours) {
        const reason = deadlineHours === 0
          ? '予約締切は公演開始までです'
          : `予約締切は公演開始の${deadlineHours}時間前です`
        return { allowed: false, reason }
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
  organizationSlug?: string
}

/**
 * 予約送信処理フック
 */
export function useBookingSubmit(props: UseBookingSubmitProps) {
  const queryClient = useQueryClient()
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

    if (!hasNonEmptyCustomerPhone(customerPhone)) {
      throw new Error(MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING)
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

      // 組織IDを取得（料金計算と予約作成に必要）- 公開用ビュー
      const { data: eventOrg, error: eventOrgError } = await supabase
        .from('schedule_events_public')
        .select('organization_id')
        .eq('id', props.eventId)
        .single()

      if (eventOrgError) {
        logger.error('組織ID取得エラー:', eventOrgError)
        throw new Error('予約処理に失敗しました。もう一度お試しください。')
      }

      const organizationId = eventOrg.organization_id

      // 料金を計算（組織固有の participation_fee）
      const calculatedFee = await calculateParticipationFee(
        props.scenarioId,
        props.startTime,
        props.eventDate,
        organizationId
      )
      // JSTとして明示的に指定して保存（タイムゾーン不整合を防ぐ）
      const eventDateTime = `${props.eventDate}T${props.startTime}+09:00`

      // 顧客レコードを取得または作成
      let customerId: string | null = null
      
      try {
        // user_id でプラットフォーム共通の顧客レコードを検索
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', props.userId)
          .maybeSingle()

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
            .eq('user_id', props.userId)
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

      const { data: phoneRow, error: phoneVerifyError } = await supabase
        .from('customers')
        .select('phone')
        .eq('id', customerId)
        .eq('user_id', props.userId)
        .maybeSingle()
      if (phoneVerifyError || !hasNonEmptyCustomerPhone(phoneRow?.phone)) {
        throw new Error(MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING)
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
        scenario_master_id: props.scenarioId,
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
        reservation_source: RESERVATION_SOURCE.WEB,
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
            storeId: props.storeId,
            customerEmail: customerEmail,
            customerName: customerName,
            scenarioTitle: props.scenarioTitle,
            eventDate: props.eventDate,
            startTime: props.startTime,
            endTime: props.endTime,
            storeName: props.storeName,
            storeAddress: props.storeAddress,
            participantCount: participantCount,
            totalPrice: reservationData.final_price ?? (calculatedFee * participantCount),
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
      // Analytics must never change a successfully created reservation's outcome.
      try { trackReservationComplete(reservationData.id, props.organizationSlug) } catch { /* non-critical */ }

      // 予約完了後: トップページの残り席数が古い値を表示しないようキャッシュを無効化
      queryClient.invalidateQueries({ queryKey: ['booking-data'] })
      if (props.organizationSlug) {
        clearBookingDataSnapshot(props.organizationSlug)
      }

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

