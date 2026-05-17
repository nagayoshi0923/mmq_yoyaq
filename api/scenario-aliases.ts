import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'

/**
 * Scenario Aliases API
 *
 * scenario_import_aliases は organization_id を持たない「全組織共有マスタ」。
 * スケジュールインポート時のシナリオ名揺れ → 正式名称マッピング。
 *
 * マルチテナント境界:
 *   - READ: 認証済みユーザー（顧客でも構わないが、現状の利用箇所は
 *           スタッフ機能のみなので requireStaff で絞る）
 *   - WRITE: admin のみ（is_org_admin 相当）
 *
 * type 分岐:
 *   GET   ?type=map      → { alias: canonical_name } のマップを返す（フロントのキャッシュ前提）
 *   GET   ?type=list     → [{ id, alias, canonical_name, created_at }] の配列
 *   POST                 body: { alias, canonical_name } → 追加
 *   PATCH ?id=           body: { alias?, canonical_name? } → 更新
 *   DELETE ?id=          → 削除
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

function requireAdmin(user: AuthUser): void {
  if (user.role !== 'admin') {
    throw new ApiError(403, '管理者権限が必要です')
  }
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
      // 参照は staff 以上で許可（スケジュールインポート機能で使う）
      requireStaff(user)
      if (type === 'map' || type === '') return await handleMap(res)
      if (type === 'list') return await handleList(res)
      return res.status(400).json({ error: `unknown type for GET: ${type}` })
    }

    if (req.method === 'POST') {
      requireAdmin(user)
      return await handleCreate(req, res)
    }

    if (req.method === 'PATCH') {
      requireAdmin(user)
      return await handleUpdate(req, res)
    }

    if (req.method === 'DELETE') {
      requireAdmin(user)
      return await handleDelete(req, res)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[scenario-aliases] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// ─── handlers ────────────────────────────────────────────────────────────────

async function handleMap(res: VercelResponse) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('scenario_import_aliases')
    .select('alias, canonical_name')

  if (error) {
    console.warn('[scenario-aliases:map] DB error:', error)
    return res.status(200).json({})
  }

  const map: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data as any[]) ?? []) {
    map[row.alias] = row.canonical_name
  }
  return res.status(200).json(map)
}

async function handleList(res: VercelResponse) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('scenario_import_aliases')
    .select('id, alias, canonical_name, created_at')
    .order('alias', { ascending: true })

  if (error) {
    console.error('[scenario-aliases:list] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as { alias?: string; canonical_name?: string }
  if (!body.alias || !body.canonical_name) {
    return res.status(400).json({ error: 'alias と canonical_name は必須です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('scenario_import_aliases')
    .insert({
      alias: body.alias,
      canonical_name: body.canonical_name,
    })
    .select('id, alias, canonical_name, created_at')
    .single()

  if (error) {
    console.error('[scenario-aliases:create] DB error:', error)
    return res.status(500).json({ error: '作成に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  const body = (req.body ?? {}) as { alias?: string; canonical_name?: string }
  const updates: Record<string, unknown> = {}
  if (body.alias !== undefined) updates.alias = body.alias
  if (body.canonical_name !== undefined) updates.canonical_name = body.canonical_name
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: '更新対象のフィールドがありません' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('scenario_import_aliases')
    .update(updates)
    .eq('id', id)
    .select('id, alias, canonical_name, created_at')
    .single()

  if (error) {
    console.error('[scenario-aliases:update] DB error:', error)
    return res.status(500).json({ error: '更新に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { error } = await database.from('scenario_import_aliases').delete().eq('id', id)
  if (error) {
    console.error('[scenario-aliases:delete] DB error:', error)
    return res.status(500).json({ error: '削除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ success: true })
}
