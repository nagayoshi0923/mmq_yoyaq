/**
 * 組織の全体設定（global_settings）と店舗別の通知設定（notification_settings）の書き込みAPI
 *
 * 画面から supabase.from() を直接呼ばず、ここを通す（整備 Phase 2）。
 * 絞り込み条件（id か organization_id か）は画面ごとに元のまま。戻り値は supabase の { data, error } をそのまま返す。
 */
import { supabase } from '@/lib/supabase'

export const globalSettingsApi = {
  /** id で絞って更新（システム名・シフト・通知の全体設定） */
  async updateById(id: string, fields: Record<string, unknown>) {
    return supabase.from('global_settings').update(fields).eq('id', id)
  },
  /** 組織で絞って更新（キット移動の設定） */
  async updateByOrganization(organizationId: string, fields: Record<string, unknown>) {
    return supabase.from('global_settings').update(fields).eq('organization_id', organizationId)
  },
}

export const storeNotificationSettingsApi = {
  async update(id: string, fields: Record<string, unknown>) {
    return supabase.from('notification_settings').update(fields).eq('id', id)
  },
  /** 店舗別の通知設定を新規作成して返す */
  async create(row: Record<string, unknown>) {
    return supabase.from('notification_settings').insert(row).select().single()
  },
}

export const userNotificationApi = {
  /** 通知を既読にする（1件） */
  async markRead(id: string) {
    return supabase.from('user_notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id)
  },
  /** 通知を既読にする（複数） */
  async markManyRead(ids: string[]) {
    return supabase.from('user_notifications').update({ is_read: true, read_at: new Date().toISOString() }).in('id', ids)
  },
  /** ニックネーム未登録の会員に「プロフィールの登録をお願いします」を 1 回だけ出す（DB 側で 1 回に限る。マイページ改修 段階 4） */
  async ensureProfileNotice() {
    return supabase.rpc('ensure_profile_incomplete_notice')
  },
}

export const waitlistApi = {
  /** キャンセル待ちに登録する */
  async create(row: Record<string, unknown>) {
    return supabase.from('waitlist').insert(row)
  },
}

export const kitLocationWriteApi = {
  /** キット数を減らしたときに、超えた番号のキット位置を消す。org_scenario_id か scenario_id のどちらかで絞る */
  async deleteAboveCount(organizationId: string, scenarioKey: 'org_scenario_id' | 'scenario_id', scenarioId: string, keepCount: number) {
    return supabase.from('scenario_kit_locations').delete()
      .eq('organization_id', organizationId).eq(scenarioKey, scenarioId).gt('kit_number', keepCount)
  },
}

export const dataManagementSettingsApi = {
  /** 店舗のデータ出力設定を id で更新する */
  async updateById(id: string, fields: Record<string, unknown>) {
    return supabase.from('data_management_settings').update(fields).eq('id', id)
  },
  /** 店舗のデータ出力設定を新規作成して返す */
  async create(row: Record<string, unknown>) {
    return supabase.from('data_management_settings').insert(row).select().single()
  },
}
