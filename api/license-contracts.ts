import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { ApiError, requireAdmin, requireAuth, requireStaff, type AuthUser } from './_lib/auth.js'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

const MANAGER_TYPES = ['qw_managed', 'external_rights_holder', 'buyout', 'in_house'] as const
const BILLING_STATUSES = ['billable', 'not_billable', 'exempt', 'pending_confirmation'] as const

type LicenseContractBody = {
  store_id?: string
  scenario_master_id?: string
  license_manager_type?: string
  standard_license_amount?: number
  contracted_count?: number
  contract_start_date?: string | null
  contract_end_date?: string | null
  billing_status?: string
  notes?: string | null
}

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
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
      return await handleList(res, user)
    }

    if (req.method === 'POST') return await handleCreate(req, res, user)

    if (req.method === 'PATCH') {
      const id = req.query.id as string | undefined
      if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })
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
    console.error('[license-contracts] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

async function handleList(res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('store_scenario_license_contracts')
    .select(`
      id,
      organization_id,
      store_id,
      scenario_master_id,
      license_manager_type,
      standard_license_amount,
      contracted_count,
      contract_start_date,
      contract_end_date,
      billing_status,
      notes,
      created_at,
      updated_at,
      stores:store_id (id, name, short_name),
      scenario_masters:scenario_master_id (id, title, author)
    `)
    .eq('organization_id', user.orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[license-contracts:list] DB error:', error)
    return res.status(500).json({ error: '契約マスタの取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

async function handleOptions(res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  const [storesResult, scenariosResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('stores')
      .select('id, name, short_name')
      .eq('organization_id', user.orgId)
      .order('display_order', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('organization_scenarios_with_master')
      .select('scenario_master_id, title, author, license_amount')
      .eq('organization_id', user.orgId)
      .eq('org_status', 'available')
      .order('title', { ascending: true }),
  ])

  if (storesResult.error) {
    console.error('[license-contracts:options] stores DB error:', storesResult.error)
    return res.status(500).json({ error: '店舗一覧の取得に失敗しました', detail: storesResult.error.message })
  }
  if (scenariosResult.error) {
    console.error('[license-contracts:options] scenarios DB error:', scenariosResult.error)
    return res.status(500).json({ error: 'シナリオ一覧の取得に失敗しました', detail: scenariosResult.error.message })
  }

  const scenarioMap = new Map<string, { id: string; title: string; author: string | null; license_amount: number | null }>()
  for (const scenario of scenariosResult.data ?? []) {
    if (!scenario.scenario_master_id || scenarioMap.has(scenario.scenario_master_id)) continue
    scenarioMap.set(scenario.scenario_master_id, {
      id: scenario.scenario_master_id,
      title: scenario.title,
      author: scenario.author ?? null,
      license_amount: scenario.license_amount ?? null,
    })
  }

  return res.status(200).json({
    stores: storesResult.data ?? [],
    scenarios: [...scenarioMap.values()],
  })
}

async function handleCreate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireAdmin(user)
  const body = req.body as LicenseContractBody
  const validationError = validateBody(body, true)
  if (validationError) return res.status(400).json({ error: validationError })

  const ownershipError = await validateOwnedRefs(user, body.store_id!, body.scenario_master_id!)
  if (ownershipError) return res.status(ownershipError.status).json({ error: ownershipError.message })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('store_scenario_license_contracts')
    .insert(toDbPayload(body, user.orgId))
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'この店舗とシナリオの契約はすでに登録されています' })
    }
    console.error('[license-contracts:create] DB error:', error)
    return res.status(500).json({ error: '契約マスタの登録に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handleUpdate(req: VercelRequest, res: VercelResponse, user: AuthUser, id: string) {
  requireAdmin(user)
  const body = req.body as LicenseContractBody
  const validationError = validateBody(body, false)
  if (validationError) return res.status(400).json({ error: validationError })

  const existing = await getExistingContract(id, user.orgId)
  if ('error' in existing) return res.status(existing.status).json({ error: existing.error })

  const nextStoreId = body.store_id ?? existing.data.store_id
  const nextScenarioMasterId = body.scenario_master_id ?? existing.data.scenario_master_id
  const ownershipError = await validateOwnedRefs(user, nextStoreId, nextScenarioMasterId)
  if (ownershipError) return res.status(ownershipError.status).json({ error: ownershipError.message })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('store_scenario_license_contracts')
    .update(toDbPayload(body, user.orgId, false))
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'この店舗とシナリオの契約はすでに登録されています' })
    }
    console.error('[license-contracts:update] DB error:', error)
    return res.status(500).json({ error: '契約マスタの更新に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

async function handleDelete(res: VercelResponse, user: AuthUser, id: string) {
  requireAdmin(user)
  const existing = await getExistingContract(id, user.orgId)
  if ('error' in existing) return res.status(existing.status).json({ error: existing.error })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('store_scenario_license_contracts')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.orgId)

  if (error) {
    console.error('[license-contracts:delete] DB error:', error)
    return res.status(500).json({ error: '契約マスタの削除に失敗しました', detail: error.message })
  }
  return res.status(204).end()
}

function validateBody(body: LicenseContractBody, requireAll: boolean): string | null {
  if (requireAll && (!body.store_id || !body.scenario_master_id)) {
    return '店舗とシナリオは必須です'
  }
  if (body.license_manager_type !== undefined && !MANAGER_TYPES.includes(body.license_manager_type as typeof MANAGER_TYPES[number])) {
    return 'ライセンス管理者区分が不正です'
  }
  if (body.billing_status !== undefined && !BILLING_STATUSES.includes(body.billing_status as typeof BILLING_STATUSES[number])) {
    return '請求区分が不正です'
  }
  if (body.standard_license_amount !== undefined && (!Number.isInteger(body.standard_license_amount) || body.standard_license_amount < 0)) {
    return '標準ライセンス金額は0以上の整数で入力してください'
  }
  if (body.contracted_count !== undefined && (!Number.isInteger(body.contracted_count) || body.contracted_count < 0)) {
    return '契約本数は0以上の整数で入力してください'
  }
  if (body.contract_start_date && body.contract_end_date && body.contract_end_date < body.contract_start_date) {
    return '契約終了日は契約開始日以降にしてください'
  }
  return null
}

async function validateOwnedRefs(user: AuthUser, storeId: string, scenarioMasterId: string) {
  const [storeResult, scenarioResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('stores')
      .select('id')
      .eq('id', storeId)
      .eq('organization_id', user.orgId)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('organization_scenarios')
      .select('id')
      .eq('scenario_master_id', scenarioMasterId)
      .eq('organization_id', user.orgId)
      .maybeSingle(),
  ])

  if (storeResult.error || scenarioResult.error) {
    console.error('[license-contracts:validateRefs] DB error:', storeResult.error ?? scenarioResult.error)
    return { status: 500, message: '店舗またはシナリオの確認に失敗しました' }
  }
  if (!storeResult.data) return { status: 403, message: '指定された店舗は自組織の店舗ではありません' }
  if (!scenarioResult.data) return { status: 403, message: '指定されたシナリオは自組織で扱えません' }
  return null
}

async function getExistingContract(id: string, organizationId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('store_scenario_license_contracts')
    .select('id, store_id, scenario_master_id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    console.error('[license-contracts:existing] DB error:', error)
    return { status: 500, error: '契約マスタの取得に失敗しました' }
  }
  if (!data) return { status: 404, error: '契約マスタが見つかりません' }
  return { data }
}

function toDbPayload(body: LicenseContractBody, organizationId: string, includeDefaults = true) {
  const payload: Record<string, unknown> = { organization_id: organizationId }
  if (body.store_id !== undefined) payload.store_id = body.store_id
  if (body.scenario_master_id !== undefined) payload.scenario_master_id = body.scenario_master_id
  if (body.license_manager_type !== undefined || includeDefaults) payload.license_manager_type = body.license_manager_type ?? 'qw_managed'
  if (body.standard_license_amount !== undefined || includeDefaults) payload.standard_license_amount = body.standard_license_amount ?? 0
  if (body.contracted_count !== undefined || includeDefaults) payload.contracted_count = body.contracted_count ?? 1
  if (body.contract_start_date !== undefined) payload.contract_start_date = body.contract_start_date || null
  if (body.contract_end_date !== undefined) payload.contract_end_date = body.contract_end_date || null
  if (body.billing_status !== undefined || includeDefaults) payload.billing_status = body.billing_status ?? 'billable'
  if (body.notes !== undefined) payload.notes = body.notes || null
  return payload
}
