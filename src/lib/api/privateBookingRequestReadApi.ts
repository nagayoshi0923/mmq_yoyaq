/**
 * 貸切リクエスト画面の読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const privateBookingRequestReadApi = {
  /** 空き状況用の公演（組織・店舗・期間。中止を除く） */
  async listAvailabilityEvents(organizationId: string, storeIds: string[], startDate: string, endDate: string) {
    return supabase
      .from('schedule_events_for_availability')
      .select('id, date, store_id, start_time, end_time, is_cancelled')
      .filter('organization_id', 'eq', organizationId)
      .in('store_id', storeIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
  },

  /** 日程候補の判定用: 空き状況用の公演（前後2日の余裕つき） */
  async listAvailabilityEventsForSlots(organizationId: string, storeIds: string[], startDate: string, endDate: string) {
    return supabase
      .from('schedule_events_for_availability')
      .select('id, date, start_time, end_time, store_id, is_cancelled')
      .filter('organization_id', 'eq', organizationId)
      .in('store_id', storeIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
  },

  /** 指定日の公演（公開ビュー。中止を除く） */
  async listPublicEventsOnDate(storeIds: string[], date: string) {
    return supabase
      .from('schedule_events_public')
      .select('id, date, start_time, end_time, store_id, scenario, category, is_cancelled')
      .in('store_id', storeIds)
      .eq('date', date)
      .eq('is_cancelled', false)
  },
}
