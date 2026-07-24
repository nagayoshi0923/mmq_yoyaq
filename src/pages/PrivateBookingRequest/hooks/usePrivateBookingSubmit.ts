import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveOrgIdFromPageContext } from '@/lib/organization'

// ページの組織コンテキスト（URLスラッグ / ?org=）を最優先で解決する。
// ログインユーザーの所属組織を優先すると、組織スタッフが他組織のページから
// 申し込んだ際に自組織へ紐づいてしまうため必ずこちらを使う。
const resolveOrgId = resolveOrgIdFromPageContext
import { logger } from '@/utils/logger'
import { hasNonEmptyCustomerPhone, MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING } from '@/lib/customerPhonePolicy'
import { GLOBAL_SETTINGS_MSG_SELECT } from '@/lib/constants'
import type { TimeSlot } from '../types'
import type { RpcCreatePrivateBookingRequestParams } from '@/lib/rpcTypes'
import { updatePrivateGroupStatus } from '@/lib/privateGroupStatus'
import {
  formatBlockedCandidateLabel,
  getPrivateBookingCandidateBlockedState,
  type PrivateBookingBlockedSlotRow,
} from '@/lib/privateBookingBlockedSlotAvailability'
import { timeStrToMinutes } from '@/lib/privateBookingSlotAvailability'
import type { RpcGetPublicPrivateBookingAvailabilityParams } from '@/lib/rpcTypes'

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
  'P0011': 'この操作を行う権限がありません',
  'P0030': '候補日時に既存の公演との競合があります。日時と希望店舗を再選択してください。',
  'P0040': '候補日時が現在受付停止中です。日時と希望店舗を再選択してください。',
  'P0041': '候補日時の時間帯が正しくありません。日時を再選択してください。',
  'P0042': '希望店舗が正しくありません。店舗を再選択してください。',
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
  groupId?: string
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
    notes: string,
    customerNickname?: string,
    groupIdOverride?: string
  ) => {
    // groupIdOverride が渡された場合はそちらを優先（送信時に作成されたグループID）
    const effectiveGroupId = groupIdOverride || props.groupId
    if (!props.userId) {
      throw new Error('ログインが必要です')
    }

    if (!hasNonEmptyCustomerPhone(customerPhone)) {
      throw new Error(MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING)
    }

    setIsSubmitting(true)

    try {
      // 顧客レコードを取得または作成
      // platform customers は organization_id = NULL なので user_id のみで検索
      let customerId: string | null = null
      const organizationId = await resolveOrgId()
      if (!organizationId) throw new Error('組織情報が取得できません')

      if (props.selectedTimeSlots.length === 0) {
        throw new Error('候補日時を選択してください')
      }
      if (props.selectedStoreIds.length === 0) {
        throw new Error('希望店舗を1店舗以上選択してください')
      }
      const invalidDate = props.selectedTimeSlots.find(
        (slot) => !slot.date || !slot.date.match(/^\d{4}-\d{2}-\d{2}$/)
      )
      if (invalidDate) {
        logger.error('無効な日付形式:', invalidDate.date)
        throw new Error('日付が正しく設定されていません。最初からやり直してください。')
      }

      // 送信直前に募集停止と公演競合を再取得する。画面を開いた後の変更を古い状態で通さない。
      const sortedDates = props.selectedTimeSlots.map((slot) => slot.date).sort()
      const availabilityParams: RpcGetPublicPrivateBookingAvailabilityParams = {
        p_organization_id: organizationId,
        p_store_ids: props.selectedStoreIds,
        p_start_date: sortedDates[0],
        p_end_date: sortedDates[sortedDates.length - 1],
      }
      const [blockedResult, eventsResult] = await Promise.all([
        supabase.rpc('get_public_private_booking_availability', availabilityParams),
        supabase
          .from('schedule_events_for_availability')
          .select('date, store_id, start_time, end_time, is_cancelled')
          .filter('organization_id', 'eq', organizationId)
          .in('store_id', props.selectedStoreIds)
          .gte('date', sortedDates[0])
          .lte('date', sortedDates[sortedDates.length - 1])
          .eq('is_cancelled', false),
      ])
      if (blockedResult.error) throw blockedResult.error
      if (eventsResult.error) throw eventsResult.error

      const latestBlockedRows = (blockedResult.data || []) as PrivateBookingBlockedSlotRow[]
      const latestEvents = eventsResult.data || []
      const unavailableCandidates = props.selectedTimeSlots.flatMap((candidate) => {
        const blockedState = getPrivateBookingCandidateBlockedState(
          { date: candidate.date, timeSlot: candidate.slot.label },
          props.selectedStoreIds,
          latestBlockedRows
        )
        const viableStoreIds = blockedState.availableStoreIds.filter((storeId) => {
          const start = timeStrToMinutes(candidate.slot.startTime)
          const end = timeStrToMinutes(candidate.slot.endTime)
          if (start == null || end == null) return false
          return !latestEvents.some((event) => {
            if (event.store_id !== storeId || event.date !== candidate.date) return false
            const eventStart = timeStrToMinutes(event.start_time)
            const eventEnd = timeStrToMinutes(event.end_time)
            if (eventStart == null || eventEnd == null) return true
            return eventStart < end + 60 && eventEnd > start - 60
          })
        })
        if (viableStoreIds.length > 0) return []
        const targetStoreIds = blockedState.allStoresBlocked
          ? blockedState.blockedStoreIds
          : props.selectedStoreIds
        const storeNames = targetStoreIds.map((storeId) => {
          const store = props.stores.find((item) => item.id === storeId)
          return store?.short_name || store?.name || storeId
        })
        return [{
          label: formatBlockedCandidateLabel(
            { date: candidate.date, timeSlot: candidate.slot.label },
            storeNames
          ),
          reason: blockedState.allStoresBlocked ? 'blocked' : 'conflict',
        }]
      })
      if (unavailableCandidates.length > 0) {
        const details = unavailableCandidates.map((candidate) => candidate.label).join('、')
        const hasBlocked = unavailableCandidates.some((candidate) => candidate.reason === 'blocked')
        throw new Error(
          hasBlocked
            ? `${details} は現在受付停止中です。日時または希望店舗を再選択してください。`
            : `${details} は既存公演と競合しています。日時または希望店舗を再選択してください。`
        )
      }

      try {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', props.userId)
          .maybeSingle()

        if (existingCustomer) {
          customerId = existingCustomer.id

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
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              user_id: props.userId,
              name: customerName,
              nickname: customerNickname || null,
              phone: customerPhone,
              email: customerEmail,
              organization_id: null,
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

      const firstSlot = props.selectedTimeSlots[0]
      
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
      
      // パラメータをログに出力
      logger.log('[貸切リクエスト] RPCパラメータ:', {
        p_scenario_id: props.scenarioId,
        p_customer_id: customerId,
        p_participant_count: props.maxParticipants,
        p_candidate_datetimes: candidateDatetimes,
        p_private_group_id: effectiveGroupId || null
      })
      
      // RPC経由で貸切予約を作成（サーバー側でバリデーション・料金計算を強制）
      const createPrivateParams: RpcCreatePrivateBookingRequestParams = {
        p_scenario_id: props.scenarioId,
        p_customer_id: customerId,
        p_customer_name: customerName,
        p_customer_email: customerEmail,
        p_customer_phone: customerPhone,
        p_participant_count: props.maxParticipants,
        p_candidate_datetimes: candidateDatetimes,
        p_notes: notes || null,
        p_reservation_number: baseReservationNumber,
        p_private_group_id: effectiveGroupId || null,
      }
      const { data: reservationId, error: rpcError } = await supabase.rpc('create_private_booking_request', createPrivateParams)
      
      if (rpcError) {
        logger.error('[貸切リクエスト] RPC エラー詳細:', {
          code: rpcError.code,
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint
        })
        logger.error('貸切リクエストエラー:', rpcError)
        const errorCode = rpcError.code || ''
        const errorMessage = PRIVATE_BOOKING_ERROR_MESSAGES[errorCode] || `貸切リクエストの送信に失敗しました: ${rpcError.message || 'もう一度お試しください。'}`
        throw new Error(errorMessage)
      }

      // 予約IDを取得（RPC戻り値からの取得）
      const parentReservationId = reservationId as string
      logger.log('[貸切リクエスト] RPC成功', { reservationId: parentReservationId, effectiveGroupId })

      // GM確認レコードはRPC関数内で作成済み

      // グループのステータスを「申込済み」に更新し、予約IDを紐付け
      logger.log('[貸切リクエスト] グループステータス更新チェック', { effectiveGroupId, parentReservationId })
      if (effectiveGroupId && parentReservationId) {
        logger.log('[貸切リクエスト] グループステータス更新開始')
        let groupUpdateError: Error | null = null
        try {
          await updatePrivateGroupStatus(effectiveGroupId, 'booking_requested', { reservationId: parentReservationId })
        } catch (err: any) {
          groupUpdateError = err
        }
        if (groupUpdateError) {
          logger.error('[貸切リクエスト] グループステータス更新エラー:', groupUpdateError)
          logger.error('グループステータス更新エラー:', groupUpdateError)
        } else {
          logger.log('[貸切リクエスト] グループステータス更新成功')
          logger.log('グループステータスを「申込済み」に更新しました')
          
          // 予約申込のシステムメッセージを送信
          try {
            // 主催者のメンバーIDを取得
            const { data: organizerMember } = await supabase
              .from('private_group_members')
              .select('id')
              .eq('group_id', effectiveGroupId)
              .eq('is_organizer', true)
              .single()
            
            if (organizerMember) {
              // 設定からメッセージ文言を取得
              const msgOrgId = await resolveOrgId()
              const { data: msgSettings } = await supabase
                .from('global_settings')
                .select(GLOBAL_SETTINGS_MSG_SELECT.BOOKING_REQUESTED)
                .eq('organization_id', msgOrgId)
                .maybeSingle()
              
              const systemMessage = JSON.stringify({
                type: 'system',
                action: 'booking_requested',
                candidateCount: candidateDatetimes.candidates.length,
                // 設定されたメッセージ文言を含める
                title: msgSettings?.system_msg_booking_requested_title || '貸切リクエストを送信しました',
                body: msgSettings?.system_msg_booking_requested_body || '店舗より日程確定のご連絡をいたしますので、しばらくお待ちください。'
              })
              
              await supabase.from('private_group_messages').insert({
                group_id: effectiveGroupId,
                member_id: organizerMember.id,
                message: systemMessage
              })
            }
          } catch (msgError) {
            logger.error('システムメッセージ送信エラー:', msgError)
          }
        }
      } else {
        logger.warn('[貸切リクエスト] グループステータス更新スキップ', { effectiveGroupId, parentReservationId })
      }

      // 貸切申し込み完了メールを送信
      logger.log('[貸切リクエスト] メール送信チェック', { parentReservationId, customerEmail })
      if (parentReservationId && customerEmail) {
        logger.log('[貸切リクエスト] メール送信開始')
        try {
          const candidateDates = candidateDatetimes.candidates.map(c => ({
            date: c.date,
            timeSlot: c.timeSlot,
            startTime: c.startTime,
            endTime: c.endTime
          }))

          const orgId = await resolveOrgId()
          logger.log('[貸切リクエスト] メール送信 invoke開始', { orgId, reservationId: parentReservationId })
          const { error: emailError, data: emailData } = await supabase.functions.invoke('send-private-booking-request-confirmation', {
            body: {
              organizationId: orgId,
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

          logger.log('[貸切リクエスト] メール送信 invoke完了', { emailError, emailData })
          if (emailError) {
            logger.error('貸切申し込み完了メール送信エラー:', emailError)
            logger.error('[貸切リクエスト] メール送信エラー:', emailError)
          } else {
            logger.log('貸切申し込み完了メールを送信しました')
            logger.log('[貸切リクエスト] メール送信成功')
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
