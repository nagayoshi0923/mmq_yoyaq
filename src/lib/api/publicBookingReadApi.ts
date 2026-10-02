/**
 * 予約サイトのトップ（シナリオ・店舗・公演の一覧）の読み取り・RPC の API
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const publicBookingReadApi = {
  /** ユーザーの役割 */
  async findUserRole(userId: string) {
    return supabase.from('users').select('role').eq('id', userId).maybeSingle()
  },

  /** ユーザーのスタッフ行の id */
  async findStaffId(userId: string) {
    return supabase.from('staff').select('id').eq('user_id', userId).maybeSingle()
  },

  /** 貸切予約の受付締切日数（RPC。組織指定） */
  async getPrivateBookingDeadlineDays(organizationId: string | null) {
    return supabase.rpc('get_private_booking_deadline_days', {
        p_organization_id: organizationId,
        p_organization_slug: null,
      })
  },

  /** シナリオごとのお気に入り数（RPC） */
  async getScenarioLikesCount() {
    return supabase.rpc('get_scenario_likes_count')
  },

  /** お気に入りのシナリオ id（RPC が失敗したときの代替） */
  async listScenarioLikes() {
    return supabase
      .from('scenario_likes')
      .select('scenario_id')
  },

  /** 店舗の公演募集停止期間 */
  async listPerformancePauses(storeIds: string[]) {
    return supabase
      .from('store_recruitment_pauses')
      .select('store_id, pause_type, starts_on, ends_on')
      .in('store_id', storeIds)
      .eq('pause_type', 'performance')
  },
}

export const publicBookingListReadApi = {
  /** 公開中のシナリオ（ガイド用を除く）を題名順。組織が分かれば絞る */
  async listAvailableScenarios(organizationId: string | null | undefined) {
    let query = supabase
      .from('organization_scenarios_with_master')
      .select('id, slug, title, key_visual_url, author, duration, player_count_min, player_count_max, genre, release_date, status, participation_fee, scenario_type, is_shared, organization_id, scenario_master_id, is_recommended')
      .eq('status', 'available')
      .neq('scenario_type', 'gm_test')

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    return query.order('title', { ascending: true })
  },
  /** 店舗（公開用ビュー。コスト情報を除く）を表示順。組織が分かれば絞る */
  async listPublicStores(organizationId: string | null | undefined) {
    let query = supabase
      .from('stores_public')
      .select('id, organization_id, name, short_name, address, color, capacity, rooms, status, is_temporary, temporary_dates, temporary_venue_names, display_order, region')

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    return query.order('display_order', { ascending: true, nullsFirst: false })
  },
  /** 期間内の公演（公開用ビュー。PII・財務情報を除く）。組織が分かれば絞る */
  async listPublicEventsInRange(startDate: string, endDate: string, organizationId: string | null | undefined) {
    let query = supabase
      .from('schedule_events_public')
      .select(`
            id,
            date,
            start_time,
            end_time,
            scenario_master_id,
            scenario_id,
            scenario,
            store_id,
            venue,
            current_participants,
            is_cancelled,
            is_reservation_enabled,
            published,
            category,
            is_private_booking,
            is_extended,
            reservation_deadline_hours,
            organization_id
          `)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    return query
  },
}

