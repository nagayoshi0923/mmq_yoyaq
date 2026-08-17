import { randomBytes } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { ApiError, requireAdmin, requireAuth, requireStaff, type AuthUser } from './_lib/auth.js'
import { partnerStorePayAmount } from './_lib/partnerLicenseAmount.js'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

type StoreBody = {
  name?: string
  discord_channel_id?: string | null
  notes?: string | null
  is_active?: boolean
}

type ContractBody = {
  contracts?: Array<{
    scenario_master_id?: string
    license_amount?: number | null
  }>
}

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

function generateReportToken() {
  return randomBytes(32).toString('hex')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)

    if (req.method === 'GET') {
      const type = req.query.type as string | undefined
      if (type === 'options') return await handleOptions(res, user)
      if (type === 'detail') {
        const id = req.query.id as string | undefined
        if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })
        return await handleDetail(res, user, id)
      }
      return await handleList(res, user)
    }

    if (req.method === 'POST') {
      const type = req.query.type as string | undefined
      if (type === 'contracts') {
        const id = req.query.id as string | undefined
        if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })
        return await handleReplaceContracts(req, res, user, id)
      }
      return await handleCreate(req, res, user)
    }

    if (req.method === 'PATCH') {
      const id = req.query.id as string | undefined
      if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })
      if (req.query.type === 'rotate-token') return await handleRotateToken(res, user, id)
      return await handleUpdate(req, res, user, id)
    }

    if (req.method === 'DELETE') {
      const id = req.query.id as string | undefined
      if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })
      return await handleDelete(res, user, id)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[license-partner-stores] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

async function handleList(res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('license_partner_stores')
    .select('id, organization_id, name, discord_channel_id, report_token, is_active, notes, created_at, updated_at')
    .eq('organization_id', user.orgId)
    .order('name', { ascending: true })

  if (error) {
    console.error('[license-partner-stores:list] DB error:', error)
    return res.status(500).json({ error: '契約店舗の取得に失敗しました', detail: error.message })
  }

  const storeIds = (data ?? []).map((row: { id: string }) => row.id)
  const countMap = new Map<string, number>()
  if (storeIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contracts, error: contractError } = await (db as any)
      .from('license_partner_contracts')
      .select('partner_store_id')
      .eq('organization_id', user.orgId)
      .in('partner_store_id', storeIds)
    if (contractError) {
      console.error('[license-partner-stores:list] contracts DB error:', contractError)
      return res.status(500).json({ error: '契約数の取得に失敗しました', detail: contractError.message })
    }
    for (const row of contracts ?? []) {
      countMap.set(row.partner_store_id, (countMap.get(row.partner_store_id) ?? 0) + 1)
    }
  }

  return res.status(200).json(
    (data ?? []).map((row: { id: string }) => ({
      ...row,
      contract_count: countMap.get(row.id) ?? 0,
    }))
  )
}

async function handleOptions(res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_scenarios_with_master')
    .select('scenario_master_id, title, author, license_amount, external_license_amount')
    .eq('organization_id', user.orgId)
    .eq('org_status', 'available')
    .eq('scenario_type', 'managed')
    .order('title', { ascending: true })

  if (error) {
    console.error('[license-partner-stores:options] DB error:', error)
    return res.status(500).json({ error: '管理作品の取得に失敗しました', detail: error.message })
  }

  const scenarioMap = new Map<string, { id: string; title: string; author: string | null; license_amount: number }>()
  for (const scenario of data ?? []) {
    if (!scenario.scenario_master_id || scenarioMap.has(scenario.scenario_master_id)) continue
    scenarioMap.set(scenario.scenario_master_id, {
      id: scenario.scenario_master_id,
      title: scenario.title,
      author: scenario.author ?? null,
      license_amount: partnerStorePayAmount(scenario),
    })
  }

  return res.status(200).json({ scenarios: [...scenarioMap.values()] })
}

async function handleDetail(res: VercelResponse, user: AuthUser, id: string) {
  requireStaff(user)
  const store = await getOwnedStore(id, user.orgId)
  if ('error' in store) return res.status(store.status).json({ error: store.error })

  const [contractsResult, scenariosResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('license_partner_contracts')
      .select('id, organization_id, partner_store_id, scenario_master_id, license_amount, created_at, updated_at')
      .eq('organization_id', user.orgId)
      .eq('partner_store_id', id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('organization_scenarios_with_master')
      .select('scenario_master_id, title, author, license_amount, external_license_amount')
      .eq('organization_id', user.orgId)
      .eq('org_status', 'available')
      .eq('scenario_type', 'managed'),
  ])

  if (contractsResult.error || scenariosResult.error) {
    console.error('[license-partner-stores:detail] DB error:', contractsResult.error ?? scenariosResult.error)
    return res.status(500).json({ error: '契約内容の取得に失敗しました' })
  }

  const scenarioMap = new Map<string, { title: string; author: string | null; license_amount: number }>()
  for (const scenario of scenariosResult.data ?? []) {
    if (!scenario.scenario_master_id) continue
    scenarioMap.set(scenario.scenario_master_id, {
      title: scenario.title,
      author: scenario.author ?? null,
      license_amount: partnerStorePayAmount(scenario),
    })
  }

  const contracts = (contractsResult.data ?? []).map((row: {
    scenario_master_id: string
    license_amount: number | null
  }) => {
    const scenario = scenarioMap.get(row.scenario_master_id)
    return {
      ...row,
      scenario_title: scenario?.title ?? '不明な作品',
      author: scenario?.author ?? null,
      default_license_amount: scenario?.license_amount ?? 0,
    }
  })

  return res.status(200).json({
    ...store.data,
    contract_count: contracts.length,
    contracts,
  })
}

