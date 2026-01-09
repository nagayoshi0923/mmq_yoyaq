/**
 * 組織（マルチテナント）関連のヘルパー関数
 */
import { supabase } from './supabase'
import type { Organization, Staff } from '@/types'

// クインズワルツの organization_id（固定値）
export const QUEENS_WALTZ_ORG_ID = 'a0000000-0000-0000-0000-000000000001'

/**
 * 現在のユーザーの organization_id を取得
 * ※ staff テーブルから取得
 */
export async function getCurrentOrganizationId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: staff } = await supabase
    .from('staff')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  return staff?.organization_id || null
}

/**
 * 現在のユーザーのスタッフ情報を取得（organization_id 含む）
 */
export async function getCurrentStaff(): Promise<Staff | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: staff } = await supabase
    .from('staff')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return staff as Staff | null
}

/**
 * 現在のユーザーの組織情報を取得
 */
export async function getCurrentOrganization(): Promise<Organization | null> {
  const orgId = await getCurrentOrganizationId()
  if (!orgId) return null

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single()

  return org as Organization | null
}

/**
 * 現在のユーザーがライセンス管理組織に所属しているか
 */
export async function isLicenseManager(): Promise<boolean> {
  const org = await getCurrentOrganization()
  return org?.is_license_manager ?? false
}

/**
 * 組織一覧を取得（管理者用）
 */
export async function getOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('name')

  if (error) {
    console.error('Failed to fetch organizations:', error)
    return []
  }

  return data as Organization[]
}

/**
 * 組織を作成
 */
export async function createOrganization(org: Partial<Organization>): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: org.name,
      slug: org.slug,
      plan: org.plan || 'free',
      contact_email: org.contact_email,
      contact_name: org.contact_name,
      is_license_manager: org.is_license_manager || false,
      is_active: org.is_active ?? true,
      settings: org.settings || {},
      notes: org.notes,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create organization:', error)
    return null
  }

  return data as Organization
}

/**
 * 組織を更新
 */
export async function updateOrganization(
  id: string,
  updates: Partial<Organization>
): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Failed to update organization:', error)
    return null
  }

  return data as Organization
}

/**
 * slug から組織を取得
 */
export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('Failed to fetch organization by slug:', error)
    return null
  }

  return data as Organization
}

