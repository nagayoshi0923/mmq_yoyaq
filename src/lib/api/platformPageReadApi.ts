/**
 * プラットフォームのトップ・シナリオ検索の読み取り・RPC の API
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const platformPageReadApi = {
  /** 公開中のシナリオのキー（RPC） */
  async getPublicAvailableScenarioKeys() {
    return supabase.rpc('get_public_available_scenario_keys')
  },

  /** 公開中のシナリオ（組織名つき、題名順） */
  async listAvailableScenarioViews() {
    return supabase
      .from('organization_scenarios_with_master')
      .select(`
        id, org_scenario_id, slug, title, author, key_visual_url,
        duration, player_count_min, player_count_max,
        genre, participation_fee, difficulty, release_date,
        organization_id, status, scenario_master_id, available_stores,
        organizations:organization_id (slug, name)
      `)
      .eq('status', 'available')
      .order('title')
  },

  /** 公開の店舗の一覧（RPC） */
  async getAllPublicStores() {
    return supabase.rpc('get_all_public_stores')
  },

  /** 公開のカテゴリの一覧（RPC） */
  async getAllPublicCategories() {
    return supabase.rpc('get_all_public_categories')
  },

  /** 稼働中の組織（名前順） */
  async listActiveOrganizations() {
    return supabase.from('organizations').select('id, slug, name, logo_url').eq('is_active', true).order('name')
  },

  /** 稼働中の店舗（臨時・オフィスを除く。地域・名前順） */
  async listActiveStores() {
    return supabase.from('stores').select('id, name, short_name, region, address, organization_id').eq('status', 'active').or('is_temporary.is.null,is_temporary.eq.false').neq('ownership_type', 'office').order('region', { ascending: true }).order('name', { ascending: true })
  },

  /** 承認済みのシナリオマスタの id */
  async listApprovedMasterIds() {
    return supabase.from('scenario_masters').select('id').eq('master_status', 'approved')
  },

  /** 今日以降の公開公演（予約受付中、最大200件） */
  async listUpcomingOpenEvents(today: string) {
    return supabase.from('schedule_events').select(`id, date, start_time, current_participants, max_participants, organization_id, scenario_masters:scenario_master_id!inner (id, title, key_visual_url, player_count_min, player_count_max, official_duration, author), stores:store_id (id, name, short_name, color, region)`).gte('date', today).in('category', ['open', 'offsite']).eq('is_cancelled', false).eq('is_reservation_enabled', true).order('date', { ascending: true }).limit(200)
  },

  /** 指定日時以降に作られた有効な予約（人気の集計用） */
  async listRecentReservationsSince(sinceIso: string) {
    return supabase.from('reservations').select('schedule_event_id, participant_count, status').gte('created_at', sinceIso).in('status', ['confirmed', 'pending', 'checked_in'])
  },

  /** slug のある組織のシナリオ */
  async listOrganizationScenarioSlugs() {
    return supabase.from('organization_scenarios').select('scenario_master_id, slug').not('slug', 'is', null)
  },

  /** 公開済みのブログ記事（新しい順に3件） */
  async listLatestPublishedBlogPosts() {
    return supabase
      .from('blog_posts')
      .select('id, title, slug, excerpt, cover_image_url, published_at, organization_id')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(3)
  },
}