async function handleCreate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireAdmin(user)
  const body = req.body as StoreBody
  const name = body.name?.trim()
  if (!name) return res.status(400).json({ error: '店舗名は必須です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('license_partner_stores')
    .insert({
      organization_id: user.orgId,
      name,
      discord_channel_id: body.discord_channel_id?.trim() || null,
      notes: body.notes?.trim() || null,
      is_active: body.is_active ?? true,
      report_token: generateReportToken(),
    })
    .select()
    .single()

  if (error) {
    console.error('[license-partner-stores:create] DB error:', error)
    return res.status(500).json({ error: '契約店舗の登録に失敗しました', detail: error.message })
  }
  return res.status(200).json({ ...data, contract_count: 0 })
}

async function handleUpdate(req: VercelRequest, res: VercelResponse, user: AuthUser, id: string) {
  requireAdmin(user)
  const existing = await getOwnedStore(id, user.orgId)
  if ('error' in existing) return res.status(existing.status).json({ error: existing.error })

  const body = req.body as StoreBody
  const payload: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return res.status(400).json({ error: '店舗名は必須です' })
    payload.name = name
  }
  if (body.discord_channel_id !== undefined) payload.discord_channel_id = body.discord_channel_id?.trim() || null
  if (body.notes !== undefined) payload.notes = body.notes?.trim() || null
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('license_partner_stores')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .select()
    .single()

  if (error) {
    console.error('[license-partner-stores:update] DB error:', error)
    return res.status(500).json({ error: '契約店舗の更新に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handleRotateToken(res: VercelResponse, user: AuthUser, id: string) {
  requireAdmin(user)
  const existing = await getOwnedStore(id, user.orgId)
  if ('error' in existing) return res.status(existing.status).json({ error: existing.error })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('license_partner_stores')
    .update({ report_token: generateReportToken() })
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .select()
    .single()

  if (error) {
    console.error('[license-partner-stores:rotate] DB error:', error)
    return res.status(500).json({ error: '報告URLの再発行に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handleDelete(res: VercelResponse, user: AuthUser, id: string) {
  requireAdmin(user)
  const existing = await getOwnedStore(id, user.orgId)
  if ('error' in existing) return res.status(existing.status).json({ error: existing.error })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('license_partner_stores')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.orgId)

  if (error) {
    console.error('[license-partner-stores:delete] DB error:', error)
    return res.status(500).json({ error: '契約店舗の削除に失敗しました', detail: error.message })
  }
  return res.status(204).end()
}

async function handleReplaceContracts(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  id: string
) {
  requireAdmin(user)
  const existing = await getOwnedStore(id, user.orgId)
  if ('error' in existing) return res.status(existing.status).json({ error: existing.error })

  const body = req.body as ContractBody
  const contracts = body.contracts ?? []
  const scenarioIds = contracts.map((row) => row.scenario_master_id).filter(Boolean) as string[]
  if (new Set(scenarioIds).size !== scenarioIds.length) {
    return res.status(400).json({ error: '同じ作品を重複して契約できません' })
  }
  for (const row of contracts) {
    if (row.license_amount != null && (!Number.isInteger(row.license_amount) || row.license_amount < 0)) {
      return res.status(400).json({ error: 'ライセンス単価は0以上の整数で入力してください' })
    }
  }

  if (scenarioIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: managed, error: managedError } = await (db as any)
      .from('organization_scenarios')
      .select('scenario_master_id')
      .eq('organization_id', user.orgId)
      .eq('org_status', 'available')
      .eq('scenario_type', 'managed')
      .in('scenario_master_id', scenarioIds)

    if (managedError) {
      console.error('[license-partner-stores:contracts] managed DB error:', managedError)
      return res.status(500).json({ error: '管理作品の確認に失敗しました' })
    }
    const allowed = new Set((managed ?? []).map((row: { scenario_master_id: string }) => row.scenario_master_id))
    if (scenarioIds.some((scenarioId) => !allowed.has(scenarioId))) {
      return res.status(403).json({ error: '管理作品として公開中のシナリオだけ契約できます' })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deleteQuery = (db as any)
    .from('license_partner_contracts')
    .delete()
    .eq('organization_id', user.orgId)
    .eq('partner_store_id', id)
  if (scenarioIds.length > 0) {
    deleteQuery = deleteQuery.not('scenario_master_id', 'in', `(${scenarioIds.join(',')})`)
  }
  const { error: deleteError } = await deleteQuery

  if (deleteError) {
    console.error('[license-partner-stores:contracts] delete DB error:', deleteError)
    return res.status(500).json({ error: '既存契約の更新に失敗しました', detail: deleteError.message })
  }

  if (scenarioIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await (db as any)
      .from('license_partner_contracts')
      .upsert(
        contracts.map((row) => ({
          organization_id: user.orgId,
          partner_store_id: id,
          scenario_master_id: row.scenario_master_id,
          license_amount: row.license_amount ?? null,
        })),
        { onConflict: 'partner_store_id,scenario_master_id' }
      )
    if (upsertError) {
      console.error('[license-partner-stores:contracts] upsert DB error:', upsertError)
      return res.status(500).json({ error: '契約の保存に失敗しました', detail: upsertError.message })
    }
  }

  return await handleDetail(res, user, id)
}

async function getOwnedStore(id: string, organizationId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('license_partner_stores')
    .select('id, organization_id, name, discord_channel_id, report_token, is_active, notes, created_at, updated_at')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    console.error('[license-partner-stores:existing] DB error:', error)
    return { status: 500, error: '契約店舗の取得に失敗しました' }
  }
  if (!data) return { status: 404, error: '契約店舗が見つかりません' }
  return { data }
}
