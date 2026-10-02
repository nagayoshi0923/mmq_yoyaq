/**
 * 公演の画面（取り込み・公演モーダル・スロットメモ・予約一覧）で使う読み取りと RPC のAPI
 *
 * 画面・部品から supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'
import type { RpcAdminDeleteReservationsByScheduleEventIdsParams } from '@/lib/rpcTypes'

export const scheduleUiApi = {
  /** 公演の予約受付期間（RPC） */
  async getPerformanceBookingWindow(eventId: string) {
    return supabase.rpc('get_performance_booking_window', { p_event_id: eventId })
  },
  /** 期間内の公演 ID。組織が分かれば絞る */
  async listEventIdsInRange(startDate: string, endDate: string, organizationId?: string | null) {
    let query = supabase
      .from('schedule_events')
      .select('id')
      .gte('date', startDate)
      .lte('date', endDate)
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query
  },
  /** 公演の ID 一覧に紐づく予約をまとめて削除する（RPC。取り込みの置き換え用） */
  async adminDeleteReservationsByScheduleEventIds(params: RpcAdminDeleteReservationsByScheduleEventIdsParams) {
    return supabase.rpc('admin_delete_reservations_by_schedule_event_ids', params)
  },
  /** 日付×店舗の日次メモの本文 */
  async getDailyMemoText(date: string, venueId: string) {
    return supabase.from('daily_memos').select('memo_text').eq('date', date).eq('venue_id', venueId).maybeSingle()
  },
  /** 期間内の公演（スタッフ用ビュー。取り込みの重複確認用） */
  async listStaffViewEventsInRange(startDate: string, endDate: string) {
    return supabase
      .from('schedule_events_staff_view')
      .select('id, date, store_id, start_time, is_cancelled, scenario, notes, gms, reservation_info')
      .gte('date', startDate)
      .lte('date', endDate)
  },
  /** 店舗の営業時間設定。組織が分かれば絞る */
  async getBusinessHours(storeId: string, organizationId?: string | null) {
    let query = supabase
      .from('business_hours_settings')
      .select('opening_hours, holidays, time_restrictions')
      .eq('store_id', storeId)
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    return query.maybeSingle()
  },
  /** 日付・開始時刻が同じ最新の公演（保存直後の公演 ID の特定用） */
  async findLatestEventAt(organizationId: string | null | undefined, date: string, startTime: string) {
    return supabase
      .from('schedule_events')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('date', date)
      .eq('start_time', startTime)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  },
  /** 公演の GM と役割（スタッフ用ビュー） */
  async getEventGms(eventId: string) {
    return supabase.from('schedule_events_staff_view').select('gms, gm_roles').eq('id', eventId).single()
  },
  /** 期間内の空き枠メモ */
  async listSlotMemosInRange(startDate: string, endDate: string) {
    return supabase
      .from('schedule_slot_memos')
      .select('date, store_id, time_slot, memo')
      .gte('date', startDate)
      .lte('date', endDate)
  },
  /** 日付×店舗×時間帯の空き枠メモ1件 */
  async getSlotMemo(date: string, storeId: string, timeSlot: string) {
    return supabase
      .from('schedule_slot_memos')
      .select('memo')
      .eq('date', date)
      .eq('store_id', storeId)
      .eq('time_slot', timeSlot)
      .maybeSingle()
  },
  /** 店舗か組織のメール設定（会社名・電話・テンプレート）を1件。店舗があれば店舗で、なければ組織で絞る */
  async findEmailSettings(scope: { storeId: string } | { organizationId: string }) {
    const query = supabase
      .from('email_settings')
      .select('reservation_confirmation_template, private_confirm_template, company_name, company_phone, company_email')
    const scoped = 'storeId' in scope ? query.eq('store_id', scope.storeId) : query.eq('organization_id', scope.organizationId)
    return scoped.limit(1).maybeSingle()
  },
  /** 貸切グループのメンバーへ個別のお知らせを送る（RPC） */
  async sendPrivateGroupIndividualNotice(params: { groupId: string; memberId: string; message: string; characterId: string | null; attachTemplate: boolean }) {
    return supabase.rpc('private_group_send_individual_notice', {
      p_group_id: params.groupId,
      p_member_id: params.memberId,
      p_message: params.message,
      p_character_id: params.characterId,
      p_attach_template: params.attachTemplate,
    })
  },
}
