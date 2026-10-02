/**
 * 公演まわりのフック（募集中止スロット・休日・公演データ・貸切の空き枠・予約サイトの公演取得）の読み取りAPI
 *
 * フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'
import type { RpcGetPublicPrivateBookingAvailabilityParams } from '@/lib/rpcTypes'
import { RESERVATION_SOURCE } from '@/lib/constants'

export const scheduleHookReadApi = {
  /** 募集中止スロット（組織の全件） */
  async listBlockedSlots(organizationId: string) {
    return supabase
      .from('schedule_blocked_slots')
      .select('date, store_id, time_slot')
      .eq('organization_id', organizationId)
  },
  /** 組織の公開カスタム休日（RPC） */
  async getPublicCustomHolidays(organizationId: string) {
    return supabase.rpc('get_public_custom_holidays', { p_organization_id: organizationId })
  },
  /** 組織シナリオの上書き設定（所要時間・参加費・追加準備時間） */
  async listOrganizationScenarioOverrides(organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('scenario_master_id, duration, participation_fee, extra_preparation_time')
      .eq('organization_id', organizationId)
  },
}

export const scheduleEventsQueryReadApi = {
  /** 貸切公演の「紐づく予約が全てキャンセル済み」検出用: 公演 ID ごとの予約ステータス。組織が分かれば絞る */
  listStatusesByEventIds(eventIds: string[], organizationId: string | null | undefined) {
    const base = supabase
      .from('reservations')
      .select('schedule_event_id, status')
      .in('schedule_event_id', eventIds)
    return organizationId ? base.eq('organization_id', organizationId) : base
  },
  /** 公演がまだ無い、確定済みの貸切リクエスト（カレンダーへの合成用）。組織が分かれば絞る */
  listConfirmedPrivateWithoutEvent(organizationId: string | null | undefined) {
    const base = supabase
      .from('reservations')
      .select(`
      id, title, customer_name, display_customer_name, status, store_id,
      gm_staff, candidate_datetimes, participant_count, schedule_event_id,
      scenario_master_id,
      scenario_masters:scenario_master_id ( id, title, player_count_max ),
      customers:customer_id ( nickname )
    `)
      .eq('reservation_source', RESERVATION_SOURCE.WEB_PRIVATE)
      .eq('status', 'confirmed')
      .is('schedule_event_id', null)
    return organizationId ? base.eq('organization_id', organizationId) : base
  },
  /** 予約者のニックネーム用: 予約 ID から表示名とニックネーム */
  listNicknamesByReservationIds(reservationIds: string[]) {
    return supabase
      .from('reservations')
      .select('id, customer_name, display_customer_name, customers:customer_id(nickname)')
      .in('id', reservationIds)
  },
}

export const privateBookingSlotReadApi = {
  /** 店舗の指定が無いとき: 組織の稼働中の店舗（臨時・オフィスを除く） */
  async listActiveStoreIds(organizationId: string) {
    return supabase
      .from('stores')
      .select('id')
      .match({ organization_id: organizationId, status: 'active' })
      .or('is_temporary.is.null,is_temporary.eq.false')
      .neq('ownership_type', 'office')
  },
  /** 空き状況用の公演（前後2日の余裕つき） */
  async listAvailabilityEvents(organizationId: string, storeIds: string[], startDate: string, endDate: string) {
    return supabase
      .from('schedule_events_for_availability')
      .select('id, date, store_id, start_time, end_time, is_cancelled')
      .eq('organization_id', organizationId)
      .in('store_id', storeIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
  },
  /** 店舗ごとの営業時間・休日・特別営業日 */
  async listBusinessHours(storeIds: string[]) {
    return supabase
      .from('business_hours_settings')
      .select('store_id, opening_hours, holidays, special_open_days, special_closed_days')
      .in('store_id', storeIds)
  },
  /** 貸切の公開空き状況（RPC） */
  async getPublicAvailability(params: RpcGetPublicPrivateBookingAvailabilityParams) {
    return supabase.rpc('get_public_private_booking_availability', params)
  },
  /** 貸切予約の締切日数（RPC）。指定が無い項目は null */
  async getEffectiveDeadlineDays(options: { scenarioId: string | null; organizationId: string | null; organizationSlug: string | null }) {
    return supabase.rpc('get_effective_private_booking_deadline_days', {
      p_scenario_id: options.scenarioId,
      p_organization_id: options.organizationId,
      p_organization_slug: options.organizationSlug,
    })
  },
}
