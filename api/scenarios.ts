import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ─── DB（service_role）────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const db = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

// ─── CORS ────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// ─── フィールド ───────────────────────────────────────────────────────────────
const SELECT_FIELDS = [
  'id', 'org_scenario_id', 'organization_id', 'scenario_master_id', 'slug',
  'status', 'org_status', 'title', 'author', 'author_email', 'author_id',
  'report_display_name', 'key_visual_url', 'description', 'synopsis', 'caution',
  'player_count_min', 'player_count_max', 'male_count', 'female_count', 'other_count',
  'duration', 'weekend_duration', 'genre', 'difficulty', 'has_pre_reading',
  'release_date', 'official_site_url', 'required_props',
  'participation_fee', 'gm_test_participation_fee', 'participation_costs',
  'flexible_pricing', 'use_flexible_pricing',
  'license_amount', 'gm_test_license_amount',
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
  'private_booking_time_slots', 'private_booking_blocked_slots',
].join(', ')

// ─── ハンドラ ─────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // 環境変数チェック
  if (!db) {
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean).join(', ')
    console.error('[scenarios] 環境変数が未設定:', missing)
    return res.status(500).json({ error: `環境変数が未設定です: ${missing}` })
  }

  // JWT 検証
  const authHeader = req.headers['authorization'] as string | undefined
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization ヘッダが必要です' })
  }
  const jwt = authHeader.slice(7)

  const { data: { user }, error: authError } = await db.auth.getUser(jwt)
  if (authError || !user) {
    return res.status(401).json({ error: 'トークンが無効または期限切れです' })
  }

  // org_id・role を DB から取得（JWT クレームを信用しない）
  const { data: profile, error: profileError } = await db
    .from('users')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.organization_id) {
    return res.status(403).json({ error: 'ユーザー情報が取得できません' })
  }

  const { organization_id: orgId, role } = profile
  if (!['admin', 'staff', 'license_admin'].includes(role)) {
    return res.status(403).json({ error: 'スタッフ以上の権限が必要です' })
  }

  const id = req.query.id as string | undefined
  const slug = req.query.slug as string | undefined

  // ?id=xxx → 単一シナリオ取得（master_id または org_scenario_id で検索）
  if (id) {
    return await handleGetById(res, orgId, id)
  }

  // ?slug=xxx → slug で単一シナリオ取得
  if (slug) {
    return await handleGetBySlug(res, orgId, slug)
  }

  // 一覧取得（org_id をサーバー側で強制フィルタ）
  const { data, error } = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('organization_id', orgId)
    .order('title', { ascending: true })

  if (error) {
    console.error('[scenarios] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  return res.status(200).json(data ?? [])
}

// 単一シナリオ取得: master_id または org_scenario_id で、まず自組織を、ダメなら共有シナリオを検索。
// 他組織の非共有シナリオを返さないよう is_shared=true で明示フィルタする（RLS に依存しない）。
async function handleGetById(res: VercelResponse, orgId: string, id: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  // 1. 自組織で id (= scenario_master_id) で検索
  const r1 = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (r1.data) return res.status(200).json(r1.data)
  if (r1.error && r1.error.code !== 'PGRST116') {
    console.error('[scenarios:getById] step1 error:', r1.error)
  }

  // 2. 自組織で org_scenario_id でも検索
  const r2 = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('org_scenario_id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (r2.data) return res.status(200).json(r2.data)
  if (r2.error && r2.error.code !== 'PGRST116') {
    console.error('[scenarios:getById] step2 error:', r2.error)
  }

  // 3. 共有シナリオ（他組織でも is_shared=true なら可）から id 検索
  const r3 = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('id', id)
    .eq('is_shared', true)
    .limit(1)
  if (r3.error) {
    console.error('[scenarios:getById] step3 error:', r3.error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: r3.error.message })
  }
  if (r3.data?.[0]) return res.status(200).json(r3.data[0])

  // 4. 共有シナリオから org_scenario_id でも検索
  const r4 = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('org_scenario_id', id)
    .eq('is_shared', true)
    .limit(1)
  if (r4.error) {
    console.error('[scenarios:getById] step4 error:', r4.error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: r4.error.message })
  }

  return res.status(200).json(r4.data?.[0] ?? null)
}

// slug で単一シナリオ取得（自組織 → 共有シナリオの順）
async function handleGetBySlug(res: VercelResponse, orgId: string, slug: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const r1 = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('slug', slug)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (r1.data) return res.status(200).json(r1.data)
  if (r1.error && r1.error.code !== 'PGRST116') {
    console.error('[scenarios:getBySlug] step1 error:', r1.error)
  }

  const r2 = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('slug', slug)
    .eq('is_shared', true)
    .limit(1)
  if (r2.error) {
    console.error('[scenarios:getBySlug] step2 error:', r2.error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: r2.error.message })
  }

  return res.status(200).json(r2.data?.[0] ?? null)
}
