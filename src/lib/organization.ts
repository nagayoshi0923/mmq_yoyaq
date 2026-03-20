/**
 * 組織（マルチテナント）関連のヘルパー関数
 */
import { logger } from '@/utils/logger'
import { supabase } from './supabase'
import type { Organization, Staff } from '@/types'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
/** 古いDBでも必ず存在する列のみ（マイグレーション未適用時のフォールバック用） */
export const ORGANIZATION_SELECT_CORE =
  'id, name, slug, plan, contact_email, contact_name, is_license_manager, is_active, settings, notes, created_at, updated_at' as const

/** 公開予約・ヘッダー等で使う標準セット */
export const ORGANIZATION_SELECT_STANDARD =
  `${ORGANIZATION_SELECT_CORE}, public_booking_hero_description, theme_color, header_image_url` as const

/** 管理画面（FAQ・アンケ設定等）で使う拡張セット */
export const ORGANIZATION_SELECT_STAFF_APP =
  `${ORGANIZATION_SELECT_STANDARD}, faq_items, common_faq_items, post_performance_survey_url, post_performance_survey_enabled` as const

function isMissingColumnOrSchemaSelectError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const o = err as { code?: string; message?: string; details?: string }
  const msg = `${o.message || ''} ${o.details || ''}`.toLowerCase()
  const code = String(o.code || '')
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    msg.includes('schema cache') ||
    (msg.includes('could not find') && msg.includes('column'))
  )
}

/**
 * 存在しない列を select したときだけ狭い列セットへフォールバック（本番がマイグレーションより古い場合の救済）
 */
async function fetchOrganizationRowWithSelectFallback(
  by: 'id' | 'slug',
  value: string,
  tiers: readonly string[],
  logLabel: 'id' | 'slug'
): Promise<Organization | null> {
  let lastError: unknown
  for (let i = 0; i < tiers.length; i++) {
    const fields = tiers[i]
    let q = supabase.from('organizations').select(fields)
    q = by === 'id' ? q.eq('id', value) : q.eq('slug', value)
    const { data, error } = await q.maybeSingle()
    if (!error) {
      return (data as unknown as Organization) ?? null
    }
    lastError = error
    const canRetry = i < tiers.length - 1 && isMissingColumnOrSchemaSelectError(error)
    if (!canRetry) {
      logger.error(
        logLabel === 'id' ? 'Failed to fetch organization by id:' : 'Failed to fetch organization by slug:',
        error
      )
      return null
    }
  }
  logger.error(
    logLabel === 'id' ? 'Failed to fetch organization by id:' : 'Failed to fetch organization by slug:',
    lastError
  )
  return null
}

/**
 * ログインスタッフの組織行取得（マイグレーション未適用のDBでは列の少ない select に自動フォールバック）
 */
export async function fetchOrganizationForStaffSession(orgId: string): Promise<Organization | null> {
  return fetchOrganizationRowWithSelectFallback(
    'id',
    orgId,
    [ORGANIZATION_SELECT_STAFF_APP, ORGANIZATION_SELECT_STANDARD, ORGANIZATION_SELECT_CORE],
    'id'
  )
}

const STAFF_SELECT_FIELDS =
  'id, organization_id, name, line_name, x_account, discord_id:discord_user_id, discord_channel_id, role, stores, ng_days, want_to_learn, available_scenarios, notes, phone, email, user_id, availability, experience, special_scenarios, status, avatar_url, avatar_color, created_at, updated_at' as const

// クインズワルツの organization_id（固定値）
export const QUEENS_WALTZ_ORG_ID = 'a0000000-0000-0000-0000-000000000001'

// 現在のユーザーのorganization_idキャッシュ（パフォーマンス最適化）
let currentOrgIdCache: { userId: string; orgId: string; timestamp: number } | null = null
const CURRENT_ORG_CACHE_TTL = 60 * 1000 // 1分

/**
 * 現在のユーザーの organization_id を取得
 * まず users テーブルから取得し、なければ staff テーブルにフォールバック
 */
export async function getCurrentOrganizationId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // キャッシュをチェック
  if (currentOrgIdCache && 
      currentOrgIdCache.userId === user.id && 
      Date.now() - currentOrgIdCache.timestamp < CURRENT_ORG_CACHE_TTL) {
    return currentOrgIdCache.orgId
  }

  // まず users テーブルから取得（高速・406エラー回避）
  try {
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()
    
    if (userData?.organization_id) {
      currentOrgIdCache = { userId: user.id, orgId: userData.organization_id, timestamp: Date.now() }
      return userData.organization_id
    }
  } catch (err) {
    // RLS/ネットワークなどで失敗しても次のフォールバックへ
    logger.warn('getCurrentOrganizationId: users lookup failed; fallback', err)
  }
  
  // フォールバック: staff テーブルから取得（後方互換性）
  try {
    const { data: staff } = await supabase
      .from('staff')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (staff?.organization_id) {
      currentOrgIdCache = { userId: user.id, orgId: staff.organization_id, timestamp: Date.now() }
      return staff.organization_id
    }
  } catch (err) {
    logger.warn('getCurrentOrganizationId: staff lookup failed; fallback', err)
  }

  // 最終フォールバック: DB関数（auth.uid()ベース）で取得
  // - RLS/ポリシー設定の揺れで users/staff の SELECT が不安定な場合の救済
  try {
    const { data: orgId, error } = await supabase.rpc('get_user_organization_id')
    if (error) {
      logger.warn('getCurrentOrganizationId: rpc get_user_organization_id failed', error)
    } else if (orgId) {
      currentOrgIdCache = { userId: user.id, orgId: String(orgId), timestamp: Date.now() }
      return String(orgId)
    }
  } catch (err) {
    logger.warn('getCurrentOrganizationId: rpc fallback threw', err)
  }

  return null
}

