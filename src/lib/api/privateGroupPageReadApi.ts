/**
 * 貸切グループ（作成・招待・管理・チャット）画面の読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const privateGroupPageReadApi = {
  /** 組織のシナリオ（グループ作成用） */
  async findScenarioForGroup(scenarioMasterId: string, organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('id, organization_id, scenario_master_id, title, key_visual_url, player_count_min, player_count_max, available_stores, duration')
      .eq('scenario_master_id', scenarioMasterId)
      .eq('organization_id', organizationId)
      .single()
  },

  /** 稼働中の店舗（臨時・オフィスを除く） */
  async listActiveStoresForGroup(organizationId: string) {
    return supabase
      .from('stores')
      .select('id, name, address, region')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .neq('is_temporary', true)
      .or('ownership_type.neq.office,ownership_type.is.null')
  },

  /** 組織の名前と連絡先メール */
  async findOrganizationContact(organizationId: string) {
    return supabase
      .from('organizations')
      .select('id, name, contact_email')
      .eq('id', organizationId)
      .single()
  },

  /** 組織の slug（作品ページ・注意事項への導線。お客様・ゲストも読める） */
  async findOrganizationSlug(organizationId: string) {
    return supabase.from('organizations').select('slug').eq('id', organizationId).maybeSingle()
  },

  /** 組織の連絡先メール */
  async findOrganizationContactEmail(organizationId: string) {
    return supabase
      .from('organizations')
      .select('contact_email')
      .eq('id', organizationId)
      .single()
  },

  /** 顧客の有効なクーポン（残り回数があり、期限内。キャンペーン情報つき） */
  async listActiveCouponsForGroup(customerId: string, nowIso: string, organizationId?: string, selectedCouponId?: string | null) {
    let query = supabase.from('customer_coupons').select(`id, expires_at, status, uses_remaining, coupon_campaigns (id, name, discount_amount)`).eq('customer_id', customerId)
    if (organizationId) query = query.eq('organization_id', organizationId)
    if (selectedCouponId) return query.or(`and(status.eq.active,uses_remaining.gt.0,expires_at.is.null),and(status.eq.active,uses_remaining.gt.0,expires_at.gte.${nowIso}),id.eq.${selectedCouponId}`)
    return query.eq('status', 'active').gt('uses_remaining', 0).or(`expires_at.is.null,expires_at.gte.${nowIso}`)
  },

  /** 店舗の id と名前（id で） */
  async listStoresByIds(storeIds: string[]) {
    return supabase.from('stores').select('id, name').in('id', storeIds)
  },

  /** シナリオの対応店舗 */
  async findScenarioAvailableStores(scenarioMasterId: string, organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('available_stores')
      .eq('scenario_master_id', scenarioMasterId)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle()
  },

  /** 組織の稼働中の店舗（名前順） */
  async listActiveStoresOfOrganization(organizationId: string) {
    return supabase
      .from('stores')
      .select('id, name, short_name, ownership_type, is_temporary')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('name')
  },

  /** 組織の稼働中の店舗（id で。不足分の補完用） */
  async listActiveStoresByIdsInOrganization(storeIds: string[], organizationId: string) {
    return supabase
      .from('stores')
      .select('id, name, short_name, ownership_type, is_temporary')
      .in('id', storeIds)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
  },

  /** 本人の顧客行の電話番号（組織を指定） */
  /** 自分の顧客行の電話番号（お客様の行は organization_id が NULL なので user_id だけで引く。複数あれば最新） */
  async findOwnCustomerPhone(userId: string) {
    return supabase
      .from('customers')
      .select('phone')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  },

  /** チャットの設定（有効・ゲスト可・システムメッセージの題名） */
  async getChatSettings(organizationId: string) {
    return supabase
      .from('global_settings')
      .select('chat_enabled, chat_guest_allowed, system_msg_candidate_dates_added_title, system_msg_pre_reading_notice_title, system_msg_survey_notice_title, system_msg_performance_cancelled_title')
      .eq('organization_id', organizationId)
      .maybeSingle()
  },
}
