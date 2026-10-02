/**
 * スタッフ管理・スタッフプロフィールの読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const staffPageReadApi = {
  /** メールの部分一致でユーザーを最大10件 */
  async searchUsersByEmail(email: string) {
    return supabase
      .from('users')
      .select('id, email, role')
      .ilike('email', `%${email}%`)
      .limit(10)
  },

  /** ユーザー ID の一覧から、メール・作成日・更新日 */
  async listUsersByIds(userIds: string[]) {
    return supabase
      .from('users')
      .select('id, email, created_at, updated_at')
      .in('id', userIds)
  },

  /** メールでユーザーを1件（役割つき） */
  async findUserByEmailWithRole(email: string) {
    return supabase
      .from('users')
      .select('id, email, role')
      .eq('email', email)
      .single()
  },

  /** メールでユーザーを1件 */
  async findUserByEmail(email: string) {
    return supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single()
  },

  /** スタッフの担当シナリオ（GM可否・体験済み） */
  async listScenarioAssignmentsByStaff(staffId: string) {
    return supabase
      .from('staff_scenario_assignments')
          .select('scenario_master_id, can_gm, has_experienced')
      .eq('staff_id', staffId)
  },

  /** GM 回数の集計用: 期間内の公演（中止を除く） */
  async listEventsForGmCount(organizationId: string, since: string, until: string) {
    return supabase
      .from('schedule_events')
      .select('gms, gm_roles, category')
      .eq('organization_id', organizationId)
      .eq('is_cancelled', false)
      .gte('date', since)
      .lte('date', until)
  },

  /** スタッフ参加回数の集計用: 期間内のスタッフ参加予約 */
  async listStaffParticipationReservations(organizationId: string, since: string, until: string) {
    return supabase
      .from('reservations')
      .select('participant_names')
      .eq('organization_id', organizationId)
      .in('reservation_source', ['staff_entry', 'staff_participation'])
      .gte('requested_datetime', since)
      .lte('requested_datetime', `${until}T23:59:59+09:00`)
  },

  /** シナリオマスタの id と題名 */
  async listScenarioMasterTitles() {
    return supabase
      .from('scenario_masters')
      .select('id, title')
  },

  /** ログインユーザーのスタッフ行（id と名前） */
  async findStaffByUserId(userId: string) {
    return supabase
      .from('staff')
      .select('id, name')
      .eq('user_id', userId)
      .single()
  },

  /** 組織のシナリオ（GM 可能数・種別つき、題名順） */
  async listOrganizationScenariosForProfile(organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('scenario_master_id, title, author, gm_count, scenario_kind')
      .eq('organization_id', organizationId)
      .order('title', { ascending: true })
  },
}
