/**
 * スケジュール管理画面（公演の集計・再計算・デモ予約の整理）の読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'
import { RESERVATION_SOURCE } from '@/lib/constants'

export const scheduleManagerReadApi = {
  /** キット移動の設定（オフセット・開始店舗） */
  async getKitTransferSettings(organizationId: string) {
    return supabase
      .from('global_settings')
      .select('kit_transfer_offsets, kit_transfer_start_store_ids')
      .eq('organization_id', organizationId)
      .single()
  },

  /** 期間内の公演数（種別ごと。中止を除く） */
  async countEventsByCategory(organizationId: string, startDate: string, endDate: string, category: string) {
    return supabase
      .from('schedule_events_staff_view')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
      .eq('category', category)
  },

  /** 再計算用: 期間内の公演（種別で絞る。中止を除く） */
  async listEventsForRecalculation(organizationId: string, startDate: string, endDate: string, categories: string[]) {
    return supabase
      .from('schedule_events_staff_view')
      .select('id, scenario, category, max_participants, capacity, current_participants, date, start_time, scenario_id, scenario_master_id, store_id, gms, scenario_masters:scenario_master_id(player_count_max)')
      .eq('organization_id', organizationId)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
      .in('category', categories)
  },

  /** 再計算用: シナリオの所要時間・参加費・費用 */
  async listScenarioPricing(organizationId: string, scenarioMasterIds: string[]) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('scenario_master_id, duration, participation_fee, gm_test_participation_fee, participation_costs')
      .eq('organization_id', organizationId)
      .in('scenario_master_id', scenarioMasterIds)
  },

  /** 再計算用: 公演の有効な予約（確定・保留）の人数 */
  async listActiveReservationsByEventIds(eventIds: string[]) {
    return supabase
      .from('reservations')
      .select('schedule_event_id, participant_count, participant_names')
      .in('schedule_event_id', eventIds)
      .in('status', ['confirmed', 'pending'])
  },

  /** 再計算用: 公演を1件（スタッフ用ビュー） */
  async findEventForRecalculation(eventId: string) {
    return supabase
      .from('schedule_events_staff_view')
      .select('id, scenario, max_participants, capacity, current_participants, date, start_time, scenario_id, scenario_master_id, store_id, gms, category, scenario_masters:scenario_master_id(player_count_max)')
      .eq('id', eventId)
      .single()
  },

  /** 再計算用: 公演の有効な予約の人数と参加者名 */
  async listActiveReservationCounts(eventId: string) {
    return supabase
      .from('reservations')
      .select('participant_count, participant_names')
      .eq('schedule_event_id', eventId)
      .in('status', ['confirmed', 'pending'])
  },

  /** 再計算用: シナリオの所要時間・参加費・費用（1件） */
  async findScenarioPricing(organizationId: string, scenarioMasterId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('duration, participation_fee, gm_test_participation_fee, participation_costs')
      .eq('organization_id', organizationId)
      .eq('scenario_master_id', scenarioMasterId)
      .maybeSingle()
  },

  /** テストプレイ公演の id */
  async listTestplayEventIds(organizationId: string) {
    return supabase
      .from('schedule_events')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('category', 'testplay')
  },

  /** テストプレイ公演のデモ予約 */
  async listDemoReservationsByEventIds(organizationId: string, eventIds: string[]) {
    return supabase
      .from('reservations')
      .select('id, schedule_event_id')
      .eq('organization_id', organizationId)
      .in('schedule_event_id', eventIds)
      .in('reservation_source', [RESERVATION_SOURCE.DEMO, RESERVATION_SOURCE.DEMO_AUTO])
  },

  /** GM テスト公演の id とシナリオ */
  async listGmtestEvents(organizationId: string) {
    return supabase
      .from('schedule_events')
      .select('id, scenario_master_id')
      .eq('organization_id', organizationId)
      .eq('category', 'gmtest')
  },

  /** GM テスト公演のデモ予約（人数つき） */
  async listDemoReservationsWithCountByEventIds(organizationId: string, eventIds: string[]) {
    return supabase
      .from('reservations')
      .select('id, schedule_event_id, participant_count')
      .eq('organization_id', organizationId)
      .in('schedule_event_id', eventIds)
      .in('reservation_source', [RESERVATION_SOURCE.DEMO, RESERVATION_SOURCE.DEMO_AUTO])
  },

  /** シナリオの参加費・費用（マスタ id で） */
  async listScenarioFees(organizationId: string, scenarioMasterIds: string[]) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('scenario_master_id, participation_fee, gm_test_participation_fee, participation_costs')
      .eq('organization_id', organizationId)
      .in('scenario_master_id', scenarioMasterIds)
  },
}
