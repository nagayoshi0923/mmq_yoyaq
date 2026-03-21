import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId, QUEENS_WALTZ_ORG_ID } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { hasNonEmptyCustomerPhone, MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING } from '@/lib/customerPhonePolicy'
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
      let customerId: string | null = null
      const organizationId = await getCurrentOrganizationId() || QUEENS_WALTZ_ORG_ID
      
      try {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', props.userId)
          .eq('organization_id', organizationId)
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
            .eq('organization_id', organizationId)
        } else {
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              user_id: props.userId,
              name: customerName,
              nickname: customerNickname || null,
              phone: customerPhone,
              email: customerEmail,
              organization_id: organizationId,
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
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (phoneVerifyError || !hasNonEmptyCustomerPhone(phoneRow?.phone)) {
        throw new Error(MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING)
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
      
      // パラメータをログに出力
      console.log('[貸切リクエスト] RPCパラメータ:', {
        p_scenario_id: props.scenarioId,
        p_customer_id: customerId,
        p_participant_count: props.maxParticipants,
        p_candidate_datetimes: candidateDatetimes,
        p_private_group_id: effectiveGroupId || null
      })
      
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
        p_reservation_number: baseReservationNumber,  // 冪等性キー
        p_private_group_id: effectiveGroupId || null
      })
      
      if (rpcError) {
        console.error('[貸切リクエスト] RPC エラー詳細:', {
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
      console.log('[貸切リクエスト] RPC成功', { reservationId: parentReservationId, effectiveGroupId })

      // GM確認レコードはRPC関数内で作成済み

      // グループのステータスを「申込済み」に更新し、予約IDを紐付け
      console.log('[貸切リクエスト] グループステータス更新チェック', { effectiveGroupId, parentReservationId })
      if (effectiveGroupId && parentReservationId) {
        console.log('[貸切リクエスト] グループステータス更新開始')
        const { error: groupUpdateError } = await supabase
          .from('private_groups')
          .update({
            status: 'booking_requested',
            reservation_id: parentReservationId
          })
          .eq('id', effectiveGroupId)
        
        if (groupUpdateError) {
          console.error('[貸切リクエスト] グループステータス更新エラー:', groupUpdateError)
          logger.error('グループステータス更新エラー:', groupUpdateError)
        } else {
          console.log('[貸切リクエスト] グループステータス更新成功')
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
              const msgOrgId = await getCurrentOrganizationId() || QUEENS_WALTZ_ORG_ID
              const { data: msgSettings } = await supabase
                .from('global_settings')
                .select('system_msg_booking_requested_title, system_msg_booking_requested_body')
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
        console.warn('[貸切リクエスト] グループステータス更新スキップ', { effectiveGroupId, parentReservationId })
      }

      // 貸切申し込み完了メールを送信
      if (parentReservationId && customerEmail) {
        try {
          const candidateDates = candidateDatetimes.candidates.map(c => ({
            date: c.date,
            timeSlot: c.timeSlot,
            startTime: c.startTime,
            endTime: c.endTime
          }))

          const orgId = await getCurrentOrganizationId() || QUEENS_WALTZ_ORG_ID
          const { error: emailError } = await supabase.functions.invoke('send-private-booking-request-confirmation', {
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

