import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ─── DB（service_role）────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const db = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

// NOTE: schedule_events_staff_view ではなく schedule_events を直接参照する。
// 理由: スタッフ向けビューは `WHERE is_staff_or_admin()` で auth.uid() を見るが、
// この API ハンドラは service role で実行されるため auth.uid() が NULL になり
// ビュー越しでは常に 0 件しか返らない。requireStaff(user) で既にスタッフ権限を
// 確認しているので、ビューの追加チェックは不要。

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
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

// 旧 scenarios テーブル（getAllLegacy 用）
const LEGACY_SCENARIO_FIELDS = [
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
const PUBLIC_FIELDS = [
  'id', 'title', 'key_visual_url', 'author', 'duration',
  'player_count_min', 'player_count_max', 'genre', 'release_date',
  'status', 'participation_fee', 'scenario_type', 'organization_id',
].join(', ')

// 統計集計用に getScenarioStats が必要とする最小カラム
const STATS_SCENARIO_FIELDS = [
  'player_count_max', 'license_amount', 'gm_test_license_amount',
  'license_rewards', 'participation_fee', 'gm_test_participation_fee',
  'participation_costs', 'gm_costs', 'duration',
].join(', ')

const STATS_SCHEDULE_EVENT_COUNT_FIELDS = 'id'

const STATS_SCHEDULE_EVENT_DETAIL_FIELDS =
  'id, date, category, current_participants, total_revenue, gm_cost, license_cost, ' +
  'start_time, store_id, is_cancelled, stores:store_id(venue_cost_per_performance)'

const STATS_ALL_SCHEDULE_EVENT_FIELDS =
  'scenario_master_id, is_cancelled, total_revenue, date, category'

const STATS_RESERVATION_FIELDS =
  'schedule_event_id, participant_count, reservation_source, payment_method'

const STATS_FUTURE_RESERVATION_FIELDS = 'id'

// クライアント側の reservationSource 定数と一致させる必要があるが、
// /api/* は ESM 単独で動くため、定数を直接列挙する（src/lib/constants の DEMO/STAFF と同じ値）。
// 値がずれた場合の影響範囲は集計値のみ（権限境界には影響しない）。
const STAFF_RESERVATION_SOURCES = new Set<string>([
  'manual_staff',
  'staff',
])
const DEMO_RESERVATION_SOURCES = new Set<string>([
  'manual_demo',
  'demo',
])

// ─── 認証ヘルパー ─────────────────────────────────────────────────────────────
type AuthResult = { orgId: string; userId: string; role: string }

async function authenticate(
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
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization ヘッダが必要です' })
    return null
  }
  const jwt = authHeader.slice(7)

  const { data: { user }, error: authError } = await db.auth.getUser(jwt)
  if (authError || !user) {
    res.status(401).json({ error: 'トークンが無効または期限切れです' })
    return null
  }

  const { data: profile, error: profileError } = await db
    .from('users')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    res.status(403).json({ error: 'ユーザー情報が取得できません' })
    return null
  }

  const role = profile.role as string

  // GET リクエストは customer ロールも許可（シナリオ詳細は顧客も閲覧可）
  // 書き込み操作（POST/PATCH/DELETE）は admin 以上が必要（DB RLS と統一）
  if (req.method !== 'GET' && !['admin', 'license_admin'].includes(role)) {
    res.status(403).json({ error: '管理者権限が必要です' })
    return null
  }

  // org_id: クエリパラメータ優先 → users.organization_id にフォールバック
  const queryOrgId = (req.query.org_id ?? req.body?.org_id) as string | undefined
  const orgId = queryOrgId || (profile.organization_id as string | null) || ''

  return {
    userId: user.id,
    orgId,
    role,
  }
}

