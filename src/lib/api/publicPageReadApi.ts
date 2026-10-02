/**
 * 公開ページ（お問い合わせ・FAQ・店舗一覧）の読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const publicPageReadApi = {
  /** slug から、稼働中の組織（お問い合わせ先つき） */
  async findActiveOrganizationBySlug(slug: string) {
    return supabase
      .from('organizations')
      .select('id, name, slug, contact_email, contact_name')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()
  },

  /** ライセンス管理組織の共通 FAQ */
  async getCommonFaqItems() {
    return supabase
      .from('organizations')
      .select('common_faq_items')
      .eq('is_license_manager', true)
      .limit(1)
      .maybeSingle()
  },

  /** 組織の FAQ */
  async getOrganizationFaq(slug: string) {
    return supabase
      .from('organizations')
      .select('name, faq_items')
      .eq('slug', slug)
      .single()
  },

  /** 稼働中の組織の一覧（名前順） */
  async listActiveOrganizations() {
    return supabase
      .from('organizations')
      .select('id, slug, name, logo_url')
      .eq('is_active', true)
      .order('name')
  },
}
