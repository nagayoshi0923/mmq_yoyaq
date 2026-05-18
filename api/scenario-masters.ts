import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'

/**
 * Scenario Masters API
 *
 * scenario_masters は「全組織で共有される横断マスタ」だが、
 * 各レコードは submitted_by_organization_id（提出元組織）を持つ。
 *
 * マルチテナント境界:
 *   - READ:
 *       - approved: 全認証ユーザーが参照可能
 *       - draft/pending/rejected: 提出元組織のスタッフのみ、または license_admin
 *   - CREATE: スタッフ以上。submitted_by_organization_id は JWT の orgId を強制（クライアントから受け取らない）
 *   - UPDATE: 提出元組織のスタッフ、または license_admin（approve/reject 系）
 *   - DELETE: 同じく提出元組織のスタッフ または license_admin
 *
 * service_role で RLS をバイパスするため、上記の権限チェックをサーバコードで明示的に行う。
 *
 * type 分岐:
 *   GET    ?type=list                 → 全シナリオマスタ（権限フィルタ込み）
 *   GET    ?type=approved             → approved のみ（誰でも参照可能）
 *   GET    ?type=by-id&id=            → 単一取得
 *   POST   (body)                     → 作成（draft）
 *   PATCH  ?type=update&id=           body: 部分更新
 *   PATCH  ?type=publish&id=          → draft → pending
 *   PATCH  ?type=approve&id=          → pending → approved（license_admin のみ）
 *   PATCH  ?type=reject&id=           body: { reason } → pending → rejected（license_admin のみ）
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

const SCENARIO_MASTER_SELECT_FIELDS =
  'id, title, author, author_id, key_visual_url, description, player_count_min, player_count_max, official_duration, genre, difficulty, synopsis, caution, required_items, master_status, submitted_by_organization_id, approved_by, approved_at, rejection_reason, created_at, updated_at, created_by'

// master 上で許可された更新可能フィールド（任意のカラムを無制限に更新させない）
const ALLOWED_UPDATE_FIELDS = new Set([
  'title',
  'author',
  'author_id',
  'key_visual_url',
  'description',
  'player_count_min',
  'player_count_max',
  'official_duration',
  'genre',
  'difficulty',
  'synopsis',
  'caution',
  'required_items',
])

function pickAllowedUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) out[key] = body[key]
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    const type = (req.query.type as string | undefined) ?? ''

    if (req.method === 'GET') {
      switch (type) {
        case 'list':
          return await handleList(res, user)
        case 'approved':
          return await handleApproved(res)
        case 'by-id':
          return await handleGetById(req, res, user)
        default:
          return res.status(400).json({ error: `unknown type for GET: ${type}` })
      }
    }

    if (req.method === 'POST') {
      // create
      requireStaff(user)
      return await handleCreate(req, res, user)
    }

    if (req.method === 'PATCH') {
      requireStaff(user)
      switch (type) {
        case 'update':
          return await handleUpdate(req, res, user)
        case 'publish':
          return await handlePublish(req, res, user)
        case 'approve':
          return await handleApprove(req, res, user)
        case 'reject':
          return await handleReject(req, res, user)
        default:
          return res.status(400).json({ error: `unknown type for PATCH: ${type}` })
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[scenario-masters] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function fetchMasterById(id: string): Promise<Record<string, unknown> | null> {
  if (!db) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('scenario_masters')
    .select(SCENARIO_MASTER_SELECT_FIELDS)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[scenario-masters] fetchMasterById error:', error)
    return null
  }
  return (data as Record<string, unknown> | null) ?? null
}

function canReadMaster(master: Record<string, unknown>, user: AuthUser): boolean {
  if (master.master_status === 'approved') return true
  if (user.role === 'license_admin') return true
  if (
    ['admin', 'staff'].includes(user.role) &&
    master.submitted_by_organization_id === user.orgId
  ) {
    return true
  }
  return false
}

function canWriteMaster(master: Record<string, unknown>, user: AuthUser): boolean {
  if (user.role === 'license_admin') return true
  if (
    ['admin', 'staff'].includes(user.role) &&
    master.submitted_by_organization_id === user.orgId
  ) {
    return true
  }
  return false
}

// ─── GET handlers ────────────────────────────────────────────────────────────

async function handleList(res: VercelResponse, user: AuthUser) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 権限に応じた可視範囲:
  //   - license_admin: 全件
  //   - その他: approved を全件 + 自組織が提出元のレコード（draft/pending/rejected 含む）
  let query = database
    .from('scenario_masters')
    .select(SCENARIO_MASTER_SELECT_FIELDS)
    .order('title', { ascending: true })

  if (user.role !== 'license_admin') {
    query = query.or(
      `master_status.eq.approved,submitted_by_organization_id.eq.${user.orgId}`
    )
  }

  const { data, error } = await query
  if (error) {
    console.error('[scenario-masters:list] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

async function handleApproved(res: VercelResponse) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('scenario_masters')
    .select(SCENARIO_MASTER_SELECT_FIELDS)
    .eq('master_status', 'approved')
    .order('title', { ascending: true })

  if (error) {
    console.error('[scenario-masters:approved] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

async function handleGetById(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  const master = await fetchMasterById(id)
  if (!master) return res.status(200).json(null)

  if (!canReadMaster(master, user)) {
    // 自分が見るべきでないレコードは「見つからない」として null を返す
    // （存在の有無を漏らさないため）
    return res.status(200).json(null)
  }

  return res.status(200).json(master)
}

// ─── POST / PATCH handlers ──────────────────────────────────────────────────

async function handleCreate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const insertPayload = pickAllowedUpdates(body)

  // submitted_by_organization_id は JWT から強制
  // master_status は draft で固定
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('scenario_masters')
    .insert({
      ...insertPayload,
      master_status: 'draft',
      submitted_by_organization_id: user.orgId,
      created_by: user.userId,
    })
    .select(SCENARIO_MASTER_SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[scenario-masters:create] DB error:', error)
    return res.status(500).json({ error: '作成に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handleUpdate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  const existing = await fetchMasterById(id)
  if (!existing) return res.status(404).json({ error: 'シナリオマスタが見つかりません' })
  if (!canWriteMaster(existing, user)) {
    return res.status(403).json({ error: 'このシナリオマスタを更新する権限がありません' })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const updates = pickAllowedUpdates(body)
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: '更新対象のフィールドがありません' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('scenario_masters')
    .update(updates)
    .eq('id', id)
    .select(SCENARIO_MASTER_SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[scenario-masters:update] DB error:', error)
    return res.status(500).json({ error: '更新に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handlePublish(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  const existing = await fetchMasterById(id)
  if (!existing) return res.status(404).json({ error: 'シナリオマスタが見つかりません' })
  if (!canWriteMaster(existing, user)) {
    return res.status(403).json({ error: 'このシナリオマスタを更新する権限がありません' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('scenario_masters')
    .update({ master_status: 'pending' })
    .eq('id', id)
    .select(SCENARIO_MASTER_SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[scenario-masters:publish] DB error:', error)
    return res.status(500).json({ error: '公開申請に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handleApprove(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (user.role !== 'license_admin') {
    return res.status(403).json({ error: 'ライセンス管理者のみ承認できます' })
  }
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('scenario_masters')
    .update({
      master_status: 'approved',
      approved_by: user.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(SCENARIO_MASTER_SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[scenario-masters:approve] DB error:', error)
    return res.status(500).json({ error: '承認に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handleReject(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (user.role !== 'license_admin') {
    return res.status(403).json({ error: 'ライセンス管理者のみ却下できます' })
  }
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  const body = (req.body ?? {}) as { reason?: string }
  const reason = body.reason ?? ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('scenario_masters')
    .update({
      master_status: 'rejected',
      rejection_reason: reason,
    })
    .eq('id', id)
    .select(SCENARIO_MASTER_SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[scenario-masters:reject] DB error:', error)
    return res.status(500).json({ error: '却下に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}
