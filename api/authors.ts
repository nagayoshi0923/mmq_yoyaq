import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError } from './_lib/auth.js'

/**
 * Authors API
 *
 * authors テーブルは organization_id を持たない「全組織共有マスタ」。
 * マルチテナント境界:
 *   - READ: authenticated（staff 以上）に制限。顧客は参照しない想定。
 *   - WRITE: staff 以上のみ。
 *   - service_role で RLS をバイパスするため、サーバ側で role を必ず requireStaff で検証する。
 *
 * 既存 RPC 関数を service_role で呼ぶ:
 *   - get_all_authors / get_author_by_name / upsert_author
 * 直接 SQL 操作:
 *   - notes フィールドへの直書き（setOrganizationName, markEmailSent, delete）
 *
 * フロント側の authorApi.ts のメソッドと 1:1 で対応する type 分岐:
 *   GET    ?type=list            → 全作者
 *   GET    ?type=by-name&name=   → 名前で取得
 *   GET    ?type=current-email   → ログイン中ユーザーのメールアドレス
 *   GET    ?type=scenarios-by-email&email=
 *   GET    ?type=reports-by-email&email=&status?=&startDate?=&endDate?=
 *   GET    ?type=summary-by-email&email=
 *   GET    ?type=dashboard       → 自分のダッシュボード
 *   POST   ?type=upsert          body: { name, email?, notes?, license_organization_name? }
 *   PATCH  ?type=set-org-name    body: { authorName, organizationName, memo? }
 *   PATCH  ?type=mark-email-sent body: { authorName, year, month }
 *   PATCH  ?type=update          body: { id, ...updates }
 *   DELETE ?id=xxx               → 削除
 */

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

// notes フィールドへの license_organization_name エンコード（フロントと同じロジック）
const ORG_NOTES_KEY = '__org__'
const SENT_YM_KEY = '__sent_ym__'

type AuthorNotes = { orgName: string | null; memo: string | null; sentYm: string | null }

function parseAuthorNotes(rawNotes: string | null | undefined): AuthorNotes {
  if (!rawNotes) return { orgName: null, memo: null, sentYm: null }
  try {
    const parsed = JSON.parse(rawNotes)
    if (parsed && typeof parsed === 'object' && ORG_NOTES_KEY in parsed) {
      return {
        orgName: (parsed[ORG_NOTES_KEY] as string) || null,
        memo: (parsed.memo as string) || null,
        sentYm: (parsed[SENT_YM_KEY] as string) || null,
      }
    }
  } catch {
    /* 非JSON = 旧来のプレーンテキスト */
  }
  return { orgName: null, memo: rawNotes, sentYm: null }
}

function encodeAuthorNotes(
  orgName: string | null,
  memo: string | null,
  sentYm?: string | null
): string | null {
  if (!orgName && !memo && !sentYm) return null
  if (!orgName && !sentYm) return memo
  return JSON.stringify({
    [ORG_NOTES_KEY]: orgName || '',
    memo: memo || '',
    ...(sentYm ? { [SENT_YM_KEY]: sentYm } : {}),
  })
}

function decodeAuthor(raw: Record<string, unknown>) {
  const { orgName, memo, sentYm } = parseAuthorNotes(raw.notes as string | null)
  return {
    id: raw.id as string,
    name: raw.name as string,
    email: (raw.email as string | null) ?? null,
    license_organization_name:
      orgName ?? ((raw.license_organization_name as string | null) ?? null),
    notes: memo,
    last_email_sent_ym: sentYm,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  }
}

const AUTHOR_PERFORMANCE_REPORT_SELECT_FIELDS =
  'author_email, author_name, scenario_master_id, scenario_title, organization_id, organization_name, report_id, performance_date, performance_count, participant_count, venue_name, report_status, reported_at, license_amount, calculated_license_fee'
