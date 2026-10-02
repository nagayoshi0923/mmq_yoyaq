/**
 * GM の空き確認画面の読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'
import { RESERVATION_SOURCE } from '@/lib/constants'

export const gmAvailabilityReadApi = {
  /** 店舗のその日の公演（中止を除く。時間の重なり確認用） */
  async listStaffViewEventsOnDate(date: string, storeId: string) {
    return supabase
      .from('schedule_events_staff_view')
      .select('start_time, end_time')
      .eq('date', date)
      .eq('store_id', storeId)
      .eq('is_cancelled', false)
  },

  /** 店舗の確定済み貸切の候補日時 */
  async listConfirmedPrivateByStore(storeId: string) {
    return supabase
      .from('reservations')
      .select('candidate_datetimes, store_id')
      .eq('reservation_source', RESERVATION_SOURCE.WEB_PRIVATE)
      .in('status', ['confirmed', 'gm_confirmed'])
      .eq('store_id', storeId)
  },

  /** GM が担当している、指定日の公演（中止を除く） */
  async listGmEventsOnDates(dates: string[], gmName: string) {
    return supabase
      .from('schedule_events_staff_view')
      .select('date, start_time, end_time, gms')
      .in('date', dates)
      .eq('is_cancelled', false)
      .contains('gms', [gmName])
  },

  /** 予約の現在のステータス */
  async findReservationStatus(reservationId: string) {
    return supabase
      .from('reservations')
      .select('status')
      .eq('id', reservationId)
      .maybeSingle()
  },
}