// ─── ハンドラ ─────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const method = req.method
  if (method !== 'GET' && method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticate(req, res)
  if (!auth) return // authenticate がレスポンスを返している

  const { orgId } = auth

  try {
    if (method === 'GET') return await routeGet(req, res, orgId)
    if (method === 'POST') return await routePost(req, res, orgId)
    if (method === 'PATCH') return await routePatch(req, res, orgId)
    if (method === 'DELETE') return await routeDelete(req, res, orgId)
  } catch (err) {
    console.error('[scenarios] unexpected error:', err)
    return res.status(500).json({
      error: 'サーバーエラーが発生しました',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─── GET ルーティング ─────────────────────────────────────────────────────────
async function routeGet(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const id = req.query.id as string | undefined
  const slug = req.query.slug as string | undefined
  const type = req.query.type as string | undefined

  if (id) return await handleGetById(res, orgId, id)
  if (slug) return await handleGetBySlug(res, orgId, slug)

  if (type === 'legacy') return await handleGetAllLegacy(res, orgId)
  if (type === 'public') return await handleGetPublic(res, orgId)
  if (type === 'paginated') return await handleGetPaginated(req, res, orgId)
  if (type === 'performance-count') return await handleGetPerformanceCount(req, res, orgId)
  if (type === 'stats') return await handleGetScenarioStats(req, res, orgId)
  if (type === 'all-stats') return await handleGetAllScenarioStats(res, orgId)

  // デフォルト: 一覧取得（org_id をサーバー側で強制フィルタ）
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

// slug で単一シナリオ取得
// 1. 自組織の slug で直接検索
// 2. 他組織の slug からマスターIDを取得 → 自組織でそのマスターIDを検索
//    （マスターのslugを複数組織で共有する場合の正しい引き当て）
// 3. is_shared=true の共有シナリオから検索（フォールバック）
async function handleGetBySlug(res: VercelResponse, orgId: string, slug: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  // Step 1: 自組織の org_slug で検索
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

  // Step 2: slug を持つ任意組織のシナリオからマスターIDを取得し、自組織で同マスターを検索
  // （マスター共有シナリオ：aaa が slug 未設定でも queens-waltz の slug 'factor' で引き当て可能）
  if (orgId) {
    const rMaster = await db
      .from('organization_scenarios_with_master')
      .select('scenario_master_id')
      .eq('slug', slug)
      .limit(1)
    const masterIdFromSlug = rMaster.data?.[0]?.scenario_master_id
    if (masterIdFromSlug) {
      const rOrg = await db
        .from('organization_scenarios_with_master')
        .select(SELECT_FIELDS)
        .eq('scenario_master_id', masterIdFromSlug)
        .eq('organization_id', orgId)
        .maybeSingle()
      if (rOrg.data) return res.status(200).json(rOrg.data)
    }
  }

  // Step 3: is_shared=true の共有シナリオから（フォールバック）
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

// 旧 scenarios テーブルから取得（レガシー機能用）。組織でフィルタ。
async function handleGetAllLegacy(res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const { data, error } = await db
    .from('scenarios')
    .select(LEGACY_SCENARIO_FIELDS)
    .eq('organization_id', orgId)
    .order('title', { ascending: true })
  if (error) {
    console.error('[scenarios:legacy] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// 公開用シナリオ（status='available' のみ、自組織のみ）
async function handleGetPublic(res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const { data, error } = await db
    .from('organization_scenarios_with_master')
    .select(PUBLIC_FIELDS)
    .eq('status', 'available')
    .eq('organization_id', orgId)
    .order('title', { ascending: true })
  if (error) {
    console.error('[scenarios:public] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ページネーション
async function handleGetPaginated(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const page = Math.max(0, Number.parseInt((req.query.page as string) ?? '0', 10) || 0)
  const pageSize = Math.min(
    1000,
    Math.max(1, Number.parseInt((req.query.pageSize as string) ?? '20', 10) || 20),
  )
  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('title', { ascending: true })
    .range(from, to)

  if (error) {
    console.error('[scenarios:paginated] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  return res.status(200).json({
    data: data ?? [],
    count: count ?? 0,
    hasMore: count ? from + pageSize < count : false,
  })
}

// 累計公演回数（scenario_master_id 指定、組織でフィルタ、非中止のみ）
async function handleGetPerformanceCount(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const scenarioId = req.query.scenarioId as string | undefined
  if (!scenarioId) {
    return res.status(400).json({ error: 'scenarioId が必要です' })
  }

  const { count, error } = await db
    .from('schedule_events')
    .select(STATS_SCHEDULE_EVENT_COUNT_FIELDS, { count: 'exact', head: true })
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .not('status', 'eq', 'cancelled')

  if (error) {
    console.error('[scenarios:performance-count] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  return res.status(200).json({ count: count ?? 0 })
}

// シナリオ統計（公演回数・売上・コスト等）
async function handleGetScenarioStats(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const scenarioId = req.query.scenarioId as string | undefined
  if (!scenarioId) {
    return res.status(400).json({ error: 'scenarioId が必要です' })
  }
  const today = new Date().toISOString().split('T')[0]

  // ── シナリオの料金・GM報酬等のメタ情報を取得（自組織） ───────────────────
  const { data: _scenarioRaw } = await db
    .from('organization_scenarios_with_master')
    .select(STATS_SCENARIO_FIELDS)
    .eq('id', scenarioId)
    .eq('organization_id', orgId)
    .maybeSingle()
  const scenarioData = _scenarioRaw as {
    player_count_max?: number
    license_amount?: number
    gm_test_license_amount?: number
    license_rewards?: Array<{ item: string; amount: number }>
    participation_fee?: number
    gm_test_participation_fee?: number
    participation_costs?: Array<{ time_slot: string; amount: number }>
    gm_costs?: Array<{ category?: string; reward?: number }>
    duration?: number
  } | null

  const maxParticipants = scenarioData?.player_count_max ?? 99
  const defaultLicenseAmount = scenarioData?.license_amount ?? 0
  const defaultGmTestLicenseAmount = scenarioData?.gm_test_license_amount ?? 0
  const licenseRewards = scenarioData?.license_rewards
  const normalLicenseFromRewards = licenseRewards?.find((r) => r.item === 'normal')?.amount
  const gmTestLicenseFromRewards = licenseRewards?.find((r) => r.item === 'gmtest')?.amount
  const normalLicenseAmount = normalLicenseFromRewards ?? defaultLicenseAmount
  const gmTestLicenseAmount = gmTestLicenseFromRewards ?? defaultGmTestLicenseAmount

  const participationCosts = scenarioData?.participation_costs
  const normalParticipationFee =
    participationCosts?.find((c) => c.time_slot === 'normal')?.amount ??
    (scenarioData?.participation_fee ?? 0)
  const gmTestParticipationFee =
    participationCosts?.find((c) => c.time_slot === 'gmtest')?.amount ??
    (scenarioData?.gm_test_participation_fee ?? 0)

  const gmAssignments = scenarioData?.gm_costs
  const hasCustomGmCosts = !!gmAssignments && gmAssignments.length > 0
  let normalGmReward = 0
  let gmTestGmReward = 0
  if (hasCustomGmCosts && gmAssignments) {
    normalGmReward = gmAssignments
      .filter((a) => (a.category || 'normal') === 'normal')
      .reduce((sum, a) => sum + (a.reward || 0), 0)
    gmTestGmReward = gmAssignments
      .filter((a) => a.category === 'gmtest')
      .reduce((sum, a) => sum + (a.reward || 0), 0) || Math.max(0, normalGmReward - 2000)
  }
  // NOTE: 旧実装ではフロントの useSalarySettings を使ってカスタム GM コストが無い場合に
  // 給与設定から動的計算していた。サーバ側からは fetchSalarySettings を呼べないため、
  // ここでは normalGmReward=0 / gmTestGmReward=0 のまま進める。
  // 影響: 旧実装で自動計算されていた GM コスト集計が 0 になる可能性がある。
  // TODO: salary_settings を読み込んでサーバ側でも calculateGmWage 相当を実装する。

  // ── 公演回数 ────────────────────────────────────────────────────────────
  const { count: performanceCount, error: perfError } = await db
    .from('schedule_events')
    .select(STATS_SCHEDULE_EVENT_COUNT_FIELDS, { count: 'exact', head: true })
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .lte('date', today)
    .neq('category', 'offsite')
    .neq('is_cancelled', true)
  if (perfError) throw perfError

  const { count: cancelledCount, error: cancelError } = await db
    .from('schedule_events')
    .select(STATS_SCHEDULE_EVENT_COUNT_FIELDS, { count: 'exact', head: true })
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .lte('date', today)
    .neq('category', 'offsite')
    .eq('is_cancelled', true)
  if (cancelError) throw cancelError

  // ── 初公演日 ────────────────────────────────────────────────────────────
  const { data: firstEvent, error: firstError } = await db
    .from('schedule_events')
    .select('date')
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .lte('date', today)
    .neq('category', 'offsite')
    .neq('is_cancelled', true)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle()
  const firstPerformanceDate = firstError ? null : (firstEvent?.date as string | null) ?? null

  // ── 公演イベント詳細 ────────────────────────────────────────────────────
  const { data: events, error: eventsError } = await db
    .from('schedule_events')
    .select(STATS_SCHEDULE_EVENT_DETAIL_FIELDS)
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .lte('date', today)
    .order('date', { ascending: false })
  if (eventsError) throw eventsError

  type EventRow = {
    id: string
    date: string
    category: string | null
    current_participants: number | null
    total_revenue: number | null
    gm_cost: number | null
    license_cost: number | null
    start_time: string | null
    store_id: string | null
    is_cancelled: boolean | null
    stores?: { venue_cost_per_performance?: number | null } | null
  }
  const eventList = (events ?? []) as unknown as EventRow[]
  const eventIds = eventList.map((e) => e.id)
  const demoParticipantsMap: Record<string, number> = {}
  const actualParticipantsMap: Record<string, number> = {}
  const staffParticipantsMap: Record<string, number> = {}

  if (eventIds.length > 0) {
    const BATCH_SIZE = 100
    type ResRow = {
      schedule_event_id: string | null
      participant_count: number | null
      reservation_source: string | null
      payment_method: string | null
    }
    const allReservations: ResRow[] = []

    for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
      const batchIds = eventIds.slice(i, i + BATCH_SIZE)
      const { data, error: resError } = await db
        .from('reservations')
        .select(STATS_RESERVATION_FIELDS)
        .eq('organization_id', orgId)
        .in('schedule_event_id', batchIds)
        .in('status', ['confirmed', 'gm_confirmed'])
      if (!resError && data) {
        allReservations.push(...(data as unknown as ResRow[]))
      }
    }

    for (const r of allReservations) {
      if (!r.schedule_event_id) continue
      const count = r.participant_count ?? 0
      const src = r.reservation_source ?? ''
      if (DEMO_RESERVATION_SOURCES.has(src)) {
        demoParticipantsMap[r.schedule_event_id] = (demoParticipantsMap[r.schedule_event_id] ?? 0) + count
      } else if (STAFF_RESERVATION_SOURCES.has(src) || r.payment_method === 'staff') {
        staffParticipantsMap[r.schedule_event_id] = (staffParticipantsMap[r.schedule_event_id] ?? 0) + count
      } else {
        actualParticipantsMap[r.schedule_event_id] = (actualParticipantsMap[r.schedule_event_id] ?? 0) + count
      }
    }
  }

  let totalRevenue = 0
  let totalParticipants = 0
  let totalStaffParticipants = 0
  let totalGmCost = 0
  let totalLicenseCost = 0
  let totalVenueCost = 0
  const venueCostSet = new Set<number>()
  const performanceDates: Array<{
    date: string
    category: string
    participants: number
    demoParticipants: number
    staffParticipants: number
    revenue: number
    startTime: string
    storeId: string | null
    isCancelled: boolean
  }> = []

  for (const event of eventList) {
    const isCancelled = event.is_cancelled === true
    const demoCount = demoParticipantsMap[event.id] ?? 0
    const staffCount = staffParticipantsMap[event.id] ?? 0
    const actualCount = actualParticipantsMap[event.id] ?? 0
    const reservationParticipants = actualCount + demoCount
    const rawParticipants = reservationParticipants > 0
      ? reservationParticipants
      : event.current_participants ?? 0
    const participants = Math.min(rawParticipants, maxParticipants)

    const isGmTest = event.category === 'gmtest'
    const fee = isGmTest ? gmTestParticipationFee : normalParticipationFee
    const eventRevenue = event.total_revenue ?? participants * fee
    const eventGmCost = event.gm_cost ?? (isGmTest ? gmTestGmReward : normalGmReward)

    if (!isCancelled) {
      totalParticipants += participants
      totalStaffParticipants += staffCount
      totalRevenue += eventRevenue
      totalGmCost += eventGmCost

      let licenseCost = event.license_cost ?? 0
      if (licenseCost === 0) {
        licenseCost = isGmTest ? gmTestLicenseAmount : normalLicenseAmount
      }
      totalLicenseCost += licenseCost

      const venueCost = event.stores?.venue_cost_per_performance ?? 0
      totalVenueCost += venueCost
      if (venueCost > 0) venueCostSet.add(venueCost)
    }

    performanceDates.push({
      date: event.date,
      category: event.category ?? 'open',
      participants,
      demoParticipants: demoCount,
      staffParticipants: staffCount,
      revenue: eventRevenue,
      startTime: event.start_time ?? '',
      storeId: event.store_id ?? null,
      isCancelled,
    })
  }

  const perfCount = performanceCount ?? 0
  const venueCostPerPerformance =
    venueCostSet.size === 1
      ? [...venueCostSet][0]
      : venueCostSet.size > 1
        ? Math.round(totalVenueCost / (perfCount || 1))
        : 0

  // ── 将来分カウント ──────────────────────────────────────────────────────
  const { count: futurePerformanceCount } = await db
    .from('schedule_events')
    .select(STATS_SCHEDULE_EVENT_COUNT_FIELDS, { count: 'exact', head: true })
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .gt('date', today)
    .neq('category', 'offsite')
    .neq('is_cancelled', true)

  const { count: futureReservationCount } = await db
    .from('reservations')
    .select(STATS_FUTURE_RESERVATION_FIELDS, { count: 'exact', head: true })
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .is('schedule_event_id', null)
    .in('status', ['confirmed', 'gm_confirmed', 'pending'])

  return res.status(200).json({
    performanceCount: perfCount,
    cancelledCount: cancelledCount ?? 0,
    totalRevenue,
    totalParticipants,
    totalStaffParticipants,
    totalGmCost,
    totalLicenseCost,
    totalVenueCost,
    venueCostPerPerformance,
    firstPerformanceDate,
    performanceDates,
    futurePerformanceCount: futurePerformanceCount ?? 0,
    futureReservationCount: futureReservationCount ?? 0,
  })
}

// 全シナリオの統計（リスト表示用、scenario_master_id ごとに集計）
async function handleGetAllScenarioStats(res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const today = new Date().toISOString().split('T')[0]

  const pageSize = 1000
  let page = 0
  let hasMore = true
  type EventStatsRow = {
    scenario_master_id: string | null
    is_cancelled: boolean | null
    total_revenue: number | null
    date: string
    category: string | null
  }
  const allEvents: EventStatsRow[] = []

  while (hasMore) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await db
      .from('schedule_events')
      .select(STATS_ALL_SCHEDULE_EVENT_FIELDS)
      .eq('organization_id', orgId)
      .lte('date', today)
      .neq('category', 'offsite')
      .range(from, to)
      .order('date', { ascending: false })
    if (error) {
      console.error('[scenarios:all-stats] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    const rows = (data ?? []) as unknown as EventStatsRow[]
    allEvents.push(...rows)
    hasMore = rows.length === pageSize
    page++
  }

  const statsMap: Record<string, { performanceCount: number; cancelledCount: number; totalRevenue: number }> = {}
  for (const event of allEvents) {
    const sid = event.scenario_master_id
    if (!sid) continue
    if (!statsMap[sid]) {
      statsMap[sid] = { performanceCount: 0, cancelledCount: 0, totalRevenue: 0 }
    }
    if (event.is_cancelled) {
      statsMap[sid].cancelledCount++
    } else {
      statsMap[sid].performanceCount++
      statsMap[sid].totalRevenue += event.total_revenue ?? 0
    }
  }

  return res.status(200).json(statsMap)
}

// ─── POST: create ────────────────────────────────────────────────────────────
async function routePost(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const scenario = (body.scenario ?? body) as Record<string, unknown>
  if (!scenario || typeof scenario !== 'object') {
    return res.status(400).json({ error: 'scenario が必要です' })
  }
  const title = scenario.title as string | undefined
  if (!title) {
    return res.status(400).json({ error: 'title が必要です' })
  }

  // STEP 1: scenario_masters に追加（submitted_by_organization_id は JWT 由来の orgId）
  const masterPayload = {
    title,
    author: (scenario.author as string | null) ?? null,
    author_email: (scenario.author_email as string | null) ?? null,
    description: (scenario.description as string | null) ?? null,
    synopsis: (scenario.synopsis as string | null) ?? null,
    player_count_min: (scenario.player_count_min as number | null) ?? 4,
    player_count_max: (scenario.player_count_max as number | null) ?? 6,
    official_duration: (scenario.duration as number | null) ?? 180,
    weekend_duration: (scenario.weekend_duration as number | null) ?? null,
    genre: (scenario.genre as unknown[] | null) ?? [],
    difficulty: scenario.difficulty !== undefined && scenario.difficulty !== null
      ? String(scenario.difficulty)
      : null,
    key_visual_url: (scenario.key_visual_url as string | null) ?? null,
    has_pre_reading: (scenario.has_pre_reading as boolean | null) ?? false,
    release_date: (scenario.release_date as string | null) ?? null,
    official_site_url: (scenario.official_site_url as string | null) ?? null,
    master_status: 'draft',
    submitted_by_organization_id: orgId,
  }

  const { data: masterData, error: masterError } = await db
    .from('scenario_masters')
    .insert(masterPayload)
    .select('id')
    .single()

  if (masterError || !masterData) {
    console.error('[scenarios:create] scenario_masters insert error:', masterError)
    return res.status(500).json({
      error: 'シナリオマスター作成に失敗しました',
      detail: masterError?.message,
    })
  }

  const scenarioMasterId = masterData.id as string

  // STEP 2: organization_scenarios に追加
  const orgStatus = scenario.status === 'available' ? 'available' : 'unavailable'
  const orgScenarioPayload = {
    organization_id: orgId, // ← JWT 由来。クライアント引数は無視
    scenario_master_id: scenarioMasterId,
    slug: (scenario.slug as string | null) ?? null,
    duration: (scenario.duration as number | null) ?? null,
    participation_fee: (scenario.participation_fee as number | null) ?? null,
    gm_test_participation_fee: (scenario.gm_test_participation_fee as number | null) ?? null,
    extra_preparation_time: (scenario.extra_preparation_time as number | null) ?? null,
    org_status: orgStatus,
    license_amount: (scenario.license_amount as number | null) ?? null,
    gm_test_license_amount: (scenario.gm_test_license_amount as number | null) ?? null,
    franchise_license_amount: (scenario.franchise_license_amount as number | null) ?? null,
    franchise_gm_test_license_amount: (scenario.franchise_gm_test_license_amount as number | null) ?? null,
    gm_count: (scenario.gm_count as number | null) ?? null,
    gm_costs: (scenario.gm_costs as unknown[] | null) ?? [],
    gm_assignments: (scenario.gm_assignments as unknown) ?? null,
    available_gms: (scenario.available_gms as unknown[] | null) ?? [],
    experienced_staff: (scenario.experienced_staff as unknown[] | null) ?? [],
    available_stores: (scenario.available_stores as unknown[] | null) ?? [],
    production_cost: (scenario.production_cost as number | null) ?? null,
    production_costs: (scenario.production_costs as unknown[] | null) ?? [],
    depreciation_per_performance: (scenario.depreciation_per_performance as number | null) ?? null,
    play_count: (scenario.play_count as number | null) ?? 0,
    notes: (scenario.notes as string | null) ?? null,
  }

  const { error: orgScenarioError } = await db
    .from('organization_scenarios')
    .insert(orgScenarioPayload)
    .select('id')
    .single()

  if (orgScenarioError) {
    console.error('[scenarios:create] organization_scenarios insert error:', orgScenarioError)
    return res.status(500).json({
      error: 'シナリオ作成に失敗しました（マスターは作成済み）',
      detail: orgScenarioError.message,
    })
  }

  // 作成したデータをビューから取得
  const { data: createdScenario, error: fetchError } = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('id', scenarioMasterId)
    .eq('organization_id', orgId)
    .single()

  if (fetchError || !createdScenario) {
    console.error('[scenarios:create] fetch after insert error:', fetchError)
    return res.status(500).json({
      error: '作成後のシナリオ取得に失敗しました',
      detail: fetchError?.message,
    })
  }

  return res.status(201).json(createdScenario)
}

// ─── PATCH: update / updateAvailableGms / updateAvailableGmsWithSync ─────────
async function routePatch(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const action = (req.query.action as string | undefined) ?? 'update'
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  if (action === 'update') return await handleUpdate(req, res, orgId, id)
  if (action === 'updateAvailableGms') return await handleUpdateAvailableGms(req, res, orgId, id)
  if (action === 'updateAvailableGmsWithSync') {
    return await handleUpdateAvailableGmsWithSync(req, res, orgId, id)
  }

  return res.status(400).json({ error: `unknown action: ${action}` })
}

// 自組織が対象 scenario_master_id の organization_scenarios 行を保有しているか確認し、
// その行 ID を返す。共有シナリオであっても、自組織がまだ取り込んでいなければ更新不可。
async function ensureOwnedByOrg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
  orgId: string,
  scenarioMasterId: string,
): Promise<{ orgScenarioId: string } | null> {
  const { data } = await database
    .from('organization_scenarios')
    .select('id')
    .eq('scenario_master_id', scenarioMasterId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!data?.id) return null
  return { orgScenarioId: data.id as string }
}

async function handleUpdate(req: VercelRequest, res: VercelResponse, orgId: string, id: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const updates = (body.updates ?? body) as Record<string, unknown>
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates が必要です' })
  }

  // マルチテナント境界: 自組織がこのシナリオを保有しているかチェック
  const owned = await ensureOwnedByOrg(db, orgId, id)
  if (!owned) {
    return res.status(404).json({ error: 'シナリオが見つかりません' })
  }

  // organization_scenarios の更新ペイロード組み立て
  const orgScenarioData: Record<string, unknown> = {}

  if (updates.status) {
    const validOrgStatuses = ['available', 'unavailable', 'coming_soon']
    if (validOrgStatuses.includes(updates.status as string)) {
      orgScenarioData.org_status = updates.status
    }
  }

  const directOrgColumns = [
    'slug', 'duration', 'participation_fee', 'gm_test_participation_fee',
    'extra_preparation_time', 'license_amount', 'gm_test_license_amount',
    'franchise_license_amount', 'franchise_gm_test_license_amount',
    'available_gms', 'experienced_staff', 'available_stores',
    'gm_costs', 'gm_count', 'gm_assignments',
    'production_cost', 'production_costs', 'depreciation_per_performance',
    'play_count', 'notes', 'participation_costs', 'flexible_pricing', 'use_flexible_pricing',
    'booking_start_date', 'booking_end_date', 'private_booking_time_slots',
  ] as const
  for (const col of directOrgColumns) {
    if (updates[col] !== undefined) {
      orgScenarioData[col] = updates[col]
    }
  }

  const overrideMapping: Record<string, string> = {
    title: 'override_title',
    author: 'override_author',
    genre: 'override_genre',
    difficulty: 'override_difficulty',
    player_count_min: 'override_player_count_min',
    player_count_max: 'override_player_count_max',
  }
  for (const [scenarioCol, orgCol] of Object.entries(overrideMapping)) {
    if (updates[scenarioCol] !== undefined) {
      orgScenarioData[orgCol] = updates[scenarioCol]
    }
  }

  const customMapping: Record<string, string> = {
    key_visual_url: 'custom_key_visual_url',
    description: 'custom_description',
    synopsis: 'custom_synopsis',
    caution: 'custom_caution',
  }
  for (const [scenarioCol, orgCol] of Object.entries(customMapping)) {
    if (updates[scenarioCol] !== undefined) {
      orgScenarioData[orgCol] = updates[scenarioCol]
    }
  }

  if (Object.keys(orgScenarioData).length > 0) {
    orgScenarioData.updated_at = new Date().toISOString()
    const { error: orgError } = await db
      .from('organization_scenarios')
      .update(orgScenarioData)
      .eq('id', owned.orgScenarioId)
      .eq('organization_id', orgId)
    if (orgError) {
      console.error('[scenarios:update] organization_scenarios error:', orgError)
      return res.status(500).json({ error: '更新に失敗しました', detail: orgError.message })
    }
  }

  // マスターを draft → pending に昇格（自組織が「公開中」にした場合のみ）
  // TODO: 共有マスター（他組織が作成）の master_status を勝手に変えるのはリスクあり。
  // 現状は旧挙動と同じく、自組織がこのマスターを保有していることを ensureOwnedByOrg で
  // 確認済みなので、draft→pending 昇格自体は許可している。将来的には
  // submitted_by_organization_id が自組織であることもチェックすることを検討する。
  if (updates.status === 'available') {
    const { data: masterData } = await db
      .from('scenario_masters')
      .select('id, master_status')
      .eq('id', id)
      .maybeSingle()

    if (masterData && (masterData as { master_status?: string }).master_status === 'draft') {
      await db
        .from('scenario_masters')
        .update({ master_status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', id)
    }
  }

  const { data: updatedScenario, error: fetchError } = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()

  if (fetchError || !updatedScenario) {
    console.error('[scenarios:update] fetch error:', fetchError)
    return res.status(500).json({
      error: '更新後のシナリオ取得に失敗しました',
      detail: fetchError?.message,
    })
  }

  return res.status(200).json(updatedScenario)
}

async function handleUpdateAvailableGms(
  req: VercelRequest,
  res: VercelResponse,
  orgId: string,
  id: string,
) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const availableGms = body.availableGms
  if (!Array.isArray(availableGms)) {
    return res.status(400).json({ error: 'availableGms (配列) が必要です' })
  }

  const owned = await ensureOwnedByOrg(db, orgId, id)
  if (!owned) {
    return res.status(404).json({ error: 'シナリオが見つかりません' })
  }

  const { error } = await db
    .from('organization_scenarios')
    .update({ available_gms: availableGms, updated_at: new Date().toISOString() })
    .eq('id', owned.orgScenarioId)
    .eq('organization_id', orgId)
  if (error) {
    console.error('[scenarios:updateAvailableGms] error:', error)
    return res.status(500).json({ error: '更新に失敗しました', detail: error.message })
  }

  const { data: updatedScenario, error: fetchError } = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()
  if (fetchError || !updatedScenario) {
    console.error('[scenarios:updateAvailableGms] fetch error:', fetchError)
    return res.status(500).json({
      error: '更新後のシナリオ取得に失敗しました',
      detail: fetchError?.message,
    })
  }
  return res.status(200).json(updatedScenario)
}

// NOTE: staff.special_scenarios への同期は廃止済み。staff_scenario_assignments が唯一のソース。
// 現時点では updateAvailableGms と同じ実装。互換性のため別アクションとして残す。
async function handleUpdateAvailableGmsWithSync(
  req: VercelRequest,
  res: VercelResponse,
  orgId: string,
  id: string,
) {
  return await handleUpdateAvailableGms(req, res, orgId, id)
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
async function routeDelete(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  // マルチテナント境界: 自組織がこのシナリオを保有しているかチェック
  const owned = await ensureOwnedByOrg(db, orgId, id)
  if (!owned) {
    return res.status(404).json({ error: 'シナリオが見つかりません' })
  }

  // 1. reservations の scenario_master_id を NULL に（自組織のみ）
  const { error: reservationError } = await db
    .from('reservations')
    .update({ scenario_master_id: null })
    .eq('scenario_master_id', id)
    .eq('organization_id', orgId)
  if (reservationError) {
    console.error('[scenarios:delete] reservations update error:', reservationError)
  }

  // 2. schedule_events の scenario_master_id を NULL に（自組織のみ）
  const { error: scheduleError } = await db
    .from('schedule_events')
    .update({ scenario_master_id: null })
    .eq('scenario_master_id', id)
    .eq('organization_id', orgId)
  if (scheduleError) {
    console.error('[scenarios:delete] schedule_events update error:', scheduleError)
  }

  // 3. staff_scenario_assignments を削除（自組織のみ）
  const { error: assignmentError } = await db
    .from('staff_scenario_assignments')
    .delete()
    .eq('scenario_master_id', id)
    .eq('organization_id', orgId)
  if (assignmentError) {
    console.error('[scenarios:delete] staff_scenario_assignments delete error:', assignmentError)
  }

  // 4. performance_kits を削除（自組織分のみ）
  const { error: kitsError } = await db
    .from('performance_kits')
    .delete()
    .eq('scenario_master_id', id)
    .eq('organization_id', orgId)
  if (kitsError) {
    console.error('[scenarios:delete] performance_kits delete error:', kitsError)
  }

  // 5. organization_scenarios 本体を削除（scenario_masters は残す）
  const { error } = await db
    .from('organization_scenarios')
    .delete()
    .eq('id', owned.orgScenarioId)
    .eq('organization_id', orgId)
  if (error) {
    console.error('[scenarios:delete] organization_scenarios delete error:', error)
    return res.status(500).json({ error: '削除に失敗しました', detail: error.message })
  }

  return res.status(200).json({ success: true })
}
