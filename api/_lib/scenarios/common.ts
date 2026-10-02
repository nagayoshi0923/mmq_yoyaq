// api/scenarios.ts の共通部分（DB、CORS、SELECT 定数、予約ソース定数、認証ヘルパー）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import { requireAuth, requireStaff, requireAdmin, ApiError } from '../auth.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ─── DB（service_role）────────────────────────────────────────────────────────
export const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
export const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export const db = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

// NOTE: schedule_events_staff_view ではなく schedule_events を直接参照する。
// 理由: スタッフ向けビューは `WHERE is_staff_or_admin()` で auth.uid() を見るが、
// この API ハンドラは service role で実行されるため auth.uid() が NULL になり
// ビュー越しでは常に 0 件しか返らない。requireStaff(user) で既にスタッフ権限を
// 確認しているので、ビューの追加チェックは不要。

// ─── CORS ────────────────────────────────────────────────────────────────────
export const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

export function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// ─── フィールド ───────────────────────────────────────────────────────────────
export const SELECT_FIELDS = [
  'id', 'org_scenario_id', 'organization_id', 'scenario_master_id', 'slug',
  'status', 'org_status', 'title', 'author', 'author_email', 'author_id',
  'report_display_name', 'key_visual_url', 'description', 'synopsis', 'caution',
  'player_count_min', 'player_count_max', 'male_count', 'female_count', 'other_count',
  'duration', 'weekend_duration', 'genre', 'difficulty', 'has_pre_reading',
  'release_date', 'official_site_url', 'required_props',
  'participation_fee', 'gm_test_participation_fee', 'participation_costs',
  'flexible_pricing', 'use_flexible_pricing',
  'license_amount', 'gm_test_license_amount', 'is_license_buyout',
  'franchise_license_amount', 'franchise_gm_test_license_amount',
  'external_license_amount', 'external_gm_test_license_amount',
  'fc_receive_license_amount', 'fc_receive_gm_test_license_amount',
  'fc_author_license_amount', 'fc_author_gm_test_license_amount',
  'gm_costs', 'gm_count', 'gm_assignments', 'available_gms', 'experienced_staff',
  'available_stores', 'production_cost', 'production_costs', 'depreciation_per_performance',
  'extra_preparation_time', 'play_count', 'notes', 'created_at', 'updated_at',
  'master_status', 'pricing_patterns', 'is_shared', 'scenario_type', 'rating',
  'kit_count', 'license_rewards', 'is_recommended',
  'survey_url', 'survey_enabled', 'survey_deadline_days',
  'characters', 'pre_reading_notice_message',
  'booking_start_date', 'booking_end_date',
  'individual_notice_template', 'character_assignment_method',
  'private_booking_time_slots', 'private_booking_blocked_slots', 'private_booking_slot_start_times',
  'sensitive_tags',
  'scenario_kind', 'accepts_private_booking',
].join(', ')

// 旧 scenarios テーブル（getAllLegacy 用）
export const LEGACY_SCENARIO_FIELDS = [
  'id', 'title', 'slug', 'description', 'author', 'author_email', 'report_display_name',
  'duration', 'weekend_duration', 'player_count_min', 'player_count_max',
  'male_count', 'female_count', 'other_count',
  'difficulty', 'rating', 'status', 'scenario_type',
  'participation_fee', 'participation_costs', 'gm_costs',
  'license_amount', 'gm_test_license_amount',
  'franchise_license_amount', 'franchise_gm_test_license_amount',
  'external_license_amount', 'external_gm_test_license_amount',
  'license_rewards', 'production_cost', 'genre', 'has_pre_reading', 'key_visual_url',
  'notes', 'required_props', 'production_costs', 'kit_count', 'gm_count',
  'available_stores', 'scenario_master_id', 'organization_id', 'is_shared',
  'extra_preparation_time', 'available_gms', 'play_count', 'release_date',
  'is_recommended', 'created_at', 'updated_at',
].join(', ')

// 公開用（一般ユーザ向け）。マスタービュー上で必要な最小カラムのみ。
export const PUBLIC_FIELDS = [
  'id', 'title', 'key_visual_url', 'author', 'duration', 'synopsis',
  'player_count_min', 'player_count_max', 'genre', 'release_date',
  'status', 'participation_fee', 'scenario_type', 'organization_id',
  'scenario_kind', 'accepts_private_booking',
  'booking_start_date', 'booking_end_date', 'available_stores',
].join(', ')

