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
  org_scenario:organization_scenarios!scenario_kit_locations_org_scenario_id_fkey(
    id,
    scenario_master_id,
    scenario_masters(id, title)
  ),
  scenario_master:scenario_masters!scenario_kit_locations_scenario_master_id_fkey(id, title),
  store:stores(id, name, short_name)
`

// ─── ヘルパ ─────────────────────────────────────────────────────────────────
/** UI の scenarioId (organization_scenarios.id または scenario_master_id) を組織内の org_scenario_id に解決 */
async function resolveOrgScenarioId(
  orgId: string,
  scenarioIdOrMasterId: string
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r1 = await (db as any)
    .from('organization_scenarios')
    .select('id')
    .eq('organization_id', orgId)
    .eq('id', scenarioIdOrMasterId)
    .maybeSingle()
  if (r1.data?.id) return r1.data.id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r2 = await (db as any)
    .from('organization_scenarios')
    .select('id')
    .eq('organization_id', orgId)
    .eq('scenario_master_id', scenarioIdOrMasterId)
    .maybeSingle()
  return r2.data?.id ?? null
}

/** store_id が自組織のものか検証 */
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

// ─── GET ─────────────────────────────────────────────────────────────────────
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const scenarioId = req.query.scenario_id as string | undefined

  if (scenarioId) {
    // 特定シナリオのキット位置（org_scenario_id または scenario_master_id どちらでも）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgScenarioId = await resolveOrgScenarioId(user.orgId, scenarioId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any
    if (orgScenarioId) {
      query = (db as any)
        .from('scenario_kit_locations')
        .select(SELECT)
        .eq('organization_id', user.orgId)
        .eq('org_scenario_id', orgScenarioId)
        .order('kit_number')
    } else {
      query = (db as any)
        .from('scenario_kit_locations')
        .select(SELECT)
        .eq('organization_id', user.orgId)
        .eq('scenario_master_id', scenarioId)
        .order('kit_number')
    }
    const { data, error } = await query
    if (error) {
      console.error('[kit-locations] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('scenario_kit_locations')
    .select(SELECT)
    .eq('organization_id', user.orgId)
    .order('org_scenario_id', { nullsFirst: false })
    .order('scenario_master_id', { nullsFirst: false })
    .order('kit_number')

  if (error) {
    console.error('[kit-locations] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── POST: setKitLocation / setAllKitLocations 相当 ───────────────────────
async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = (req.query.action ?? req.body?.action) as string | undefined
  const body = req.body ?? {}

  if (action === 'set_all') {
    // setAllKitLocations: shopIds[] を kit_number 順で upsert
    const { scenario_id, store_ids } = body as { scenario_id?: string; store_ids?: string[] }
    if (!scenario_id || !Array.isArray(store_ids)) {
      return res.status(400).json({ error: 'scenario_id / store_ids が必要です' })
    }
    const orgScenarioId = await resolveOrgScenarioId(user.orgId, scenario_id)
    if (!orgScenarioId) {
      throw new ApiError(403, 'organization_scenarios を特定できません（自組織で利用可能なシナリオではありません）')
    }
    for (const sid of store_ids) {
      await assertStoreOwnedByOrg(sid, user.orgId)
    }

    const records = store_ids.map((storeId, index) => ({
      organization_id: user.orgId,
      org_scenario_id: orgScenarioId,
      kit_number: index + 1,
      store_id: storeId,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('scenario_kit_locations')
      .upsert(records, { onConflict: 'organization_id,org_scenario_id,kit_number' })
      .select(SELECT)
    if (error) {
      console.error('[kit-locations] set_all error:', error)
      return res.status(500).json({ error: 'キット位置の一括設定に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  }

  // default: setKitLocation 相当
  const { scenario_id, kit_number, store_id } = body as {
    scenario_id?: string
    kit_number?: number
    store_id?: string
  }
  if (!scenario_id || !Number.isInteger(kit_number) || !store_id) {
    return res.status(400).json({ error: 'scenario_id / kit_number / store_id が必要です' })
  }
  await assertStoreOwnedByOrg(store_id, user.orgId)

  const orgScenarioId = await resolveOrgScenarioId(user.orgId, scenario_id)

  // 既存レコード検索（自org のみ）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existingQuery: any = (db as any)
    .from('scenario_kit_locations')
    .select('id, org_scenario_id, scenario_master_id')
    .eq('organization_id', user.orgId)
    .eq('kit_number', kit_number)

  if (orgScenarioId) {
    existingQuery = existingQuery.eq('org_scenario_id', orgScenarioId)
  } else {
    existingQuery = existingQuery.or(
      `org_scenario_id.eq.${scenario_id},scenario_master_id.eq.${scenario_id}`
    )
  }
  const { data: existing, error: existingErr } = await existingQuery.maybeSingle()
  if (existingErr) {
    return res.status(500).json({ error: '既存レコード検索に失敗', detail: existingErr.message })
  }

  const orgScenarioIdForWrite = orgScenarioId ?? existing?.org_scenario_id ?? null
  if (!orgScenarioIdForWrite) {
    return res.status(403).json({ error: 'organization_scenarios を特定できません（自組織で利用可能ではありません）' })
  }

  let data, error
  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (db as any)
      .from('scenario_kit_locations')
      .update({
        store_id,
        org_scenario_id: orgScenarioIdForWrite,
        updated_at: new Date().toISOString(),
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
      .from('scenario_kit_locations')
      .insert({
        organization_id: user.orgId,
        org_scenario_id: orgScenarioIdForWrite,
        kit_number,
        store_id,
      })
      .select(SELECT)
      .single()
    data = r.data
    error = r.error
  }
  if (error) {
    console.error('[kit-locations] set error:', error)
    return res.status(500).json({ error: 'キット位置の設定に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// ─── PATCH: updateKitCondition / is_fixed トグル ───────────────────────────
async function handlePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = req.body ?? {}
  const { scenario_id, kit_number, condition, condition_notes, is_fixed } = body as {
    scenario_id?: string
    kit_number?: number
    condition?: string
    condition_notes?: string | null
    is_fixed?: boolean
  }
  if (!scenario_id || !Number.isInteger(kit_number)) {
    return res.status(400).json({ error: 'scenario_id / kit_number が必要です' })
  }
  // condition 更新 と is_fixed 更新の両対応（少なくとも一方が必要）
  const updateRow: Record<string, unknown> = {}
  if (condition !== undefined) {
    updateRow.condition = condition
    updateRow.condition_notes = condition_notes ?? null
  }
  if (typeof is_fixed === 'boolean') {
    updateRow.is_fixed = is_fixed
  }
  if (Object.keys(updateRow).length === 0) {
    return res.status(400).json({ error: 'condition か is_fixed が必要です' })
  }
  const orgScenarioId = await resolveOrgScenarioId(user.orgId, scenario_id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (db as any)
    .from('scenario_kit_locations')
    .update(updateRow)
    .eq('organization_id', user.orgId)
    .eq('kit_number', kit_number)

  if (orgScenarioId) {
    q = q.eq('org_scenario_id', orgScenarioId)
  } else {
    q = q.or(`org_scenario_id.eq.${scenario_id},scenario_master_id.eq.${scenario_id}`)
  }

  const { data, error } = await q.select(SELECT).single()
  if (error) {
    console.error('[kit-locations] patch error:', error)
    return res.status(500).json({ error: 'キット状態の更新に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// ─── DELETE: 自組織のキット位置レコード削除 ────────────────────────────
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = (req.query.id ?? req.body?.id) as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  // 自組織のレコードか検証
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: fetchError } = await (db as any)
    .from('scenario_kit_locations')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return res.status(500).json({ error: '取得に失敗', detail: fetchError.message })
  if (!existing) return res.status(404).json({ error: 'レコードが見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織のレコードは削除できません' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('scenario_kit_locations')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.orgId)
  if (error) {
    console.error('[kit-locations] delete error:', error)
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
    console.error('[kit-locations] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
