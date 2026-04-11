import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

interface ResendBookingData {
  id: string
  scenario_master_id?: string
  scenario_title: string
  customer_name: string
  customer_email: string
  customer_phone: string
  participant_count: number
  candidate_datetimes: {
    candidates: Array<{
      order: number
      date: string
      timeSlot: string
      startTime: string
      endTime: string
    }>
  }
  notes?: string
  created_at: string
}

/**
 * 貸切予約の Discord 通知を再送信する
 * 既存のキューエントリを削除してから新しい通知をキューに積む
 */
export async function resendPrivateBookingDiscordNotification(
  booking: ResendBookingData
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'notify-private-booking-discord',
      {
        body: {
          type: 'resend',
          table: 'reservations',
          record: {
            id: booking.id,
            scenario_id: booking.scenario_master_id,
            scenario_title: booking.scenario_title,
            customer_name: booking.customer_name,
            customer_email: booking.customer_email,
            customer_phone: booking.customer_phone,
            participant_count: booking.participant_count,
            candidate_datetimes: booking.candidate_datetimes,
            notes: booking.notes,
            created_at: booking.created_at,
          },
        },
      }
    )

    if (error) {
      logger.error('Discord通知再送信エラー:', error)
      return { success: false, error: error.message || 'Discord通知の再送信に失敗しました' }
    }

    logger.log('Discord通知再送信成功:', data)
    return { success: true }
  } catch (err) {
    logger.error('Discord通知再送信例外:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Discord通知の再送信に失敗しました',
    }
  }
}
