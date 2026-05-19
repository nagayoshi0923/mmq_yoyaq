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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

const SELECT = `
  *,
  picked_up_by_staff:staff!kit_transfer_completions_picked_up_by_fkey(id, name),
  delivered_by_staff:staff!kit_transfer_completions_delivered_by_fkey(id, name)
`

// ─── ヘルパ ─────────────────────────────────────────────────────────────────
async function getOrgScenarioMasterId(orgScenarioId: string, orgId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_scenarios')
    .select('id, scenario_master_id')
    .eq('id', orgScenarioId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new ApiError(500, `org_scenario 検証に失敗: ${error.message}`)
  if (!data) throw new ApiError(403, '指定の org_scenario_id は自組織のものではありません')
  return data.scenario_master_id ?? null
}

async function assertStoreOwnedByOrg(storeId: string, orgId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new ApiError(500, `store 検証に失敗: ${error.message}`)
  if (!data) throw new ApiError(403, '指定の store は自組織のものではありません')
}

async function assertStaffOwnedByOrg(staffId: string, orgId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('staff')
    .select('id')
    .eq('id', staffId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new ApiError(500, `staff 検証に失敗: ${error.message}`)
  if (!data) throw new ApiError(403, '指定の staff は自組織のものではありません')
}

// ─── GET: getTransferCompletions ───────────────────────────────────────────
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const startDate = req.query.start_date as string | undefined
  const endDate = req.query.end_date as string | undefined

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'start_date / end_date が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('kit_transfer_completions')
    .select(SELECT)
    .eq('organization_id', user.orgId)
    .gte('performance_date', startDate)
    .lte('performance_date', endDate)

  if (error) {
    console.error('[kit-transfer-completions] GET error:', error)
    return res.status(500).json({ error: '完了状態の取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── POST: action 別の upsert/update ───────────────────────────────────────
async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = (req.query.action ?? req.body?.action) as string | undefined
  const body = req.body ?? {}

  if (action === 'mark_picked_up') {
    return handleMarkPickedUp(body, res, user)
  }
  if (action === 'unmark_picked_up') {
    return handleUnmarkPickedUp(body, res, user)
  }
  if (action === 'mark_delivered') {
    return handleMarkDelivered(body, res, user)
  }
  if (action === 'unmark_delivered') {
    return handleUnmarkDelivered(body, res, user)
  }

  return res.status(400).json({ error: 'action が必要です (mark_picked_up|unmark_picked_up|mark_delivered|unmark_delivered)' })
}

async function handleMarkPickedUp(
  body: Record<string, unknown>,
  res: VercelResponse,
  user: AuthUser
) {
  const {
    scenario_id,
    kit_number,
    performance_date,
    from_store_id,
    to_store_id,
    staff_id,
  } = body as {
    scenario_id?: string
    kit_number?: number
    performance_date?: string
    from_store_id?: string
    to_store_id?: string
    staff_id?: string
  }

  if (!scenario_id || !Number.isInteger(kit_number) || !performance_date || !from_store_id || !to_store_id || !staff_id) {
    return res.status(400).json({ error: 'scenario_id / kit_number / performance_date / from_store_id / to_store_id / staff_id が必要です' })
  }

  const scenarioMasterId = await getOrgScenarioMasterId(scenario_id, user.orgId)
  await assertStoreOwnedByOrg(from_store_id, user.orgId)
  await assertStoreOwnedByOrg(to_store_id, user.orgId)
  await assertStaffOwnedByOrg(staff_id, user.orgId)

  // 既存レコードを検索
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: findErr } = await (db as any)
    .from('kit_transfer_completions')
    .select('id')
    .eq('organization_id', user.orgId)
    .eq('org_scenario_id', scenario_id)
    .eq('kit_number', kit_number)
    .eq('performance_date', performance_date)
    .eq('to_store_id', to_store_id)
    .maybeSingle()
  if (findErr) {
    return res.status(500).json({ error: '既存レコード検索に失敗', detail: findErr.message })
  }

  let data, error
  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (db as any)
      .from('kit_transfer_completions')
      .update({
        from_store_id,
        picked_up_at: new Date().toISOString(),
        picked_up_by: staff_id,
      })
      .eq('id', existing.id)
      .eq('organization_id', user.orgId)
      .select(SELECT)
      .single()
    data = r.data
    error = r.error
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (db as any)
      .from('kit_transfer_completions')
      .insert({
        organization_id: user.orgId,
        org_scenario_id: scenario_id,
        scenario_master_id: scenarioMasterId,
        kit_number,
        performance_date,
        from_store_id,
        to_store_id,
        picked_up_at: new Date().toISOString(),
        picked_up_by: staff_id,
      })
      .select(SELECT)
      .single()
    data = r.data
    error = r.error
  }

  if (error) {
    console.error('[kit-transfer-completions] mark_picked_up error:', error)
    return res.status(500).json({ error: '回収完了のマークに失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handleUnmarkPickedUp(
  body: Record<string, unknown>,
  res: VercelResponse,
  user: AuthUser
) {
  const { scenario_id, kit_number, performance_date, to_store_id } = body as {
    scenario_id?: string
    kit_number?: number
    performance_date?: string
    to_store_id?: string
  }

  if (!scenario_id || !Number.isInteger(kit_number) || !performance_date || !to_store_id) {
    return res.status(400).json({ error: 'scenario_id / kit_number / performance_date / to_store_id が必要です' })
  }

  await getOrgScenarioMasterId(scenario_id, user.orgId)
  await assertStoreOwnedByOrg(to_store_id, user.orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('kit_transfer_completions')
    .update({
      picked_up_at: null,
      picked_up_by: null,
      delivered_at: null,
      delivered_by: null,
    })
    .eq('organization_id', user.orgId)
    .eq('org_scenario_id', scenario_id)
    .eq('kit_number', kit_number)
    .eq('performance_date', performance_date)
    .eq('to_store_id', to_store_id)

  if (error) {
    console.error('[kit-transfer-completions] unmark_picked_up error:', error)
    return res.status(500).json({ error: '回収完了の解除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ ok: true })
}

async function handleMarkDelivered(
  body: Record<string, unknown>,
  res: VercelResponse,
  user: AuthUser
) {
  const { scenario_id, kit_number, performance_date, to_store_id, staff_id } = body as {
    scenario_id?: string
    kit_number?: number
    performance_date?: string
    to_store_id?: string
    staff_id?: string
  }

  if (!scenario_id || !Number.isInteger(kit_number) || !performance_date || !to_store_id || !staff_id) {
    return res.status(400).json({ error: 'scenario_id / kit_number / performance_date / to_store_id / staff_id が必要です' })
  }

  await getOrgScenarioMasterId(scenario_id, user.orgId)
  await assertStoreOwnedByOrg(to_store_id, user.orgId)
  await assertStaffOwnedByOrg(staff_id, user.orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('kit_transfer_completions')
    .update({
      delivered_at: new Date().toISOString(),
      delivered_by: staff_id,
    })
    .eq('organization_id', user.orgId)
    .eq('org_scenario_id', scenario_id)
    .eq('kit_number', kit_number)
    .eq('performance_date', performance_date)
    .eq('to_store_id', to_store_id)
    .select(SELECT)
    .single()

  if (error) {
    console.error('[kit-transfer-completions] mark_delivered error:', error)
    return res.status(500).json({ error: '設置完了のマークに失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handleUnmarkDelivered(
  body: Record<string, unknown>,
  res: VercelResponse,
  user: AuthUser
) {
  const { scenario_id, kit_number, performance_date, to_store_id } = body as {
    scenario_id?: string
    kit_number?: number
    performance_date?: string
    to_store_id?: string
  }

  if (!scenario_id || !Number.isInteger(kit_number) || !performance_date || !to_store_id) {
    return res.status(400).json({ error: 'scenario_id / kit_number / performance_date / to_store_id が必要です' })
  }

  await getOrgScenarioMasterId(scenario_id, user.orgId)
  await assertStoreOwnedByOrg(to_store_id, user.orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('kit_transfer_completions')
    .update({
      delivered_at: null,
      delivered_by: null,
    })
    .eq('organization_id', user.orgId)
    .eq('org_scenario_id', scenario_id)
    .eq('kit_number', kit_number)
    .eq('performance_date', performance_date)
    .eq('to_store_id', to_store_id)

  if (error) {
    console.error('[kit-transfer-completions] unmark_delivered error:', error)
    return res.status(500).json({ error: '設置完了の解除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ ok: true })
}

// ─── DELETE: clearAllCompletions (期間内一括削除) ──────────────────────────
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const startDate = (req.query.start_date ?? req.body?.start_date) as string | undefined
  const endDate = (req.query.end_date ?? req.body?.end_date) as string | undefined

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'start_date / end_date が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('kit_transfer_completions')
    .delete()
    .eq('organization_id', user.orgId)
    .gte('performance_date', startDate)
    .lte('performance_date', endDate)
    .select('id')

  if (error) {
    console.error('[kit-transfer-completions] delete error:', error)
    return res.status(500).json({ error: '完了状態のクリアに失敗しました', detail: error.message })
  }
  return res.status(200).json({ cleared: data?.length ?? 0 })
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
    if (req.method === 'DELETE') return await handleDelete(req, res, user)

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[kit-transfer-completions] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
