/**
 * 貸切予約 Discord 通知 API
 *
 * バックエンド API (/api/private-booking-notifications) 経由で実行する。
 * - サーバ側で予約の organization_id がユーザの所属組織と一致するか検証
 * - 検証後、Edge Function (notify-private-booking-discord) を service_role で invoke
 */
import { apiClient, ApiClientError } from '@/lib/apiClient'
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
    const result = await apiClient.post<{ success: boolean; data?: unknown }>(
      '/api/private-booking-notifications?action=resend-discord',
      {
        id: booking.id,
        scenario_master_id: booking.scenario_master_id,
        scenario_title: booking.scenario_title,
        customer_name: booking.customer_name,
        customer_email: booking.customer_email,
        customer_phone: booking.customer_phone,
        participant_count: booking.participant_count,
        candidate_datetimes: booking.candidate_datetimes,
        notes: booking.notes,
        created_at: booking.created_at,
      }
    )
    if (result.success) {
      logger.log('Discord通知再送信成功:', result.data)
      return { success: true }
    }
    return { success: false, error: 'Discord通知の再送信に失敗しました' }
  } catch (err) {
    if (err instanceof ApiClientError) {
      logger.error(
        `Discord通知再送信失敗 [status=${err.status}] ${err.message}` +
          (err.detail ? ` | detail: ${err.detail}` : ''),
      )
      return {
        success: false,
        error: err.detail
          ? `${err.message}: ${err.detail}`
          : err.message,
      }
    }
    logger.error('Discord通知再送信例外:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Discord通知の再送信に失敗しました',
    }
  }
}

/**
 * 貸切予約の Discord 通知を「GM 1人だけ」に送る（個別通知/再通知）。
 * 未送信のGMへの初回送信にも、未回答GMへの再送にも使う。
 */
export async function resendPrivateBookingDiscordNotificationForGm(
  booking: ResendBookingData,
  staffId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await apiClient.post<{ success: boolean; data?: unknown }>(
      '/api/private-booking-notifications?action=resend-discord-gm',
      {
        id: booking.id,
        staff_id: staffId,
        scenario_master_id: booking.scenario_master_id,
        scenario_title: booking.scenario_title,
        customer_name: booking.customer_name,
        customer_email: booking.customer_email,
        customer_phone: booking.customer_phone,
        participant_count: booking.participant_count,
        candidate_datetimes: booking.candidate_datetimes,
        notes: booking.notes,
        created_at: booking.created_at,
      },
    )
    if (result.success) return { success: true }
    return { success: false, error: 'Discord通知の送信に失敗しました' }
  } catch (err) {
    if (err instanceof ApiClientError) {
      logger.error(`個別Discord通知失敗 [status=${err.status}] ${err.message}` + (err.detail ? ` | ${err.detail}` : ''))
      return { success: false, error: err.detail ? `${err.message}: ${err.detail}` : err.message }
    }
    logger.error('個別Discord通知例外:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Discord通知の送信に失敗しました' }
  }
}
