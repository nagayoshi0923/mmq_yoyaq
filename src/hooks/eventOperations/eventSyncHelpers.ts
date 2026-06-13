/**
 * 公演の移動/複製（useEventMoveCopy）と保存本体（doSavePerformance）の
 * 両方から使う共有ヘルパー。
 *
 * - confirmSendPrivateBookingChangeEmail: 貸切の変更通知メール送信前の確認
 * - syncRelatedDataOnEventDateChange: 日程・時間変更時の関連データ同期
 *
 * どちらも挙動は useEventOperations 時代から不変（Phase 4-3 で切り出しただけ）。
 */
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { scheduleTimeSlotToCandidate } from '@/lib/timeSlot'

/** 貸切の予約変更通知メール送信前の確認（OK=送信 / キャンセル=送信しない） */
export function confirmSendPrivateBookingChangeEmail(): boolean {
  return confirm(
    'お客様へ予約変更の通知メールを送信しますか？\n\n' +
      '「キャンセル」を選ぶと、保存した内容はそのままでメールだけ送りません。'
  )
}

/**
 * スケジュールイベントの日程・時間変更時に、関連データを同期する。
 * 1. reservations.requested_datetime を schedule_events に合わせて更新
 * 2. 貸切グループの候補日（private_group_candidate_dates）を更新
 */
export async function syncRelatedDataOnEventDateChange(
  eventId: string,
  oldDate: string,
  oldStartTime: string,
  newDate: string,
  newStartTime: string,
  newEndTime: string,
  newTimeSlotSchedule: string | null,
  organizationId: string | null
): Promise<void> {
  try {
    // 1. 紐づく全予約の requested_datetime を同期
    const newRequestedDatetime = `${newDate}T${newStartTime}+09:00`
    let resQuery = supabase
      .from('reservations')
      .select('id, private_group_id')
      .eq('schedule_event_id', eventId)
    if (organizationId) {
      resQuery = resQuery.eq('organization_id', organizationId)
    }
    const { data: reservations } = await resQuery
    if (!reservations || reservations.length === 0) return

    for (const reservation of reservations) {
      // eslint-disable-next-line no-restricted-syntax
      const { error: resUpdateError } = await supabase
        .from('reservations')
        .update({ requested_datetime: newRequestedDatetime })
        .eq('id', reservation.id)
      if (resUpdateError) {
        logger.error('予約の requested_datetime 同期エラー:', resUpdateError)
      } else {
        logger.log('✅ 予約の requested_datetime を同期:', {
          reservationId: reservation.id,
          newRequestedDatetime,
        })
      }

      // 2. 貸切グループの候補日を同期
      if (!reservation.private_group_id) continue

      const { data: candidates } = await supabase
        .from('private_group_candidate_dates')
        .select('id, date, start_time')
        .eq('group_id', reservation.private_group_id)
        .eq('date', oldDate)
      if (!candidates || candidates.length === 0) continue

      let targetCandidate = candidates[0]
      for (const c of candidates) {
        if (c.start_time === oldStartTime) {
          targetCandidate = c
          break
        }
      }

      // schedule_events の time_slot(朝/昼/夜) → candidate_dates の time_slot(午前/午後/夜間)
      const candidateTimeSlot = newTimeSlotSchedule ? scheduleTimeSlotToCandidate(newTimeSlotSchedule) : undefined

      const updatePayload: Record<string, string> = {
        date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
      }
      if (candidateTimeSlot) {
        updatePayload.time_slot = candidateTimeSlot
      }

      const { error: cdUpdateError } = await supabase
        .from('private_group_candidate_dates')
        .update(updatePayload)
        .eq('id', targetCandidate.id)

      if (cdUpdateError) {
        logger.error('貸切グループ候補日の同期エラー:', cdUpdateError)
      } else {
        logger.log('✅ 貸切グループ候補日を同期:', {
          groupId: reservation.private_group_id,
          oldDate,
          newDate,
        })
      }
    }
  } catch (err) {
    logger.error('日程変更時の関連データ同期でエラー:', err)
  }
}
