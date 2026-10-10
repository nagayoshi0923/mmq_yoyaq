/**
 * マイページの設定画面の読み取り・RPC の API
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'
import { RESERVATION_STATUSES_BLOCKING_WITHDRAWAL } from '@/lib/reservationWithdrawalGuard'

export const myPageSettingsReadApi = {
  /** ログイン中の利用者を、未紐付けの顧客行に紐付ける・統合する（RPC） */
  async linkCurrentUserToCustomer() {
    return supabase.rpc('link_current_user_to_customer')
  },

  /** user_id で自分の顧客行の id を1件（最新の更新を優先） */
  async findOwnCustomerId(userId: string) {
    return supabase
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
  },
}

export const myPageProfileReadApi = {
  /** 退会をブロックする今後の予約の件数。組織が分かれば絞る */
  async countBlockingReservations(customerId: string, nowIso: string, organizationId: string | null | undefined) {
    let q = supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .gte('requested_datetime', nowIso)
      .in('status', [...RESERVATION_STATUSES_BLOCKING_WITHDRAWAL])
    if (organizationId) {
      q = q.eq('organization_id', organizationId)
    }
    return q
  },
  /** マイページ: 自分の顧客行。user_id があればそれで、なければメールで探し、重複があれば最新の1件（#382） */
  async findOwnCustomer(userId: string | undefined, email: string | undefined) {
    let query = supabase
      .from('customers')
      .select('id, organization_id, user_id, name, nickname, email, phone, address, line_id, avatar_url, notification_settings, created_at, updated_at')

    if (userId) {
      query = query.eq('user_id', userId)
    } else if (email) {
      query = query.eq('email', email)
    }

    return query
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
  },
}

