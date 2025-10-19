import { useState } from 'react'
import { supabase } from '@/lib/supabase'
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

      // 親予約番号を生成（全候補で共通）
      const baseReservationNumber = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-PV${Date.now().toString().slice(-6)}`
      
      // 最初の候補を親レコードとして作成
      const firstSlot = props.selectedTimeSlots[0]
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
          reservation_source: 'web_private'
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
        // 各GMに対して確認レコードを作成
        const gmResponses = gmAssignments.map(assignment => ({
          reservation_id: parentReservation.id,
          staff_id: assignment.staff_id,
          response_status: 'pending',
          notified_at: new Date().toISOString()
        }))
        
        await supabase
          .from('gm_availability_responses')
          .insert(gmResponses)
      }

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