/**
 * 現在のユーザーのスタッフ情報を取得（organization_id 含む）
 */
export async function getCurrentStaff(): Promise<Staff | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: staff } = await supabase
    .from('staff')
    .select(STAFF_SELECT_FIELDS)
    .eq('user_id', user.id)
    .maybeSingle()  // レコードが存在しない場合もエラーにならない

  return staff as Staff | null
}

/**
 * 現在のユーザーの組織情報を取得
 */
export async function getCurrentOrganization(): Promise<Organization | null> {
  const orgId = await getCurrentOrganizationId()
  if (!orgId) return null

  return fetchOrganizationRowWithSelectFallback(
    'id',
    orgId,
    [ORGANIZATION_SELECT_STANDARD, ORGANIZATION_SELECT_CORE],
    'id'
  )
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
  const r1 = await supabase
    .from('organizations')
    .select(ORGANIZATION_SELECT_STANDARD)
    .order('name')

  if (!r1.error) {
    return (r1.data as unknown as Organization[]) ?? []
  }

  if (isMissingColumnOrSchemaSelectError(r1.error)) {
    const r2 = await supabase
      .from('organizations')
      .select(ORGANIZATION_SELECT_CORE)
      .order('name')
    if (!r2.error) {
      return (r2.data as unknown as Organization[]) ?? []
    }
    logger.error('Failed to fetch organizations:', r2.error)
    return []
  }

  logger.error('Failed to fetch organizations:', r1.error)
  return []
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
    logger.error('Failed to create organization:', error)
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
    logger.error('Failed to update organization:', error)
    return null
  }

  // slug 解決キャッシュを無効化（公開予約トップ等が即座に新文言を取れるように）
  orgCacheBySlug.clear()

  return data as Organization
}

/**
 * slug から組織を取得
 */
// 組織キャッシュ（パフォーマンス最適化）
const orgCacheBySlug: Map<string, { data: Organization; timestamp: number }> = new Map()
const ORG_CACHE_TTL = 5 * 60 * 1000 // 5分

/** 固定 organization_id（例: a0000000-…）や通常UUIDをスラッグと区別する */
function looksLikeOrganizationUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  )
}

function cacheOrganization(org: Organization) {
  const now = Date.now()
  orgCacheBySlug.set(org.slug, { data: org, timestamp: now })
  orgCacheBySlug.set(org.id, { data: org, timestamp: now })
}

/**
 * 組織ID（UUID）から組織を取得。キャッシュあり。
 * URL 先頭が誤って UUID になった場合は getOrganizationBySlug 経由でも利用される。
 */
export async function getOrganizationById(id: string): Promise<Organization | null> {
  const trimmed = id.trim()
  if (!looksLikeOrganizationUuid(trimmed)) return null

  const cached = orgCacheBySlug.get(trimmed)
  if (cached && Date.now() - cached.timestamp < ORG_CACHE_TTL) {
    return cached.data
  }

  const org = await fetchOrganizationRowWithSelectFallback(
    'id',
    trimmed,
    [ORGANIZATION_SELECT_STANDARD, ORGANIZATION_SELECT_CORE],
    'id'
  )

  if (org) {
    cacheOrganization(org)
  }

  return org
}

/**
 * 公開URLの先頭セグメント（スラッグ、または誤って organization_id が入った場合）から組織を解決する。
 * @param requireActive true のとき非アクティブ組織は null（公開予約トップ等）
 */
export async function resolveOrganizationFromPathSegment(
  slugOrId: string,
  opts?: { requireActive?: boolean }
): Promise<Organization | null> {
  const trimmed = slugOrId.trim()
  if (!trimmed) return null
  const org = await getOrganizationBySlug(trimmed)
  if (!org) return null
  const needActive = opts?.requireActive ?? true
  if (needActive && !org.is_active) return null
  return org
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const trimmed = slug.trim()
  if (looksLikeOrganizationUuid(trimmed)) {
    return getOrganizationById(trimmed)
  }

  // キャッシュをチェック
  const cached = orgCacheBySlug.get(trimmed)
  if (cached && Date.now() - cached.timestamp < ORG_CACHE_TTL) {
    return cached.data
  }

  const org = await fetchOrganizationRowWithSelectFallback(
    'slug',
    trimmed,
    [ORGANIZATION_SELECT_STANDARD, ORGANIZATION_SELECT_CORE],
    'slug'
  )

  if (org) {
    cacheOrganization(org)
  }

  return org
}

