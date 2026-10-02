/**
 * デモ参加者の追加画面の読み取り・RPC の API
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'
import type { RpcAdminDeleteReservationsByIdsParams } from '@/lib/rpcTypes'

export const demoParticipantsReadApi = {
  /** 公演の有効な予約（確定・保留） */
  async listActiveReservationsByEvent(eventId: string) {
    return supabase
      .from('reservations')
      .select('id, participant_names, reservation_source, participant_count')
      .eq('schedule_event_id', eventId)
      .in('status', ['confirmed', 'pending'])
  },

  /** 題名の先頭が近いシナリオマスタを最大3件（候補表示用） */
  async listMasterTitlesLike(titlePrefix: string) {
    return supabase
      .from('scenario_masters')
      .select('title')
      .ilike('title', `%${titlePrefix}%`)
      .limit(3)
  },

  /** 予約を id でまとめて削除する（RPC） */
  async adminDeleteReservationsByIds(params: RpcAdminDeleteReservationsByIdsParams) {
    return supabase.rpc('admin_delete_reservations_by_ids', params)
  },

  /** 会場名か略称で店舗の id を1件 */
  async findStoreIdByVenueName(venue: string) {
    return supabase
      .from('stores')
      .select('id')
      .or(`name.eq.${venue},short_name.eq.${venue}`)
      .single()
  },

  /** 接続確認（顧客テーブルに1件問い合わせる） */
  async pingCustomers() {
    return supabase
      .from('customers')
      .select('count')
      .limit(1)
  },
  /** 顧客の先頭10件（デバッグ表示用）。組織が分かれば絞る */
  async listCustomersSample(organizationId?: string | null) {
    let allCustQuery = supabase
      .from('customers')
      .select('id, name, email')
    if (organizationId) {
      allCustQuery = allCustQuery.eq('organization_id', organizationId)
    }
    return allCustQuery.limit(10)
  },
  /** デモ顧客（名前に「デモ」「test」かメールに demo）を1件。組織が分かれば絞る */
  async findDemoCustomer(organizationId?: string | null) {
    let demoCustQuery = supabase
      .from('customers')
      .select('id, name, email')
      .or('name.ilike.%デモ%,email.ilike.%demo%,name.ilike.%test%')
    if (organizationId) {
      demoCustQuery = demoCustQuery.eq('organization_id', organizationId)
    }
    return demoCustQuery
      .limit(1)
      .single()
  },
  /** 今日以前の公演（中止を除く。全カテゴリ）を新しい順。組織が分かれば絞る */
  async listPastEvents(todayYmd: string, organizationId?: string | null) {
    let eventsQuery = supabase
      .from('schedule_events_staff_view')
      .select('id, date, venue, scenario, scenario_master_id, gms, start_time, end_time, category, is_cancelled, current_participants, capacity, organization_id')
      .lte('date', todayYmd)
      .eq('is_cancelled', false)
    if (organizationId) {
      eventsQuery = eventsQuery.eq('organization_id', organizationId)
    }
    return eventsQuery
      .order('date', { ascending: false })
  },
  /** 全シナリオ（organization_scenarios_with_master: 組織固有の participation_fee）。組織が分かれば絞る */
  async listScenarios(organizationId?: string | null) {
    let scenariosQuery = supabase
      .from('organization_scenarios_with_master')
      .select('id, title, duration, participation_fee, gm_test_participation_fee, participation_costs, player_count_max, player_count_min')
    if (organizationId) {
      scenariosQuery = scenariosQuery.eq('organization_id', organizationId)
    }
    return scenariosQuery
  },
  /** シナリオを id で1件（ビューの id は scenario_master_id と同一）。組織が分かれば絞る */
  async findScenarioById(scenarioMasterId: string, organizationId?: string | null) {
    let idQuery = supabase
      .from('organization_scenarios_with_master')
      .select('id, title, duration, participation_fee, gm_test_participation_fee, participation_costs, player_count_max, player_count_min')
      .eq('id', scenarioMasterId)
    if (organizationId) {
      idQuery = idQuery.eq('organization_id', organizationId)
    }
    return idQuery.maybeSingle()
  },
}

