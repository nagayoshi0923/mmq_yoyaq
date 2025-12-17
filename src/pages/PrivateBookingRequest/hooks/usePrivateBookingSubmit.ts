import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId, QUEENS_WALTZ_ORG_ID } from '@/lib/organization'
import { logger } from '@/utils/logger'
import type { TimeSlot } from '../types'

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
      
      // 最初の候補を親レコードとして作成
      const firstEventDateTime = `${firstSlot.date}T${firstSlot.slot.startTime}`
      
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
      
      // organization_idを取得（ログインユーザーから、またはデフォルト）
      const reservationOrgId = await getCurrentOrganizationId() || QUEENS_WALTZ_ORG_ID
      
      const { data: parentReservation, error: parentError } = await supabase
        .from('reservations')
        .insert({
          title: `【貸切希望】${props.scenarioTitle}（候補${props.selectedTimeSlots.length}件）`,
          reservation_number: baseReservationNumber,
          scenario_id: props.scenarioId,
          customer_id: customerId,
          requested_datetime: firstEventDateTime,
          actual_datetime: firstEventDateTime,
          duration: 180,
          participant_count: props.maxParticipants,
          base_price: props.participationFee * props.maxParticipants,
          total_price: props.participationFee * props.maxParticipants,
          final_price: props.participationFee * props.maxParticipants,
          status: 'pending',
          priority: 0,
          candidate_datetimes: candidateDatetimes,
          customer_notes: notes || null,
          created_by: props.userId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          reservation_source: 'web_private',
          organization_id: reservationOrgId
        })
        .select()
        .single()
      
      if (parentError) {
        logger.error('貸切リクエストエラー:', parentError)
        throw new Error('貸切リクエストの送信に失敗しました。もう一度お試しください。')
      }

      // このシナリオを担当できるGMを取得
      const { data: gmAssignments, error: gmError } = await supabase
        .from('staff_scenario_assignments')
        .select('staff_id')
        .eq('scenario_id', props.scenarioId)
      
      if (!gmError && gmAssignments && gmAssignments.length > 0 && parentReservation) {
        try {
          // staff_idの重複を排除（同一スタッフが複数の役割で登録されている場合）
          const uniqueStaffIds = [...new Set(gmAssignments.map(a => a.staff_id))]
          
          // 既存のGM確認レコードを取得
          const { data: existingResponses } = await supabase
            .from('gm_availability_responses')
            .select('staff_id')
            .eq('reservation_id', parentReservation.id)
          
          const existingStaffIds = new Set((existingResponses || []).map(r => r.staff_id))
          
          // 既存レコードがないGMのみ挿入対象にする
          const newGmResponses = uniqueStaffIds
            .filter(staffId => !existingStaffIds.has(staffId))
            .map(staffId => ({
          reservation_id: parentReservation.id,
              staff_id: staffId,
          response_status: 'pending',
          notified_at: new Date().toISOString()
        }))
        
          // 新規レコードがある場合のみ挿入
          if (newGmResponses.length > 0) {
            const { error: insertError } = await supabase
          .from('gm_availability_responses')
              .insert(newGmResponses)
            
            if (insertError) {
              // 権限エラー（403）などは警告ログのみ出力し、予約処理は継続
              // GM確認レコードはDBトリガーまたは管理者が後から作成可能
              logger.warn('GM確認レコード作成スキップ（権限またはエラー）:', insertError.message)
            }
          }
        } catch (gmResponseError) {
          // エラーが発生しても予約自体は成功させる
          logger.warn('GM確認レコード作成エラー:', gmResponseError)
        }
      }

      // 貸切申し込み完了メールを送信
      if (parentReservation && customerEmail) {
        try {
          const candidateDates = candidateDatetimes.candidates.map(c => ({
            date: c.date,
            timeSlot: c.timeSlot,
            startTime: c.startTime,
            endTime: c.endTime
          }))

          const { error: emailError } = await supabase.functions.invoke('send-private-booking-request-confirmation', {
            body: {
              reservationId: parentReservation.id,
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