// 未ログイン顧客がシナリオ詳細ページで参照する公開フィールド。
// 営業/制作系のカラム（gm_costs, license_amount, gm_assignments, notes 等）は含めない。
export const PUBLIC_DETAIL_FIELDS = [
  'id', 'org_scenario_id', 'organization_id', 'scenario_master_id', 'slug',
  'status', 'title', 'author', 'key_visual_url',
  'description', 'synopsis', 'caution',
  'player_count_min', 'player_count_max', 'male_count', 'female_count', 'other_count',
  'duration', 'weekend_duration', 'extra_preparation_time',
  'genre', 'difficulty', 'has_pre_reading',
  'release_date', 'official_site_url',
  'participation_fee', 'participation_costs',
  'available_stores',
  'is_shared', 'scenario_type', 'rating',
  'characters',
  'booking_start_date', 'booking_end_date',
  'private_booking_time_slots', 'private_booking_blocked_slots',
  'sensitive_tags',
  'scenario_kind', 'accepts_private_booking',
].join(', ')

// 統計集計用に getScenarioStats が必要とする最小カラム
export const STATS_SCENARIO_FIELDS = [
  'player_count_max', 'license_amount', 'gm_test_license_amount',
  'license_rewards', 'participation_fee', 'gm_test_participation_fee',
  'participation_costs', 'gm_costs', 'duration',
].join(', ')

export const STATS_SCHEDULE_EVENT_COUNT_FIELDS = 'id'

export const STATS_SCHEDULE_EVENT_DETAIL_FIELDS =
  'id, date, category, current_participants, total_revenue, gm_cost, license_cost, ' +
  'start_time, store_id, is_cancelled, gms, gm_roles, staff_assignments:schedule_event_staff_assignments(staff_id,staff_name,ordinal,resolution_status), stores:store_id(venue_cost_per_performance,transport_allowance)'

export const STATS_ALL_SCHEDULE_EVENT_FIELDS =
  'scenario_master_id, is_cancelled, total_revenue, date, category'

export const STATS_RESERVATION_FIELDS =
  'schedule_event_id, participant_count, reservation_source, payment_method'

export const STATS_FUTURE_RESERVATION_FIELDS = 'id'

// クライアント側の reservationSource 定数と一致させる必要があるが、
// /api/* は ESM 単独で動くため、定数を直接列挙する（src/lib/constants の DEMO/STAFF と同じ値）。
// 値がずれた場合の影響範囲は集計値のみ（権限境界には影響しない）。
export const STAFF_RESERVATION_SOURCES = new Set<string>([
  'manual_staff',
  'staff',
])
export const DEMO_RESERVATION_SOURCES = new Set<string>([
  'manual_demo',
  'demo',
])

// ─── 認証ヘルパー ─────────────────────────────────────────────────────────────
export type AuthResult = { orgId: string; userId: string; role: string; isAnon: boolean }

export async function authenticate(
  req: VercelRequest,
  res: VercelResponse,
): Promise<AuthResult | null> {
  if (!db) {
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean).join(', ')
    console.error('[scenarios] 環境変数が未設定:', missing)
    res.status(500).json({ error: `環境変数が未設定です: ${missing}` })
    return null
  }

  const authHeader = req.headers['authorization'] as string | undefined
  const publicRead = req.method === 'GET' && Boolean(req.query.id || req.query.slug || req.query.type === 'public')
  const requestedOrg = (req.query.org_id ?? req.body?.org_id) as string | undefined
  try {
    let result: AuthResult
    if (!authHeader?.startsWith('Bearer ')) {
      if (!publicRead || !requestedOrg) throw new ApiError(401, 'Authorization ヘッダが必要です')
      result = { orgId: requestedOrg, userId: '', role: 'anon', isAnon: true }
    } else {
      const user = await requireAuth(req)
      const staffRole = ['admin', 'staff', 'license_admin'].includes(user.role)
      // 顧客と他組織の閲覧はログイン済みでも公開用の投影だけを使用する。
      if (publicRead && (user.role === 'customer' || (staffRole && requestedOrg && requestedOrg !== user.orgId))) {
        const orgId = requestedOrg || user.orgId
        if (!orgId) throw new ApiError(400, '公開対象の組織が必要です')
        result = { orgId, userId: user.userId, role: user.role, isAnon: true }
      } else {
        requireStaff(user)
        if (!user.orgId || (requestedOrg && requestedOrg !== user.orgId)) {
          throw new ApiError(403, 'この組織の管理情報にはアクセスできません')
        }
        if (req.method !== 'GET') requireAdmin(user)
        result = { orgId: user.orgId, userId: user.userId, role: user.role, isAnon: false }
      }
    }
    if (result.isAnon) {
      const { data: organization, error } = await db.from('organizations').select('id')
        .eq('id', result.orgId).eq('is_active', true).maybeSingle()
      if (error) throw new ApiError(503, '公開対象の組織を確認できませんでした')
      if (!organization) throw new ApiError(404, '公開対象の組織が見つかりません')
    }
    return result
  } catch (error) {
    if (error instanceof ApiError) res.status(error.status).json({ error: error.message })
    else res.status(500).json({ error: '認証情報を確認できませんでした' })
    return null
  }
}