export const myPageLikesReadApi = {
  /** ログインユーザーの顧客 id */
  async findCustomerIdByUserId(userId: string) {
    return supabase
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
  },

  /** 顧客のお気に入り（新しい順） */
  async listLikesByCustomer(customerId: string) {
    return supabase
      .from('scenario_likes')
      .select('id, scenario_id, scenario_master_id, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
  },

  /** 遊びたい作品の今日以降の一般公演（公開ビュー）。全作品分を 1 回で読む */
  async listUpcomingPublicEventsForScenarios(masterIds: string[], fromDate: string) {
    return supabase
      .from('schedule_events_public')
      .select('id, date, start_time, venue, organization_id, scenario_master_id, current_participants, max_participants')
      .in('scenario_master_id', masterIds)
      .gte('date', fromDate)
      .in('category', ['open', 'offsite'])
      .eq('is_reservation_enabled', true)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(1000)
  },

  /** 組織の slug（作品ページへのリンク用） */
  async listOrganizationSlugs(ids: string[]) {
    return supabase.from('organizations').select('id, slug').in('id', ids)
  },

  /** お気に入りのシナリオマスタ */
  async listMastersByIds(masterIds: string[]) {
    return supabase
      .from('scenario_masters')
      .select('id, title, description, author, official_duration, player_count_min, player_count_max, difficulty, genre, key_visual_url')
      .in('id', masterIds)
  },
}

export const myPageDataReadApi = {
  /** user_id で自分の顧客行（重複があれば最新1件。#382） */
  async findOwnCustomerByUserId(userId: string) {
    return supabase.from('customers').select('id, name, nickname, avatar_url, user_id, organization_id').eq('user_id', userId).order('updated_at', { ascending: false }).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle()
  },

  /** メール（大文字小文字を区別しない）で自分の顧客行（重複があれば最新1件） */
  async findOwnCustomerByEmail(email: string) {
    return supabase.from('customers').select('id, name, nickname, avatar_url, user_id, organization_id').ilike('email', email).order('updated_at', { ascending: false }).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle()
  },

  /** 顧客の予約（開催日時の新しい順に50件） */
  async listRecentReservations(customerId: string) {
    return supabase.from('reservations').select('id, organization_id, reservation_number, title, scenario_id, scenario_master_id, store_id, schedule_event_id, requested_datetime, duration, participant_count, status, candidate_datetimes, reservation_source, private_group_id, cancellation_reason, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, created_at, updated_at').eq('customer_id', customerId).order('requested_datetime', { ascending: false }).limit(50)
  },

  /** 顧客のシナリオ評価 */
  async listRatings(customerId: string) {
    return supabase.rpc('customer_rating_action', { p_customer_id: customerId, p_action: 'snapshot' })
  },

  /** 公演（公開ビュー）を id で */
  async listPublicEventsByIds(eventIds: string[]) {
    return supabase.from('schedule_events_public').select('id, date, start_time, category, is_private_booking, current_participants, max_participants').in('id', eventIds)
  },

  /** 組織の id・slug・名前を id で */
  async listOrganizationsByIds(ids: string[]) {
    return supabase.from('organizations').select('id, slug, name').in('id', ids)
  },

  /** シナリオマスタの題名・画像・人数を id で */
  async listScenarioMastersByIds(ids: string[]) {
    return supabase.from('scenario_masters').select('id, title, key_visual_url, player_count_min, player_count_max').in('id', ids)
  },

  /** 貸切グループの日程（RPC） */
  async getPrivateGroupSchedules(groupIds: string[]) {
    return supabase.rpc('get_private_group_schedules', { p_group_ids: groupIds })
  },

  /** 店舗の名前・住所・色を id で */
  async listStoresByIds(ids: string[]) {
    return supabase.from('stores').select('id, name, address, color').in('id', ids)
  },

  /** 公開中のシナリオ（題名順） */
  async listAvailableScenarios() {
    return supabase.from('organization_scenarios_with_master').select('scenario_master_id, title, org_status').eq('org_status', 'available').order('title')
  },

  /** 店舗（名前順） */
  async listStores() {
    return supabase.from('stores').select('id, name, short_name, is_temporary').order('name')
  },
}

export const myPageReservationReadApi = {
  /** 予約の詳細（キャンセル規定のスナップショットつき） */
  async findReservationDetail(reservationId: string) {
    return supabase
      .from('reservations')
      .select(`id, reservation_number, title, requested_datetime, participant_count, unit_price, final_price, total_price, status, payment_status, notes, scenario_id, scenario_master_id, store_id, organization_id, created_at, schedule_event_id, reservation_source, candidate_datetimes, customer_name, customer_email, customer_phone, private_group_id, reservation_change_deadline_hours_snapshot, cancellation_policy_snapshot_version, cancellation_policy_store_id, cancellation_policy_performance_type, cancellation_policy_deadline_hours, cancellation_policy_fees, cancellation_policy_fee_basis, cancellation_policy_updated_at`)
      .eq('id', reservationId)
      .maybeSingle()
  },

  /** 公演（公開ビュー）の日時・人数・店舗 */
  async findPublicEvent(eventId: string) {
    return supabase
      .from('schedule_events_public')
      .select('date, start_time, end_time, category, current_participants, max_participants, store_id')
      .eq('id', eventId)
      .maybeSingle()
  },

  /** 店舗の名前・住所 */
  async findStore(storeId: string) {
    return supabase.from('stores').select('id, name, address').eq('id', storeId).single()
  },

  /** 店舗の予約設定（キャンセル規定・期限） */
  async findReservationSettings(storeId: string) {
    return supabase
      .from('reservation_settings')
      .select('cancellation_policy, cancellation_deadline_hours, private_cancellation_deadline_hours')
      .eq('store_id', storeId)
      .maybeSingle()
  },

  /** 組織の slug */
  async findOrganization(organizationId: string) {
    return supabase.from('organizations').select('id, slug').eq('id', organizationId).single()
  },

  /** 組織のシナリオ表示ビュー（id で） */
  async findOrganizationScenarioView(scenarioMasterId: string, organizationId: string) {
    return supabase.from('organization_scenarios_with_master').select('id, title, slug, key_visual_url, duration, player_count_min, player_count_max').eq('id', scenarioMasterId).eq('organization_id', organizationId).maybeSingle()
  },

  /** シナリオマスタの題名・画像・所要時間・人数 */
  async findScenarioMaster(scenarioMasterId: string) {
    return supabase.from('scenario_masters').select('id, title, key_visual_url, official_duration, player_count_min, player_count_max').eq('id', scenarioMasterId).single()
  },

  /** 公演の確定済み予約の人数 */
  /**
   * 公演の現在の参加人数と定員（公開ビュー）。
   * reservations を直接数えるとお客様には自分の行しか見えず（RLS）、他の方の予約が 0 人扱いになるため公開ビューを使う。
   */
  async findPublicEventSeatCounts(scheduleEventId: string) {
    return supabase.from('schedule_events_public').select('current_participants, max_participants').eq('id', scheduleEventId).maybeSingle()
  },

  /** 公演（公開ビュー）の日時・題名・会場 */
  async findPublicEventForNotice(scheduleEventId: string) {
    return supabase.from('schedule_events_public').select('date, start_time, end_time, scenario, venue, organization_id').eq('id', scheduleEventId).single()
  },
}
