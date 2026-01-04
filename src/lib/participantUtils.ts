/**
 * 🚨 CRITICAL: 参加者数計算ユーティリティ
 * 
 * このファイルは予約の参加者数を正確に計算するための共通関数を提供します。
 * 相対的な加減算ではなく、常に予約テーブルから集計して絶対値を設定します。
 * これにより、競合状態や複数回の操作による不整合を防ぎます。
 */

import { supabase } from './supabase'
import { logger } from '@/utils/logger'

/**
 * 🚨 CRITICAL: 公演の参加者数を予約テーブルから再計算して更新
 * 
 * 重要: この関数は、相対的な加減算ではなく、予約テーブルから集計して
 * 絶対値を設定します。これが最も正確な方法です。
 * 
 * @param eventId - schedule_eventsのID
 * @returns 更新後の参加者数
 */
export async function recalculateCurrentParticipants(eventId: string): Promise<number> {
  try {
    // 有効な予約（pending, confirmed, gm_confirmed）の参加者数を集計
    const { data: reservations, error: fetchError } = await supabase
      .from('reservations')
      .select('participant_count')
      .eq('schedule_event_id', eventId)
      .in('status', ['pending', 'confirmed', 'gm_confirmed'])

    if (fetchError) {
      logger.error('予約データ取得エラー:', fetchError)
      throw fetchError
    }

    // 参加者数を合計
    const totalParticipants = (reservations || []).reduce((sum, r) => {
      return sum + (r.participant_count || 0)
    }, 0)

    // schedule_eventsを更新
    const { error: updateError } = await supabase
      .from('schedule_events')
      .update({ current_participants: totalParticipants })
      .eq('id', eventId)

    if (updateError) {
      logger.error('参加者数更新エラー:', updateError)
      throw updateError
    }

    logger.log(`📊 参加者数を再計算: eventId=${eventId}, count=${totalParticipants}`)
    return totalParticipants
  } catch (error) {
    logger.error('参加者数再計算エラー:', error)
    throw error
  }
}

/**
 * 公演の現在の参加者数を予約テーブルから取得（更新なし）
 * 
 * @param eventId - schedule_eventsのID
 * @returns 現在の参加者数
 */
export async function getCurrentParticipantsCount(eventId: string): Promise<number> {
  try {
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('participant_count')
      .eq('schedule_event_id', eventId)
      .in('status', ['pending', 'confirmed', 'gm_confirmed'])

    if (error) {
      logger.error('予約データ取得エラー:', error)
      return 0
    }

    return (reservations || []).reduce((sum, r) => sum + (r.participant_count || 0), 0)
  } catch (error) {
    logger.error('参加者数取得エラー:', error)
    return 0
  }
}

