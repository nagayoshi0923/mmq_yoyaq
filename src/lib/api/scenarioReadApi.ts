/**
 * シナリオ（マスタ・キャラクター・組織のシナリオ）の読み取りAPI
 *
 * 画面・部品から supabase.from() を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const scenarioMasterReadApi = {
  /** マスタから追加ダイアログ: 承認済みと申請中のマスタを題名順 */
  async listForAdd() {
    return supabase
      .from('scenario_masters')
      .select('id, title, author, author_id, key_visual_url, description, player_count_min, player_count_max, official_duration, genre, difficulty, synopsis, caution, required_items, master_status, submitted_by_organization_id, approved_by, approved_at, rejection_reason, created_at, updated_at, created_by')
      .in('master_status', ['pending', 'approved'])
      .order('title', { ascending: true })
  },
  /** マスタ選択ダイアログ: 承認済みと申請中のマスタを題名順（ギャラリー・センシティブタグ付き） */
  async listForPicker() {
    return supabase
      .from('scenario_masters')
      .select('id, title, author, author_id, key_visual_url, gallery_images, description, player_count_min, player_count_max, official_duration, genre, difficulty, synopsis, caution, sensitive_tags, required_items, master_status, submitted_by_organization_id, approved_by, approved_at, rejection_reason, created_at, updated_at, created_by')
      .in('master_status', ['approved', 'pending'])
      .order('title')
  },
  /** マスタ編集ダイアログ: 1件を全項目で取得 */
  async getForEdit(masterId: string) {
    return supabase
      .from('scenario_masters')
      .select('id, title, author, author_id, author_email, key_visual_url, gallery_images, description, player_count_min, player_count_max, official_duration, genre, difficulty, synopsis, caution, required_items, has_pre_reading, release_date, official_site_url, master_status, submitted_by_organization_id, approved_by, approved_at, rejection_reason, created_at, updated_at, created_by')
      .eq('id', masterId)
      .single()
  },
}

export const scenarioCharacterReadApi = {
  async listByMaster(masterId: string) {
    return supabase
      .from('scenario_characters')
      .select('id, scenario_master_id, name, description, image_url, sort_order')
      .eq('scenario_master_id', masterId)
      .order('sort_order', { ascending: true })
  },
}

export const organizationScenarioReadApi = {
  /** マスタを使っている組織の一覧（組織名つき） */
  async listByMasterWithOrganization(masterId: string) {
    return supabase
      .from('organization_scenarios')
      .select(`
          id,
          organization_id,
          org_status,
          organizations(name)
        `)
      .eq('scenario_master_id', masterId)
  },
  /** 個別通知・予約確認・貸切確認のメール上書きテンプレート */
  async getEmailTemplates(orgScenarioId: string) {
    return supabase
      .from('organization_scenarios')
      .select('individual_notice_template, reservation_confirmation_template, private_confirm_template')
      .eq('id', orgScenarioId)
      .maybeSingle()
  },
  /** マスタと組織から、組織のシナリオの id を探す */
  async findIdByMaster(masterId: string, organizationId: string) {
    return supabase
      .from('organization_scenarios')
      .select('id')
      .eq('scenario_master_id', masterId)
      .eq('organization_id', organizationId)
      .maybeSingle()
  },
  /** アンケート画面: マスタ ID から、組織のシナリオ表示ビューを1件 */
  async getSurveyViewByMaster(scenarioMasterId: string, organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('org_scenario_id, survey_enabled, characters, player_count_max, individual_notice_template')
      .eq('scenario_master_id', scenarioMasterId)
      .eq('organization_id', organizationId)
      .maybeSingle()
  },
  /** アンケート画面: 組織のシナリオ ID から、表示ビューを1件 */
  async getSurveyViewByOrgScenarioId(orgScenarioId: string, organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('org_scenario_id, survey_enabled, characters, player_count_max, individual_notice_template')
      .eq('org_scenario_id', orgScenarioId)
      .eq('organization_id', organizationId)
      .maybeSingle()
  },
}
