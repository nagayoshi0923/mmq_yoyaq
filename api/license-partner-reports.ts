import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { ApiError, requireAuth, requireStaff, type AuthUser } from './_lib/auth.js'
import { partnerStorePayAmount } from './_lib/partnerLicenseAmount.js'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    const scope = (req.query.scope as string | undefined) || 'staff'
    const year = Number(req.query.year)
    const monthRaw = req.query.month
    const month = monthRaw == null || monthRaw === '' ? null : Number(monthRaw)

    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      return res.status(400).json({ error: '年が不正です' })
    }
    if (month != null && (!Number.isInteger(month) || month < 1 || month > 12)) {
      return res.status(400).json({ error: '月が不正です' })
    }

    if (scope === 'author') return await handleAuthor(res, user, year, month)
    if (scope === 'staff') return await handleStaff(res, user, year, month)
    return res.status(400).json({ error: 'scope が不正です' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[license-partner-reports] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

async function handleStaff(
  res: VercelResponse,
  user: AuthUser,
  year: number,
  month: number | null
) {
  requireStaff(user)
  return res.status(200).json(await loadRows({ organizationId: user.orgId, year, month }))
}

async function handleAuthor(
  res: VercelResponse,
  user: AuthUser,
  year: number,
  month: number | null
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userData, error: userError } = await (db as any).auth.admin.getUserById(user.userId)
  if (userError || !userData?.user?.email) {
    return res.status(401).json({ error: 'ログインが必要です' })
  }
  const email = String(userData.user.email)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: masters, error: masterError } = await (db as any)
    .from('scenario_masters')
    .select('id')
    .ilike('author_email', email)

  if (masterError) {
    console.error('[license-partner-reports:author] masters DB error:', masterError)
    return res.status(500).json({ error: '作者作品の取得に失敗しました' })
  }

  const scenarioIds = (masters ?? []).map((row: { id: string }) => row.id)
  if (scenarioIds.length === 0) {
    return res.status(200).json({
      year,
      month,
      rows: [],
      totals: { performance_count: 0, license_fee: 0 },
    })
  }

  return res.status(200).json(await loadRows({ year, month, scenarioIds }))
}

async function loadRows(params: {
  organizationId?: string
  year: number
  month: number | null
  scenarioIds?: string[]
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db as any)
    .from('license_partner_monthly_reports')
    .select('partner_store_id, scenario_master_id, organization_id, year, month, performance_count')
    .eq('year', params.year)

  if (params.month != null) query = query.eq('month', params.month)
  if (params.organizationId) query = query.eq('organization_id', params.organizationId)
  if (params.scenarioIds) query = query.in('scenario_master_id', params.scenarioIds)

  const { data: reports, error: reportError } = await query
  if (reportError) {
    console.error('[license-partner-reports] reports DB error:', reportError)
    throw new ApiError(500, '月次報告の取得に失敗しました')
  }

  const reportRows = reports ?? []
  if (reportRows.length === 0) {
    return {
      year: params.year,
      month: params.month,
      rows: [],
      totals: { performance_count: 0, license_fee: 0 },
    }
  }

  const storeIds = [...new Set(reportRows.map((row: { partner_store_id: string }) => row.partner_store_id))]
  const scenarioIds = [...new Set(reportRows.map((row: { scenario_master_id: string }) => row.scenario_master_id))]
  const orgIds = [...new Set(reportRows.map((row: { organization_id: string }) => row.organization_id))]

  const [storesResult, contractsResult, scenariosResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('license_partner_stores')
      .select('id, name')
      .in('id', storeIds),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('license_partner_contracts')
      .select('partner_store_id, scenario_master_id, license_amount')
      .in('partner_store_id', storeIds)
      .in('scenario_master_id', scenarioIds),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from('organization_scenarios_with_master')
      .select('organization_id, scenario_master_id, title, author, author_email, license_amount, external_license_amount')
      .in('organization_id', orgIds)
      .in('scenario_master_id', scenarioIds),
  ])

  if (storesResult.error || contractsResult.error || scenariosResult.error) {
    console.error(
      '[license-partner-reports] join DB error:',
      storesResult.error ?? contractsResult.error ?? scenariosResult.error
    )
    throw new ApiError(500, '店舗別報告の取得に失敗しました')
  }

  const storeMap = new Map<string, string>()
  for (const store of storesResult.data ?? []) storeMap.set(store.id, store.name)

  const contractMap = new Map<string, number | null>()
  for (const contract of contractsResult.data ?? []) {
    contractMap.set(`${contract.partner_store_id}:${contract.scenario_master_id}`, contract.license_amount)
  }

  const scenarioMap = new Map<string, {
    title: string
    author: string
    author_email: string | null
    license_amount: number
  }>()
  for (const scenario of scenariosResult.data ?? []) {
    const key = `${scenario.organization_id}:${scenario.scenario_master_id}`
    if (scenarioMap.has(key)) continue
    scenarioMap.set(key, {
      title: scenario.title,
      author: scenario.author || '不明',
      author_email: scenario.author_email ?? null,
      license_amount: partnerStorePayAmount(scenario),
    })
  }

  const aggregated = new Map<string, {
    author: string
    author_email: string | null
    scenario_master_id: string
    scenario_title: string
    partner_store_id: string
    partner_store_name: string
    performance_count: number
    license_amount: number
    license_fee: number
  }>()

  for (const report of reportRows) {
    const scenario = scenarioMap.get(`${report.organization_id}:${report.scenario_master_id}`)
    const override = contractMap.get(`${report.partner_store_id}:${report.scenario_master_id}`)
    const amount = override ?? scenario?.license_amount ?? 0
    const key = `${report.scenario_master_id}:${report.partner_store_id}`
    const current = aggregated.get(key)
    const count = report.performance_count || 0
    if (current) {
      current.performance_count += count
      current.license_fee += count * amount
      continue
    }
    aggregated.set(key, {
      author: scenario?.author || '不明',
      author_email: scenario?.author_email ?? null,
      scenario_master_id: report.scenario_master_id,
      scenario_title: scenario?.title || '不明な作品',
      partner_store_id: report.partner_store_id,
      partner_store_name: storeMap.get(report.partner_store_id) || '不明な店舗',
      performance_count: count,
      license_amount: amount,
      license_fee: count * amount,
    })
  }

  const rows = [...aggregated.values()].sort((a, b) => {
    if (a.author !== b.author) return a.author.localeCompare(b.author, 'ja')
    if (a.scenario_title !== b.scenario_title) return a.scenario_title.localeCompare(b.scenario_title, 'ja')
    return a.partner_store_name.localeCompare(b.partner_store_name, 'ja')
  })

  return {
    year: params.year,
    month: params.month,
    rows,
    totals: {
      performance_count: rows.reduce((sum, row) => sum + row.performance_count, 0),
      license_fee: rows.reduce((sum, row) => sum + row.license_fee, 0),
    },
  }
}
