// api/scenarios.ts の GET（一覧・単体・公開・ページング・累計回数）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { LEGACY_SCENARIO_FIELDS, PUBLIC_DETAIL_FIELDS, PUBLIC_FIELDS, SELECT_FIELDS, STATS_SCHEDULE_EVENT_COUNT_FIELDS, db } from './common.js'
import { handleGetScenarioStats, handleGetAllScenarioStats } from './stats.js'

// ─── GET ルーティング ─────────────────────────────────────────────────────────
export async function routeGet(req: VercelRequest, res: VercelResponse, orgId: string, isAnon: boolean) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const id = req.query.id as string | undefined
  const slug = req.query.slug as string | undefined
  const type = req.query.type as string | undefined

  if (id) return await handleGetById(res, orgId, id, isAnon)
  if (slug) return await handleGetBySlug(res, orgId, slug, isAnon)

  // 公開一覧は公開フィールド・有効組織に限定。管理一覧や統計は認証必須。
  if (type === 'public') return await handleGetPublic(res, orgId)

  // anon は管理一覧・統計へアクセスできない。
  if (isAnon) {
    return res.status(401).json({ error: 'Authorization ヘッダが必要です' })
  }

  if (type === 'legacy') return await handleGetAllLegacy(res, orgId)
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

// 単一シナリオ取得: master_id または org_scenario_id で、自組織のシナリオのみ検索する。
// 他組織のシナリオは返さない（機密漏洩防止のため is_shared フォールバックは廃止）。
// anon の場合は公開フィールド + status='available' で絞り込む。
export async function handleGetById(res: VercelResponse, orgId: string, id: string, isAnon: boolean) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const fields = isAnon ? PUBLIC_DETAIL_FIELDS : SELECT_FIELDS

  // 1. 自組織で id (= scenario_master_id) で検索
  let q1 = db
    .from('organization_scenarios_with_master')
    .select(fields)
    .eq('id', id)
    .eq('organization_id', orgId)
  if (isAnon) q1 = q1.eq('status', 'available')
  const r1 = await q1.maybeSingle()
  if (r1.data) return res.status(200).json(r1.data)
  if (r1.error && r1.error.code !== 'PGRST116') {
    console.error('[scenarios:getById] step1 error:', r1.error)
  }

  // 2. 自組織で org_scenario_id でも検索
  let q2 = db
    .from('organization_scenarios_with_master')
    .select(fields)
    .eq('org_scenario_id', id)
    .eq('organization_id', orgId)
  if (isAnon) q2 = q2.eq('status', 'available')
  const r2 = await q2.maybeSingle()
  if (r2.data) return res.status(200).json(r2.data)
  if (r2.error && r2.error.code !== 'PGRST116') {
    console.error('[scenarios:getById] step2 error:', r2.error)
  }

  // 自組織で見つからなければ 404。
  // （他組織の is_shared シナリオを返すフォールバックは機密漏洩のため廃止）
  return res.status(404).json({ error: 'シナリオが見つかりません' })
}

// slug で単一シナリオ取得
// 1. 自組織の slug で直接検索
// 2. 他組織の slug からマスターIDを取得 → 自組織でそのマスターIDを検索
//    （マスターのslugを複数組織で共有する場合の正しい引き当て。返すのは常に自組織のレコード）
export async function handleGetBySlug(res: VercelResponse, orgId: string, slug: string, isAnon: boolean) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const fields = isAnon ? PUBLIC_DETAIL_FIELDS : SELECT_FIELDS

  // Step 1: 自組織の org_slug で検索
  let q1 = db
    .from('organization_scenarios_with_master')
    .select(fields)
    .eq('slug', slug)
    .eq('organization_id', orgId)
  if (isAnon) q1 = q1.eq('status', 'available')
  const r1 = await q1.maybeSingle()
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
      let qOrg = db
        .from('organization_scenarios_with_master')
        .select(fields)
        .eq('scenario_master_id', masterIdFromSlug)
        .eq('organization_id', orgId)
      if (isAnon) qOrg = qOrg.eq('status', 'available')
      const rOrg = await qOrg.maybeSingle()
      if (rOrg.data) return res.status(200).json(rOrg.data)
    }
  }

  // 自組織で見つからなければ 404。
  // （他組織の is_shared シナリオを返すフォールバックは機密漏洩のため廃止）
  return res.status(404).json({ error: 'シナリオが見つかりません' })
}

// 旧 scenarios テーブルから取得（レガシー機能用）。組織でフィルタ。
export async function handleGetAllLegacy(res: VercelResponse, orgId: string) {
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
export async function handleGetPublic(res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  if (!orgId) return res.status(400).json({ error: 'org_id is required' })
  const { data: organization, error: orgError } = await db
    .from('organizations').select('id').eq('id', orgId).eq('is_active', true).maybeSingle()
  if (orgError) return res.status(500).json({ error: '組織の確認に失敗しました' })
  if (!organization) return res.status(404).json({ error: '公開中の組織が見つかりません' })
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
export async function handleGetPaginated(req: VercelRequest, res: VercelResponse, orgId: string) {
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
export async function handleGetPerformanceCount(req: VercelRequest, res: VercelResponse, orgId: string) {
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