const AUTHOR_SUMMARY_SELECT_FIELDS =
  'author_email, total_scenarios, total_approved_reports, total_performance_count, total_license_fee, organizations_count'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    // authors テーブルは全組織共有マスタだが、参照・書き込みともに
    // スタッフ以上の権限が必要（顧客は使わない）
    requireStaff(user)

    const type = (req.query.type as string | undefined) ?? ''

    if (req.method === 'GET') {
      switch (type) {
        case 'list':
          return await handleList(res)
        case 'by-name':
          return await handleGetByName(req, res)
        case 'current-email':
          return await handleCurrentEmail(res, user.userId)
        case 'scenarios-by-email':
          return await handleScenariosByEmail(req, res)
        case 'reports-by-email':
          return await handleReportsByEmail(req, res)
        case 'summary-by-email':
          return await handleSummaryByEmail(req, res)
        case 'dashboard':
          return await handleDashboard(res, user.userId)
        default:
          return res.status(400).json({ error: `unknown type: ${type}` })
      }
    }

    if (req.method === 'POST') {
      if (type === 'upsert') return await handleUpsert(req, res)
      return res.status(400).json({ error: `unknown type for POST: ${type}` })
    }

    if (req.method === 'PATCH') {
      switch (type) {
        case 'set-org-name':
          return await handleSetOrganizationName(req, res)
        case 'mark-email-sent':
          return await handleMarkEmailSent(req, res)
        case 'update':
          return await handleUpdate(req, res)
        default:
          return res.status(400).json({ error: `unknown type for PATCH: ${type}` })
      }
    }

    if (req.method === 'DELETE') {
      return await handleDelete(req, res)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[authors] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// ─── GET handlers ────────────────────────────────────────────────────────────

async function handleList(res: VercelResponse) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database.rpc('get_all_authors')
  if (error) {
    console.warn('[authors:list] get_all_authors error:', error)
    return res.status(200).json([])
  }
  if (Array.isArray(data)) {
    return res.status(200).json((data as Record<string, unknown>[]).map(decodeAuthor))
  }
  return res.status(200).json([])
}

