/**
 * 設定まわりのフック（スタッフ行・全体設定・給与設定）の読み取りAPI
 *
 * フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 * Supabase の型推論の都合で、select 文字列は literal のまま保つ。
 */
import { supabase } from '@/lib/supabase'

const STAFF_SELECT_FIELDS =
  'id, organization_id, name, line_name, x_account, discord_id:discord_user_id, discord_channel_id, role, stores, ng_days, want_to_learn, available_scenarios, notes, phone, email, user_id, availability, experience, special_scenarios, status, avatar_url, avatar_color, created_at, updated_at' as const

const GLOBAL_SETTINGS_SELECT_FIELDS =
  'id, organization_id, shift_submission_start_day, shift_submission_end_day, shift_submission_target_months_ahead, shift_edit_deadline_days_before, system_name, maintenance_mode, maintenance_message, enable_email_notifications, enable_discord_notifications, pre_reading_notice_message' as const

const SALARY_SETTINGS_SELECT_FIELDS =
  'organization_id, gm_base_pay, gm_hourly_rate, gm_test_base_pay, gm_test_hourly_rate, reception_fixed_pay, use_hourly_table, hourly_rates, gm_test_hourly_rates, updated_at' as const

export const staffSettingsReadApi = {
  /** ログインユーザーのスタッフ行 */
  async findByUserId(userId: string) {
    return supabase.from('staff').select(STAFF_SELECT_FIELDS).eq('user_id', userId).maybeSingle()
  },
}

export const globalSettingsHookReadApi = {
  /** 組織の全体設定（1件） */
  async getByOrganization(organizationId: string) {
    return supabase.from('global_settings').select(GLOBAL_SETTINGS_SELECT_FIELDS).eq('organization_id', organizationId).single()
  },
}

export const salarySettingsReadApi = {
  /** 組織の給与設定（global_settings の給与列） */
  async getByOrganization(organizationId: string) {
    return supabase.from('global_settings').select(SALARY_SETTINGS_SELECT_FIELDS).eq('organization_id', organizationId).single()
  },
  /** 今日時点で有効な給与設定の履歴（適用開始日が最新の1件） */
  async findCurrentHistory(organizationId: string, today: string) {
    return supabase
      .from('salary_settings_history')
      .select('effective_from')
      .eq('organization_id', organizationId)
      .lte('effective_from', today)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle()
  },
  /** 現在の履歴より後の、次の適用開始日（1件） */
  async findNextHistory(organizationId: string, afterEffectiveFrom: string) {
    return supabase
      .from('salary_settings_history')
      .select('effective_from')
      .eq('organization_id', organizationId)
      .gt('effective_from', afterEffectiveFrom)
      .order('effective_from', { ascending: true })
      .limit(1)
      .maybeSingle()
  },
}
