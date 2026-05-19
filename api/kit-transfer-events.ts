import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'

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

const SELECT = `
  *,
  org_scenario:organization_scenarios!kit_transfer_events_org_scenario_id_fkey(
    id,
    scenario_master_id,
    scenario_masters(id, title)
  ),
  from_store:stores!kit_transfer_events_from_store_id_fkey(id, name, short_name),
  to_store:stores!kit_transfer_events_to_store_id_fkey(id, name, short_name)
`

type TransferEventInput = {
  org_scenario_id?: string
  kit_number?: number
  transfer_date?: string
  from_store_id?: string | null
  to_store_id?: string | null
  status?: 'pending' | 'completed' | 'cancelled'
  notes?: string | null
}

// ─── ヘルパ ─────────────────────────────────────────────────────────────────
async function assertOrgScenarioOwnedByOrg(orgScenarioId: string, orgId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_scenarios')
    .select('id')
    .eq('id', orgScenarioId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new ApiError(500, `org_scenario 所有検証に失敗: ${error.message}`)
  if (!data) throw new ApiError(403, '指定の org_scenario_id は自組織のものではありません')
}

async function assertStoreOwnedByOrg(storeId: string, orgId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new ApiError(500, `store 所有検証に失敗: ${error.message}`)
  if (!data) throw new ApiError(403, '指定の store は自組織のものではありません')
}

async function validateTransferInput(input: TransferEventInput, orgId: string): Promise<void> {
  if (!input.org_scenario_id || !Number.isInteger(input.kit_number) || !input.transfer_date) {
    throw new ApiError(400, 'org_scenario_id / kit_number / transfer_date が必要です')
  }
  await assertOrgScenarioOwnedByOrg(input.org_scenario_id, orgId)
  if (input.from_store_id) await assertStoreOwnedByOrg(input.from_store_id, orgId)
  if (input.to_store_id) await assertStoreOwnedByOrg(input.to_store_id, orgId)
}

async function assertEventOwnedByOrg(eventId: string, orgId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('kit_transfer_events')
    .select('id, organization_id')
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw new ApiError(500, `イベント検証に失敗: ${error.message}`)
  if (!data) throw new ApiError(404, 'イベントが見つかりません')
  if (data.organization_id !== orgId) throw new ApiError(403, '他組織のイベントは操作できません')
}

// ─── GET: getTransferEvents ────────────────────────────────────────────────
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const startDate = req.query.start_date as string | undefined
  const endDate = req.query.end_date as string | undefined

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'start_date / end_date が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('kit_transfer_events')
    .select(SELECT)
    .eq('organization_id', user.orgId)
    .gte('transfer_date', startDate)
    .lte('transfer_date', endDate)
    .order('transfer_date')
    .order('org_scenario_id')

  if (error) {
    console.error('[kit-transfer-events] GET error:', error)
    return res.status(500).json({ error: '移動イベントの取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── POST: createTransferEvent / createTransferEvents / cancelPendingTransfers ─
async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = (req.query.action ?? req.body?.action) as string | undefined
  const body = req.body ?? {}

  // cancelPendingTransfers 相当
  if (action === 'cancel_pending') {
    const { start_date, end_date } = body as { start_date?: string; end_date?: string }
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date / end_date が必要です' })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('kit_transfer_events')
      .update({ status: 'cancelled' })
      .eq('organization_id', user.orgId)
      .eq('status', 'pending')
      .gte('transfer_date', start_date)
      .lte('transfer_date', end_date)
      .select('id')
    if (error) {
      console.error('[kit-transfer-events] cancel_pending error:', error)
      return res.status(500).json({ error: 'pendingのキャンセルに失敗しました', detail: error.message })
    }
    return res.status(200).json({ cancelled: data?.length ?? 0 })
  }

  // バルク作成（events: []）
  if (Array.isArray(body.events)) {
    const events = body.events as TransferEventInput[]
    if (events.length === 0) return res.status(200).json([])

    for (const ev of events) {
      await validateTransferInput(ev, user.orgId)
    }

    const records = events.map(ev => ({
      ...ev,
      organization_id: user.orgId,
      created_by: user.userId,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('kit_transfer_events')
      .insert(records)
      .select(SELECT)
    if (error) {
      console.error('[kit-transfer-events] bulk insert error:', error)
      return res.status(500).json({ error: '移動イベントの一括作成に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  }

  // 単発作成
  const input = body as TransferEventInput
  await validateTransferInput(input, user.orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('kit_transfer_events')
    .insert({
      ...input,
      organization_id: user.orgId,
      created_by: user.userId,
    })
    .select(SELECT)
    .single()
  if (error) {
    console.error('[kit-transfer-events] insert error:', error)
    return res.status(500).json({ error: '移動イベントの作成に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// ─── PATCH: updateTransferStatus ───────────────────────────────────────────
async function handlePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = (req.query.id ?? req.body?.id) as string | undefined
  const status = req.body?.status as 'pending' | 'completed' | 'cancelled' | undefined

  if (!id) return res.status(400).json({ error: 'id が必要です' })
  if (!status || !['pending', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'status (pending|completed|cancelled) が必要です' })
  }

  await assertEventOwnedByOrg(id, user.orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('kit_transfer_events')
    .update({ status })
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .select(SELECT)
    .single()
  if (error) {
    console.error('[kit-transfer-events] patch error:', error)
    return res.status(500).json({ error: 'ステータス更新に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// ─── DELETE: deleteTransferEvent ───────────────────────────────────────────
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = (req.query.id ?? req.body?.id) as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  await assertEventOwnedByOrg(id, user.orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('kit_transfer_events')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.orgId)
  if (error) {
    console.error('[kit-transfer-events] delete error:', error)
    return res.status(500).json({ error: '削除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ ok: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    if (req.method === 'GET') return await handleGet(req, res, user)
    if (req.method === 'POST') return await handlePost(req, res, user)
    if (req.method === 'PATCH') return await handlePatch(req, res, user)
    if (req.method === 'DELETE') return await handleDelete(req, res, user)

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[kit-transfer-events] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
