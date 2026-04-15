/**
 * 🚨 CRITICAL: 参加者数計算ユーティリティ
 *
 * このファイルは予約の参加者数を正確に計算するための共通関数を提供します。
 * 相対的な加減算ではなく、常に予約テーブルから集計して絶対値を設定します。
 * これにより、競合状態や複数回の操作による不整合を防ぎます。
 */

import { supabase } from './supabase'
import { logger } from '@/utils/logger'
import { ACTIVE_RESERVATION_STATUSES } from './constants'

// ─────────────────────────────────────────────────────────────
// 残席数・空き状況の計算（フロント表示用）
// ─────────────────────────────────────────────────────────────

/**
 * 公演の残席数を計算する。
 *
 * - 貸切公演（is_private_booking=true）は常に 0
 * - scenarioMax が指定されていればそちらを優先（シナリオの player_count_max）
 * - 未指定の場合は event.max_participants → event.capacity → 8 の順でフォールバック
 * - 結果は必ず 0 以上
 */
export function getAvailableSeats(
  event: {
    is_private_booking?: boolean | null
    current_participants?: number | null
    max_participants?: number | null
    capacity?: number | null
  },
  scenarioMax?: number | null
): number {
  if (event.is_private_booking === true) return 0
  const max = scenarioMax ?? event.max_participants ?? event.capacity ?? 8
  const current = event.current_participants ?? 0
  return Math.max(0, max - current)
}

export type AvailabilityStatus = 'available' | 'few_seats' | 'sold_out' | 'private_booking'

/**
 * 公演の空き状況ステータスを返す。
 *
 * - 貸切公演は 'private_booking'
 * - 残席0 は 'sold_out'
 * - 最大人数の20%以下（最低1席）は 'few_seats'
 * - それ以外は 'available'
 */
export function getAvailabilityStatus(
  event: {
    is_private_booking?: boolean | null
    current_participants?: number | null
    max_participants?: number | null
    capacity?: number | null
  },
  scenarioMax?: number | null
): AvailabilityStatus {
  if (event.is_private_booking === true) return 'private_booking'
  const max = scenarioMax ?? event.max_participants ?? event.capacity ?? 8
  const available = getAvailableSeats(event, scenarioMax)
  if (available <= 0) return 'sold_out'
  const threshold = Math.max(1, Math.floor(max * 0.2))
  if (available <= threshold) return 'few_seats'
  return 'available'
}

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
    const { data: reservations, error: fetchError } = await supabase
      .from('reservations')
      .select('participant_count')
      .eq('schedule_event_id', eventId)
      .in('status', [...ACTIVE_RESERVATION_STATUSES])

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
      .in('status', [...ACTIVE_RESERVATION_STATUSES])

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




