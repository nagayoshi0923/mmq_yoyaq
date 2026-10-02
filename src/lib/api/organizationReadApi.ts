/**
 * 組織・店舗・全体設定・ログイン直後のプロフィールの読み取りAPI
 *
 * 画面・部品から supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const organizationReadApi = {
  /** 組織の slug（通知メールの URL 用）。見つからなければエラー */
  async getSlugById(organizationId: string) {
    return supabase.from('organizations').select('slug').eq('id', organizationId).single()
  },
  /** 組織の slug。見つからなければ null */
  async findSlugById(organizationId: string) {
    return supabase.from('organizations').select('slug').eq('id', organizationId).maybeSingle()
  },
}

export const storeUsageReadApi = {
  /** 店舗の削除前の確認: この店舗の公演の件数 */
  async countEvents(storeId: string) {
    return supabase.from('schedule_events_staff_view').select('id', { count: 'exact', head: true }).eq('store_id', storeId)
  },
  /** 店舗の削除前の確認: この店舗の予約の件数 */
  async countReservations(storeId: string) {
    return supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('store_id', storeId)
  },
  /** 店舗の削除前の確認: この店舗のキットの件数 */
  async countKits(storeId: string) {
    return supabase.from('performance_kits').select('id', { count: 'exact', head: true }).eq('store_id', storeId)
  },
  /** 店舗の所属組織 */
  async findOrganizationId(storeId: string) {
    return supabase.from('stores').select('organization_id').eq('id', storeId).maybeSingle()
  },
}

export const loginProfileReadApi = {
  /** メールの登録状況（RPC） */
  async checkEmailRegistrationStatus(email: string) {
    return supabase.rpc('check_email_registration_status', { p_email: email })
  },
  /** ログイン直後: users の役割・組織・店舗代表フラグ */
  async findUserProfile(userId: string) {
    return supabase.from('users').select('role, organization_id, is_store_representative').eq('id', userId).maybeSingle()
  },
  /** ログイン直後: スタッフ行と、所属組織の slug（結合） */
  async findStaffWithOrganizationSlug(userId: string) {
    return supabase.from('staff').select('organization_id, role, organizations(slug)').eq('user_id', userId).maybeSingle()
  },
  /** ログイン直後: スタッフ行だけ（結合が使えないときの代替） */
  async findStaffOnly(userId: string) {
    return supabase.from('staff').select('organization_id, role').eq('user_id', userId).maybeSingle()
  },
}

export const globalSettingsReadApi = {
  /** 組織の個別通知の既定本文 */
  async getIndividualNoticeDefaultBody(organizationId: string) {
    return supabase.from('global_settings').select('individual_notice_default_body').eq('organization_id', organizationId).maybeSingle()
  },
}