async function handleGetByName(req: VercelRequest, res: VercelResponse) {
  const name = req.query.name as string | undefined
  if (!name) return res.status(400).json({ error: 'name クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database.rpc('get_author_by_name', { p_name: name })
  if (error) {
    console.warn('[authors:by-name] get_author_by_name error:', error)
    return res.status(200).json(null)
  }
  if (data && data.found) {
    return res.status(200).json(decodeAuthor(data as Record<string, unknown>))
  }
  return res.status(200).json(null)
}

async function handleCurrentEmail(res: VercelResponse, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database.auth.admin.getUserById(userId)
  if (error || !data?.user) return res.status(200).json({ email: null })
  return res.status(200).json({ email: data.user.email ?? null })
}

async function handleScenariosByEmail(req: VercelRequest, res: VercelResponse) {
  const email = req.query.email as string | undefined
  if (!email) return res.status(400).json({ error: 'email クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data: masters, error: mastersError } = await database
    .from('scenario_masters')
    .select('id, title, author, author_email')
    .eq('author_email', email)
    .order('title')

  if (mastersError) {
    if (mastersError.code === 'PGRST204' || mastersError.message?.includes('author_email')) {
      return res.status(200).json([])
    }
    console.error('[authors:scenarios-by-email] DB error:', mastersError)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: mastersError.message })
  }
  if (!masters || masters.length === 0) return res.status(200).json([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const masterIds = (masters as any[]).map((m) => m.id)
  const { data: orgScenarios } = await database
    .from('organization_scenarios')
    .select('scenario_master_id, play_count')
    .in('scenario_master_id', masterIds)

  const playCountMap = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;((orgScenarios as any[]) ?? []).forEach((os) => {
    const current = playCountMap.get(os.scenario_master_id) || 0
    playCountMap.set(os.scenario_master_id, current + (os.play_count || 0))
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (masters as any[]).map((m) => ({
    id: m.id,
    title: m.title,
    author: m.author || '',
    author_email: m.author_email,
    play_count: playCountMap.get(m.id) || 0,
  }))
  return res.status(200).json(result)
}

async function handleReportsByEmail(req: VercelRequest, res: VercelResponse) {
  const email = req.query.email as string | undefined
  if (!email) return res.status(400).json({ error: 'email クエリパラメータが必要です' })

  const status = req.query.status as string | undefined
  const startDate = req.query.startDate as string | undefined
  const endDate = req.query.endDate as string | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  let query = database
    .from('author_performance_reports')
    .select(AUTHOR_PERFORMANCE_REPORT_SELECT_FIELDS)
    .eq('author_email', email)
    .order('reported_at', { ascending: false })

  if (status) query = query.eq('report_status', status)
  if (startDate) query = query.gte('performance_date', startDate)
  if (endDate) query = query.lte('performance_date', endDate)

  const { data, error } = await query
  if (error) {
    if (error.code === 'PGRST204' || error.code === '42P01') return res.status(200).json([])
    console.error('[authors:reports-by-email] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

async function handleSummaryByEmail(req: VercelRequest, res: VercelResponse) {
  const email = req.query.email as string | undefined
  if (!email) return res.status(400).json({ error: 'email クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('author_summary')
    .select(AUTHOR_SUMMARY_SELECT_FIELDS)
    .eq('author_email', email)
    .single()

  if (error) {
    if (error.code === 'PGRST116' || error.code === '42P01') {
      return res.status(200).json({
        author_email: email,
        total_scenarios: 0,
        total_approved_reports: 0,
        total_performance_count: 0,
        total_license_fee: 0,
        organizations_count: 0,
      })
    }
    console.error('[authors:summary-by-email] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  return res.status(200).json({
    author_email: data.author_email,
    total_scenarios: data.total_scenarios || 0,
    total_approved_reports: data.total_approved_reports || 0,
    total_performance_count: data.total_performance_count || 0,
    total_license_fee: data.total_license_fee || 0,
    organizations_count: data.organizations_count || 0,
  })
}

async function handleDashboard(res: VercelResponse, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data: userData, error: userError } = await database.auth.admin.getUserById(userId)
  if (userError || !userData?.user?.email) return res.status(200).json(null)
  const email = userData.user.email as string

  type AuthorSummary = {
    author_email: string
    total_scenarios: number
    total_approved_reports: number
    total_performance_count: number
    total_license_fee: number
    organizations_count: number
  }

  let summary: AuthorSummary = {
    author_email: email,
    total_scenarios: 0,
    total_approved_reports: 0,
    total_performance_count: 0,
    total_license_fee: 0,
    organizations_count: 0,
  }
  let reports: unknown[] = []
  let scenarios: Array<{
    id: string
    title: string
    author: string
    author_email: string | null
    play_count: number
  }> = []

  // シナリオ一覧
  try {
    const { data: masters } = await database
      .from('scenario_masters')
      .select('id, title, author, author_email')
      .eq('author_email', email)
      .order('title')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const masterList = (masters as any[]) ?? []
    if (masterList.length > 0) {
      const masterIds = masterList.map((m) => m.id)
      const { data: orgScenarios } = await database
        .from('organization_scenarios')
        .select('scenario_master_id, play_count')
        .in('scenario_master_id', masterIds)

      const playCountMap = new Map<string, number>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;((orgScenarios as any[]) ?? []).forEach((os) => {
        const current = playCountMap.get(os.scenario_master_id) || 0
        playCountMap.set(os.scenario_master_id, current + (os.play_count || 0))
      })

      scenarios = masterList.map((m) => ({
        id: m.id,
        title: m.title,
        author: m.author || '',
        author_email: m.author_email,
        play_count: playCountMap.get(m.id) || 0,
      }))
      summary.total_scenarios = scenarios.length
    }
  } catch (e) {
    console.warn('[authors:dashboard] シナリオ取得失敗:', e)
  }

  // 報告一覧
  try {
    const { data, error } = await database
      .from('author_performance_reports')
      .select(AUTHOR_PERFORMANCE_REPORT_SELECT_FIELDS)
      .eq('author_email', email)
      .order('reported_at', { ascending: false })
    if (!error && data) reports = data
  } catch (e) {
    console.warn('[authors:dashboard] 報告取得失敗 (ビュー未作成の可能性):', e)
  }

  // サマリー
  try {
    const { data, error } = await database
      .from('author_summary')
      .select(AUTHOR_SUMMARY_SELECT_FIELDS)
      .eq('author_email', email)
      .single()
    if (!error && data) {
      summary = {
        author_email: data.author_email,
        total_scenarios: data.total_scenarios || 0,
        total_approved_reports: data.total_approved_reports || 0,
        total_performance_count: data.total_performance_count || 0,
        total_license_fee: data.total_license_fee || 0,
        organizations_count: data.organizations_count || 0,
      }
    }
  } catch (e) {
    console.warn('[authors:dashboard] サマリー取得失敗 (ビュー未作成の可能性):', e)
  }

  return res.status(200).json({ email, summary, reports, scenarios })
}

// ─── POST / PATCH / DELETE handlers ─────────────────────────────────────────

async function handleUpsert(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as {
    name?: string
    email?: string | null
    notes?: string | null
    license_organization_name?: string | null
  }
  if (!body.name) return res.status(400).json({ error: 'name は必須です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database.rpc('upsert_author', {
    p_name: body.name,
    p_email: body.email ?? null,
    p_notes: body.notes ?? null,
    p_license_organization_name: body.license_organization_name ?? null,
  })

  if (error) {
    console.error('[authors:upsert] DB error:', error)
    return res.status(500).json({ error: 'upsert に失敗しました', detail: error.message })
  }
  if (!data?.success) {
    return res
      .status(500)
      .json({ error: data?.error ?? 'upsert に失敗しました' })
  }

  // 最新を取得して返す
  const { data: latest } = await database.rpc('get_author_by_name', { p_name: body.name })
  if (latest && latest.found) {
    return res.status(200).json(decodeAuthor(latest as Record<string, unknown>))
  }
  return res.status(200).json({ success: true, ...data })
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as {
    id?: string
    name?: string
    email?: string | null
    notes?: string | null
    license_organization_name?: string | null
  }
  if (!body.id) return res.status(400).json({ error: 'id は必須です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  // id から name を引く
  const { data: row, error: lookupError } = await database
    .from('authors')
    .select('name')
    .eq('id', body.id)
    .single()
  if (lookupError || !row) {
    return res.status(404).json({ error: 'Author not found' })
  }

  const name = row.name as string
  const { data, error } = await database.rpc('upsert_author', {
    p_name: name,
    p_email: body.email ?? null,
    p_notes: body.notes ?? null,
    p_license_organization_name: body.license_organization_name ?? null,
  })

  if (error) {
    console.error('[authors:update] DB error:', error)
    return res.status(500).json({ error: '更新に失敗しました', detail: error.message })
  }
  if (!data?.success) {
    return res.status(500).json({ error: data?.error ?? '更新に失敗しました' })
  }

  const { data: latest } = await database.rpc('get_author_by_name', { p_name: name })
  if (latest && latest.found) {
    return res.status(200).json(decodeAuthor(latest as Record<string, unknown>))
  }
  return res.status(200).json({ success: true })
}

async function handleSetOrganizationName(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as {
    authorName?: string
    organizationName?: string
    memo?: string | null
  }
  if (!body.authorName) return res.status(400).json({ error: 'authorName は必須です' })
  if (body.organizationName === undefined) {
    return res.status(400).json({ error: 'organizationName は必須です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // memo が undefined なら既存メモを保持
  let currentMemo: string | null = body.memo === undefined ? null : (body.memo ?? null)
  let currentSentYm: string | null = null
  if (body.memo === undefined) {
    const { data: current } = await database.rpc('get_author_by_name', { p_name: body.authorName })
    if (current && current.found) {
      const decoded = decodeAuthor(current as Record<string, unknown>)
      currentMemo = decoded.notes
      currentSentYm = decoded.last_email_sent_ym
    }
  }

  const encodedNotes = encodeAuthorNotes(body.organizationName, currentMemo, currentSentYm)

  const { error } = await database
    .from('authors')
    .update({ notes: encodedNotes })
    .eq('name', body.authorName)
  if (error) {
    console.error('[authors:set-org-name] DB error:', error)
    return res.status(500).json({ error: '更新に失敗しました', detail: error.message })
  }
  return res.status(200).json({ success: true })
}

async function handleMarkEmailSent(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as { authorName?: string; year?: number; month?: number }
  if (!body.authorName) return res.status(400).json({ error: 'authorName は必須です' })
  if (typeof body.year !== 'number' || typeof body.month !== 'number') {
    return res.status(400).json({ error: 'year と month は必須です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const sentYm = `${body.year}-${String(body.month).padStart(2, '0')}`

  const { data: current } = await database.rpc('get_author_by_name', { p_name: body.authorName })
  let orgName: string | null = null
  let memo: string | null = null
  if (current && current.found) {
    const decoded = decodeAuthor(current as Record<string, unknown>)
    orgName = decoded.license_organization_name
    memo = decoded.notes
  }

  const encodedNotes = encodeAuthorNotes(orgName, memo, sentYm)
  const { error } = await database
    .from('authors')
    .update({ notes: encodedNotes })
    .eq('name', body.authorName)
  if (error) {
    console.error('[authors:mark-email-sent] DB error:', error)
    return res.status(500).json({ error: '更新に失敗しました', detail: error.message })
  }
  return res.status(200).json({ success: true })
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { error } = await database.from('authors').delete().eq('id', id)
  if (error) {
    console.error('[authors:delete] DB error:', error)
    return res.status(500).json({ error: '削除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ success: true })
}
