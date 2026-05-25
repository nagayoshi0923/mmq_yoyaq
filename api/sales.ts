import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError } from './_lib/auth.js'
import { getParticipationFee, getLicenseAmount, sumGmCosts, type ScenarioPricing } from '../src/lib/pricing.js'

// NOTE: schedule_events_staff_view ではなく schedule_events を直接参照する。
// 理由: スタッフ向けビューは `WHERE is_staff_or_admin()` で auth.uid() を見るが、
// この API ハンドラは service role で実行されるため auth.uid() が NULL になり
// ビュー越しでは常に 0 件しか返らない。本ハンドラは requireStaff(user) で既に
// スタッフ権限を確認しているので、ビューの追加チェックは不要。

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

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const SCHEDULE_EVENT_SALES_SELECT_FIELDS =
  'id, organization_id, date, start_time, end_time, store_id, venue, scenario_master_id, scenario, organization_scenario_id, category, gms, gm_roles, capacity, max_participants, venue_rental_fee, is_cancelled'

const STORE_SELECT_FIELDS_FOR_SALES =
  'id, name, short_name, fixed_costs, ownership_type, transport_allowance, franchise_fee'

const STORE_AND_SCENARIO_NESTED_SELECT = `
  *,
  stores:store_id (
    id,
    name,
    short_name
  ),
  scenario_masters:scenario_master_id (
    id,
    title,
    author,
    duration
  ),
  organization_scenarios:organization_scenario_id (
    participation_fee,
    gm_test_participation_fee,
    participation_costs,
    license_amount,
    gm_test_license_amount,
    gm_costs
  )
`

const AUTHOR_PERFORMANCE_SELECT = `
  date,
  scenario_masters:scenario_master_id (
    id,
    title,
    author
  )
`

type ScheduleEvent = {
  id: string
  organization_id: string
  date: string
  start_time: string | null
  end_time: string | null
  store_id: string | null
  venue: string | null
  scenario_master_id: string | null
  scenario: string | null
  organization_scenario_id: string | null
  category: string | null
  gms: string[] | null
  gm_roles: Record<string, string> | null
  capacity: number | null
  max_participants: number | null
  venue_rental_fee: number | null
  is_cancelled: boolean | null
}

type ScenarioForPeriod = {
  id: string
  title: string
  author: string | null
  duration: number | null
  participation_fee: number | null
  gm_test_participation_fee: number | null
  participation_costs: unknown
  license_amount: number | null
  gm_test_license_amount: number | null
  franchise_license_amount: number | null
  franchise_gm_test_license_amount: number | null
  external_license_amount: number | null
  external_gm_test_license_amount: number | null
  fc_receive_license_amount: number | null
  fc_receive_gm_test_license_amount: number | null
  fc_author_license_amount: number | null
  fc_author_gm_test_license_amount: number | null
  scenario_type: string | null
  gm_costs: Array<{ role: string; reward: number; category?: 'normal' | 'gmtest' }> | null
  production_costs: unknown
  required_props: unknown
}

type OrgScenarioRow = {
  id: string
  scenario_master_id: string | null
  gm_costs: Array<{ role: string; reward: number; category?: 'normal' | 'gmtest' }> | null
  license_amount: number | null
  gm_test_license_amount: number | null
  franchise_license_amount: number | null
  franchise_gm_test_license_amount: number | null
  external_license_amount: number | null
  external_gm_test_license_amount: number | null
  fc_receive_license_amount: number | null
  fc_receive_gm_test_license_amount: number | null
  fc_author_license_amount: number | null
  fc_author_gm_test_license_amount: number | null
  participation_fee: number | null
  gm_test_participation_fee: number | null
}

type ReservationRow = {
  schedule_event_id: string
  participant_count: number | null
  participant_names: string[] | null
  payment_method: string | null
  final_price: number | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  const type = req.query.type as string | undefined
  if (!type) {
    return res.status(400).json({ error: 'type クエリパラメータが必要です' })
  }

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    switch (type) {
      case 'by-period':
        return await handleByPeriod(req, res, user.orgId)
      case 'by-store':
        return await handleByStore(req, res, user.orgId)
      case 'by-scenario':
        return await handleByScenario(req, res, user.orgId)
      case 'author-performance-count':
        return await handleAuthorPerformanceCount(req, res, user.orgId)
      case 'stores':
        return await handleStores(res, user.orgId)
      case 'scenario-performance':
        return await handleScenarioPerformance(req, res, user.orgId)
      case 'open-event-analysis':
        return await handleOpenEventAnalysis(req, res, user.orgId)
      case 'schedule-export':
        return await handleScheduleExport(req, res, user.orgId)
      default:
        return res.status(400).json({ error: `未対応の type: ${type}` })
    }
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[sales] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// ─── 共通ヘルパ ─────────────────────────────────────────────────────────────
function getStartEnd(req: VercelRequest): { start: string; end: string } | null {
  const start = req.query.start as string | undefined
  const end = req.query.end as string | undefined
  if (!start || !end) return null
  return { start, end }
}

function getStoreIds(req: VercelRequest): string[] | undefined {
  const raw = req.query.store_ids as string | string[] | undefined
  if (!raw) return undefined
  if (Array.isArray(raw)) return raw.filter(Boolean)
  const arr = String(raw).split(',').map(s => s.trim()).filter(Boolean)
  return arr.length > 0 ? arr : undefined
}

// ─── 期間別売上 (getSalesByPeriod 相当) ──────────────────────────────────────
async function handleByPeriod(req: VercelRequest, res: VercelResponse, orgId: string) {
  const range = getStartEnd(req)
  if (!range) return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  const { start, end } = range

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events, error } = await (db as any)
    .from('schedule_events')
    .select(SCHEDULE_EVENT_SALES_SELECT_FIELDS)
    .eq('organization_id', orgId)
    .gte('date', start)
    .lte('date', end)
    .eq('is_cancelled', false)
    .order('date', { ascending: true })

  if (error) {
    console.error('[sales] by-period events error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  if (!events || events.length === 0) {
    return res.status(200).json([])
  }

  // シナリオ取得（組織固有設定を含む）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scenarios, error: scenariosError } = await (db as any)
    .from('organization_scenarios_with_master')
    .select('id, title, author, duration, participation_fee, gm_test_participation_fee, participation_costs, license_amount, gm_test_license_amount, franchise_license_amount, franchise_gm_test_license_amount, external_license_amount, external_gm_test_license_amount, fc_receive_license_amount, fc_receive_gm_test_license_amount, fc_author_license_amount, fc_author_gm_test_license_amount, scenario_type, gm_costs, production_costs, required_props')
    .eq('organization_id', orgId)

  if (scenariosError) {
    console.error('[sales] by-period scenarios error:', scenariosError)
  }

  // organization_scenarios 取得（組織固有 GM 報酬等）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgScenarios, error: orgScenariosError } = await (db as any)
    .from('organization_scenarios')
    .select('id, scenario_master_id, gm_costs, license_amount, gm_test_license_amount, franchise_license_amount, franchise_gm_test_license_amount, external_license_amount, external_gm_test_license_amount, fc_receive_license_amount, fc_receive_gm_test_license_amount, fc_author_license_amount, fc_author_gm_test_license_amount, participation_fee, gm_test_participation_fee')
    .eq('organization_id', orgId)

  if (orgScenariosError) {
    console.error('[sales] by-period org_scenarios error:', orgScenariosError)
  }

  const orgScenarioMap = new Map<string, OrgScenarioRow>()
  ;(orgScenarios as OrgScenarioRow[] | null | undefined)?.forEach(os => {
    orgScenarioMap.set(os.id, os)
  })

  // スタッフ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staff, error: staffError } = await (db as any)
    .from('staff')
    .select('name')
    .eq('organization_id', orgId)

  if (staffError) {
    console.error('[sales] by-period staff error:', staffError)
  }

  const staffNames = new Set((staff as { name: string }[] | null | undefined)?.map(s => s.name) || [])

  // シナリオ名マップ
  const scenarioMap = new Map<string, ScenarioForPeriod>()
  ;(scenarios as ScenarioForPeriod[] | null | undefined)?.forEach(s => {
    scenarioMap.set(s.title, s)
  })

  // 各イベントを enrich
  const enriched = await Promise.all((events as ScheduleEvent[]).map(async (event) => {
    let scenarioInfo: Partial<ScenarioForPeriod> & {
      id?: string
      title?: string
      external_license_amount?: number | null
      external_gm_test_license_amount?: number | null
      fc_receive_license_amount?: number | null
      fc_receive_gm_test_license_amount?: number | null
      fc_author_license_amount?: number | null
      fc_author_gm_test_license_amount?: number | null
    } | null = null

    const scenarioKey = event.scenario_master_id
    if (scenarioKey && scenarios) {
      const found = (scenarios as ScenarioForPeriod[]).find(s => s.id === scenarioKey)
      scenarioInfo = found ?? null
    } else if (event.scenario) {
      scenarioInfo = scenarioMap.get(event.scenario) ?? null
    }

    if (event.organization_scenario_id && orgScenarioMap.has(event.organization_scenario_id)) {
      const orgScenario = orgScenarioMap.get(event.organization_scenario_id)!
      if (scenarioInfo) {
        scenarioInfo = {
          ...scenarioInfo,
          gm_costs: (orgScenario.gm_costs && orgScenario.gm_costs.length > 0)
            ? orgScenario.gm_costs
            : scenarioInfo.gm_costs ?? null,
          license_amount: orgScenario.license_amount ?? scenarioInfo.license_amount ?? null,
          gm_test_license_amount: orgScenario.gm_test_license_amount ?? scenarioInfo.gm_test_license_amount ?? null,
          franchise_license_amount: orgScenario.franchise_license_amount ?? scenarioInfo.franchise_license_amount ?? null,
          franchise_gm_test_license_amount: orgScenario.franchise_gm_test_license_amount ?? scenarioInfo.franchise_gm_test_license_amount ?? null,
          external_license_amount: orgScenario.external_license_amount ?? scenarioInfo.external_license_amount ?? null,
          external_gm_test_license_amount: orgScenario.external_gm_test_license_amount ?? scenarioInfo.external_gm_test_license_amount ?? null,
          fc_receive_license_amount: orgScenario.fc_receive_license_amount ?? scenarioInfo.fc_receive_license_amount ?? null,
          fc_receive_gm_test_license_amount: orgScenario.fc_receive_gm_test_license_amount ?? scenarioInfo.fc_receive_gm_test_license_amount ?? null,
          fc_author_license_amount: orgScenario.fc_author_license_amount ?? scenarioInfo.fc_author_license_amount ?? null,
          fc_author_gm_test_license_amount: orgScenario.fc_author_gm_test_license_amount ?? scenarioInfo.fc_author_gm_test_license_amount ?? null,
        }
      } else {
        scenarioInfo = {
          id: orgScenario.scenario_master_id ?? orgScenario.id,
          title: event.scenario || '不明',
          gm_costs: orgScenario.gm_costs || [],
          license_amount: orgScenario.license_amount,
          gm_test_license_amount: orgScenario.gm_test_license_amount,
          franchise_license_amount: orgScenario.franchise_license_amount,
          franchise_gm_test_license_amount: orgScenario.franchise_gm_test_license_amount,
          external_license_amount: orgScenario.external_license_amount,
          external_gm_test_license_amount: orgScenario.external_gm_test_license_amount,
          fc_receive_license_amount: orgScenario.fc_receive_license_amount,
          fc_receive_gm_test_license_amount: orgScenario.fc_receive_gm_test_license_amount,
          fc_author_license_amount: orgScenario.fc_author_license_amount,
          fc_author_gm_test_license_amount: orgScenario.fc_author_gm_test_license_amount,
        }
      }
    }

    // 予約取得
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: reservations, error: reservationError } = await (db as any)
      .from('reservations')
      .select('participant_count, participant_names, payment_method, final_price')
      .eq('organization_id', orgId)
      .eq('schedule_event_id', event.id)
      .in('status', ['confirmed', 'pending', 'gm_confirmed', 'checked_in'])

    if (reservationError && reservationError.code !== 'PGRST116') {
      console.warn('[sales] by-period reservation error:', {
        eventId: event.id,
        code: reservationError.code,
        message: reservationError.message,
      })
    }

    let totalParticipants = 0
    let totalRevenue = 0

    const isVenueRental = event.category === 'venue_rental' || event.category === 'venue_rental_free'
    if (isVenueRental) {
      totalRevenue = event.category === 'venue_rental_free' ? 0 : (event.venue_rental_fee || 12000)
    } else {
      (reservations as Array<Omit<ReservationRow, 'schedule_event_id'>> | null | undefined)?.forEach(r => {
        const participantCount = r.participant_count || 0
        totalParticipants += participantCount

        const participantNames = r.participant_names || []
        const hasStaffParticipant = participantNames.some((name: string) => staffNames.has(name))

        if (hasStaffParticipant || r.payment_method === 'staff') {
          totalRevenue += 0
        } else {
          totalRevenue += r.final_price || 0
        }
      })
    }

    return {
      ...event,
      scenarios: scenarioInfo,
      revenue: totalRevenue,
      actual_participants: totalParticipants,
      has_demo_participant: totalParticipants >= (event.max_participants || event.capacity || 0),
    }
  }))

  return res.status(200).json(enriched)
}

// ─── 店舗別売上 (getSalesByStore 相当) ───────────────────────────────────────
async function handleByStore(req: VercelRequest, res: VercelResponse, orgId: string) {
  const range = getStartEnd(req)
  if (!range) return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  const { start, end } = range

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('schedule_events')
    .select(STORE_AND_SCENARIO_NESTED_SELECT)
    .eq('organization_id', orgId)
    .gte('date', start)
    .lte('date', end)
    .eq('is_cancelled', false)

  if (error) {
    console.error('[sales] by-store error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── シナリオ別売上 (getSalesByScenario 相当) ────────────────────────────────
async function handleByScenario(req: VercelRequest, res: VercelResponse, orgId: string) {
  const range = getStartEnd(req)
  if (!range) return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  const { start, end } = range

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('schedule_events')
    .select(STORE_AND_SCENARIO_NESTED_SELECT)
    .eq('organization_id', orgId)
    .gte('date', start)
    .lte('date', end)
    .eq('is_cancelled', false)

  if (error) {
    console.error('[sales] by-scenario error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── 作者別公演実行回数 (getPerformanceCountByAuthor 相当) ──────────────────
async function handleAuthorPerformanceCount(req: VercelRequest, res: VercelResponse, orgId: string) {
  const range = getStartEnd(req)
  if (!range) return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  const { start, end } = range

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('schedule_events')
    .select(AUTHOR_PERFORMANCE_SELECT)
    .eq('organization_id', orgId)
    .gte('date', start)
    .lte('date', end)
    .eq('is_cancelled', false)

  if (error) {
    console.error('[sales] author-performance-count error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── 店舗一覧 (getStores 相当) ───────────────────────────────────────────────
async function handleStores(res: VercelResponse, orgId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('stores')
    .select(STORE_SELECT_FIELDS_FOR_SALES)
    .eq('organization_id', orgId)
    .order('name', { ascending: true })

  if (error) {
    console.error('[sales] stores error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── シナリオ別公演数 (getScenarioPerformance 相当) ─────────────────────────
async function handleScenarioPerformance(req: VercelRequest, res: VercelResponse, orgId: string) {
  const range = getStartEnd(req)
  if (!range) return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  const { start, end } = range
  const storeIds = getStoreIds(req)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (db as any)
    .from('schedule_events')
    .select(SCHEDULE_EVENT_SALES_SELECT_FIELDS)
    .eq('organization_id', orgId)
    .gte('date', start)
    .lte('date', end)
    .eq('is_cancelled', false)

  if (storeIds && storeIds.length > 0) {
    query = query.in('store_id', storeIds)
  }

  const { data: events, error } = await query

  if (error) {
    console.error('[sales] scenario-performance events error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  if (!events || events.length === 0) {
    return res.status(200).json([])
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scenarios, error: scenariosError } = await (db as any)
    .from('organization_scenarios_with_master')
    .select('id, title, author, license_amount, gm_test_license_amount, gm_costs')
    .eq('organization_id', orgId)

  if (scenariosError) {
    console.error('[sales] scenario-performance scenarios error:', scenariosError)
  }

  type Scenario = { id: string; title: string; author: string | null }
  const scenarioMap = new Map<string, Scenario>()
  ;(scenarios as Scenario[] | null | undefined)?.forEach(s => {
    scenarioMap.set(s.title, s)
  })

  const performanceMap = new Map<string, {
    id: string
    title: string
    author: string | null
    category: 'open' | 'gmtest'
    events: number
    stores: Set<string>
  }>()

  ;(events as ScheduleEvent[]).forEach(event => {
    let scenarioInfo: Scenario | null = null
    const scenarioKey = event.scenario_master_id
    if (scenarioKey && scenarios) {
      const found = (scenarios as Scenario[]).find(s => s.id === scenarioKey)
      scenarioInfo = found ?? null
    } else if (event.scenario) {
      scenarioInfo = scenarioMap.get(event.scenario) ?? null
    }

    if (!scenarioInfo && event.scenario) {
      scenarioInfo = {
        id: event.scenario,
        title: event.scenario,
        author: '不明',
      }
    }

    if (scenarioInfo) {
      const category = event.category || 'open'
      const isGMTest = category === 'gmtest'
      const key = isGMTest ? `${scenarioInfo.id}_gmtest` : scenarioInfo.id

      if (performanceMap.has(key)) {
        const existing = performanceMap.get(key)!
        existing.events += 1
        if (event.venue) {
          existing.stores.add(event.venue)
        }
      } else {
        performanceMap.set(key, {
          id: scenarioInfo.id,
          title: scenarioInfo.title,
          author: scenarioInfo.author,
          category: isGMTest ? 'gmtest' : 'open',
          events: 1,
          stores: new Set(event.venue ? [event.venue] : []),
        })
      }
    }
  })

  const result = Array.from(performanceMap.values()).map(item => ({
    ...item,
    stores: Array.from(item.stores),
  }))

  return res.status(200).json(result)
}

// ─── 給与計算ヘルパー ────────────────────────────────────────────────────────
function calcDurationMinutes(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 90
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return diff > 0 ? diff : 90
}

type SalarySettingsLike = {
  gm_base_pay: number; gm_hourly_rate: number
  gm_test_base_pay: number; gm_test_hourly_rate: number
  use_hourly_table: boolean
  hourly_rates: Array<{ hours: number; amount: number }> | null
  gm_test_hourly_rates: Array<{ hours: number; amount: number }> | null
}

function calcGmWageFromSettings(durationMinutes: number, isGmTest: boolean, s: SalarySettingsLike): number {
  const hours = durationMinutes / 60
  if (s.use_hourly_table) {
    const rates = (isGmTest ? s.gm_test_hourly_rates : s.hourly_rates) ?? []
    const fallbackRate = isGmTest ? s.gm_test_hourly_rate : s.gm_hourly_rate
    const fallbackBase = isGmTest ? s.gm_test_base_pay : s.gm_base_pay
    const roundedHours = Math.ceil(hours * 2) / 2
    const sorted = [...rates].sort((a, b) => a.hours - b.hours)
    const match = sorted.find(r => r.hours >= roundedHours)
    if (match) return match.amount
    const maxRate = sorted[sorted.length - 1]
    if (maxRate) return maxRate.amount + Math.round(fallbackRate * (roundedHours - maxRate.hours))
    return fallbackBase + Math.round(fallbackRate * hours)
  }
  if (isGmTest) return s.gm_test_base_pay + Math.round(s.gm_test_hourly_rate * hours)
  return s.gm_base_pay + Math.round(s.gm_hourly_rate * hours)
}

// ─── オープン公演分析 (getOpenEventAnalysis 相当) ───────────────────────────
async function handleOpenEventAnalysis(req: VercelRequest, res: VercelResponse, orgId: string) {
  const range = getStartEnd(req)
  if (!range) return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  const { start, end } = range
  const storeIds = getStoreIds(req)
  const includeGmTest = req.query.include_gm_test === 'true' || req.query.include_gm_test === '1'

  const categories = includeGmTest ? ['open', 'gmtest'] : ['open']

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let eventsQuery: any = (db as any)
    .from('schedule_events')
    .select('id, date, start_time, scenario, scenario_master_id, capacity, max_participants, current_participants, is_cancelled, created_at, store_id, category')
    .eq('organization_id', orgId)
    .in('category', categories)
    .gte('date', start)
    .lte('date', end)

  if (storeIds && storeIds.length > 0) {
    eventsQuery = eventsQuery.in('store_id', storeIds)
  }

  const { data: events, error: eventsError } = await eventsQuery.order('date', { ascending: true })

  if (eventsError) {
    console.error('[sales] open-event-analysis events error:', eventsError)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: eventsError.message })
  }
  if (!events || events.length === 0) return res.status(200).json({ events: [], reservations: [] })

  const eventIds = (events as { id: string }[]).map(e => e.id)
  const BATCH_SIZE = 100
  const allReservations: Array<{ id: string; schedule_event_id: string; created_at: string; participant_count: number | null; status: string }> = []

  for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
    const batchIds = eventIds.slice(i, i + BATCH_SIZE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch, error: batchError } = await (db as any)
      .from('reservations')
      .select('id, schedule_event_id, created_at, participant_count, status')
      .eq('organization_id', orgId)
      .in('schedule_event_id', batchIds)
      .neq('status', 'cancelled')

    if (batchError) {
      console.error('[sales] open-event-analysis reservations error:', batchError)
    } else if (batch) {
      allReservations.push(...batch)
    }
  }

  return res.status(200).json({ events, reservations: allReservations })
}

// ─── スケジュール CSV エクスポート (getScheduleExportData 相当) ─────────────
async function handleScheduleExport(req: VercelRequest, res: VercelResponse, orgId: string) {
  const range = getStartEnd(req)
  if (!range) return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  const { start, end } = range

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events, error } = await (db as any)
    .from('schedule_events')
    .select('id, date, start_time, end_time, store_id, venue, scenario, scenario_master_id, organization_scenario_id, category, gms, gm_roles, capacity, max_participants, venue_rental_fee, is_cancelled, organization_id')
    .eq('organization_id', orgId)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[sales] schedule-export events error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  if (!events || events.length === 0) return res.status(200).json([])

  // スタッフ名
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staffData } = await (db as any)
    .from('staff')
    .select('name')
    .eq('organization_id', orgId)
  const staffNames = new Set((staffData as { name: string }[] | null | undefined)?.map(s => s.name) || [])

  // 給与設定（gm_costs 未設定時のフォールバック用）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: salaryData } = await (db as any)
    .from('global_settings')
    .select('gm_base_pay, gm_hourly_rate, gm_test_base_pay, gm_test_hourly_rate, use_hourly_table, hourly_rates, gm_test_hourly_rates')
    .eq('organization_id', orgId)
    .single()
  // フロントエンドの DEFAULT_SETTINGS と同じデフォルト値を使用し、フィールド単位でフォールバック
  const DEFAULT_HOURLY_RATES: Array<{ hours: number; amount: number }> = [
    { hours: 1, amount: 3300 }, { hours: 1.5, amount: 3950 }, { hours: 2, amount: 4600 },
    { hours: 2.5, amount: 5250 }, { hours: 3, amount: 5900 }, { hours: 3.5, amount: 6550 },
    { hours: 4, amount: 7200 },
  ]
  const DEFAULT_GM_TEST_HOURLY_RATES: Array<{ hours: number; amount: number }> = [
    { hours: 1, amount: 1300 }, { hours: 1.5, amount: 1950 }, { hours: 2, amount: 2600 },
    { hours: 2.5, amount: 3250 }, { hours: 3, amount: 3900 }, { hours: 3.5, amount: 4550 },
    { hours: 4, amount: 5200 },
  ]
  const salarySettings: SalarySettingsLike = {
    gm_base_pay: salaryData?.gm_base_pay ?? 2000,
    gm_hourly_rate: salaryData?.gm_hourly_rate ?? 1300,
    gm_test_base_pay: salaryData?.gm_test_base_pay ?? 0,
    gm_test_hourly_rate: salaryData?.gm_test_hourly_rate ?? 1300,
    use_hourly_table: salaryData?.use_hourly_table ?? false,
    hourly_rates: (salaryData?.hourly_rates as Array<{ hours: number; amount: number }> | null) ?? DEFAULT_HOURLY_RATES,
    gm_test_hourly_rates: (salaryData?.gm_test_hourly_rates as Array<{ hours: number; amount: number }> | null) ?? DEFAULT_GM_TEST_HOURLY_RATES,
  }

  // 店舗
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stores } = await (db as any)
    .from('stores')
    .select('id, name, short_name')
  const storeMap = new Map<string, { id: string; name: string; short_name: string | null }>(
    (stores as Array<{ id: string; name: string; short_name: string | null }> | null | undefined)?.map(s => [s.id, s]) || []
  )

  type ParticipationCost = { time_slot?: string; amount: number; status?: string }
  type ScenarioInfo = {
    id: string
    gm_costs: Array<{ role: string; reward: number; category?: 'normal' | 'gmtest' }> | null
    license_amount: number | null
    gm_test_license_amount: number | null
    participation_fee: number | null
    gm_test_participation_fee: number | null
    participation_costs: ParticipationCost[] | null
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scenariosData } = await (db as any)
    .from('organization_scenarios_with_master')
    .select('id, gm_costs, license_amount, gm_test_license_amount, participation_fee, gm_test_participation_fee, participation_costs')
    .eq('organization_id', orgId)
  const scenarioByMasterId = new Map<string, ScenarioInfo>(
    (scenariosData as ScenarioInfo[] | null | undefined)?.map(s => [s.id, s]) || []
  )

  type OrgScenarioOverride = {
    id: string
    scenario_master_id: string | null
    gm_costs: Array<{ role: string; reward: number; category?: 'normal' | 'gmtest' }> | null
    license_amount: number | null
    gm_test_license_amount: number | null
    participation_fee: number | null
    gm_test_participation_fee: number | null
    participation_costs: ParticipationCost[] | null
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgScenariosData } = await (db as any)
    .from('organization_scenarios')
    .select('id, scenario_master_id, gm_costs, license_amount, gm_test_license_amount, participation_fee, gm_test_participation_fee, participation_costs')
    .eq('organization_id', orgId)
  const orgScenarioById = new Map<string, OrgScenarioOverride>(
    (orgScenariosData as OrgScenarioOverride[] | null | undefined)?.map(s => [s.id, s]) || []
  )

  // 予約をバッチ取得
  type ScheduleEventExport = {
    id: string
    date: string
    start_time: string | null
    end_time: string | null
    store_id: string | null
    venue: string | null
    scenario: string | null
    scenario_master_id: string | null
    organization_scenario_id: string | null
    category: string | null
    gms: string[] | null
    gm_roles: Record<string, string> | null
    capacity: number | null
    max_participants: number | null
    venue_rental_fee: number | null
    is_cancelled: boolean | null
    organization_id: string
  }
  const eventList = events as ScheduleEventExport[]
  const eventIds = eventList.map(e => e.id)
  const BATCH_SIZE = 100
  const allReservations: Array<{
    schedule_event_id: string
    participant_count: number | null
    participant_names: string[] | null
    payment_method: string | null
    final_price: number | null
  }> = []

  for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
    const batchIds = eventIds.slice(i, i + BATCH_SIZE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch } = await (db as any)
      .from('reservations')
      .select('schedule_event_id, participant_count, participant_names, payment_method, final_price')
      .eq('organization_id', orgId)
      .in('schedule_event_id', batchIds)
      .in('status', ['confirmed', 'pending', 'gm_confirmed', 'checked_in'])

    if (batch) allReservations.push(...batch)
  }

  const reservationsByEvent = new Map<string, typeof allReservations>()
  allReservations.forEach(r => {
    const existing = reservationsByEvent.get(r.schedule_event_id) || []
    existing.push(r)
    reservationsByEvent.set(r.schedule_event_id, existing)
  })

  const result = eventList.map(event => {
    const reservations = reservationsByEvent.get(event.id) || []
    const isVenueRental = event.category === 'venue_rental' || event.category === 'venue_rental_free'
    const isGmTest = event.category === 'gmtest'
    const store = storeMap.get(event.store_id ?? '')

    // 1. ビューから scenario_master_id でシナリオ情報を取得
    let scenarioInfo: ScenarioInfo | null = scenarioByMasterId.get(event.scenario_master_id ?? '') ?? null
    // 2. organization_scenario_id があれば org 固有設定で上書き
    if (event.organization_scenario_id) {
      const override = orgScenarioById.get(event.organization_scenario_id)
      if (override) {
        scenarioInfo = {
          ...scenarioInfo,
          id: scenarioInfo?.id ?? '',
          gm_costs: ((override.gm_costs?.length ?? 0) > 0 ? override.gm_costs : scenarioInfo?.gm_costs) ?? null,
          license_amount: override.license_amount ?? scenarioInfo?.license_amount ?? null,
          gm_test_license_amount: override.gm_test_license_amount ?? scenarioInfo?.gm_test_license_amount ?? null,
          participation_fee: override.participation_fee ?? scenarioInfo?.participation_fee ?? null,
          gm_test_participation_fee: override.gm_test_participation_fee ?? scenarioInfo?.gm_test_participation_fee ?? null,
          participation_costs: ((override.participation_costs?.length ?? 0) > 0 ? override.participation_costs : scenarioInfo?.participation_costs) ?? null,
        }
      }
    }

    const cat = isGmTest ? 'gmtest' : 'normal'
    const licenseAmount = getLicenseAmount(scenarioInfo as ScenarioPricing | null, cat)

    // gm_roles でロール未設定または main/sub のみ実GMとして集計
    // reception / staff / observer / その他は GM 給与対象外
    const ACTIVE_GM_ROLES = new Set(['main', 'sub'])
    const gmRoles = event.gm_roles ?? {}
    const activeGmNames = new Set(
      Array.isArray(event.gms)
        ? event.gms.filter(name => {
            const role = gmRoles[name]?.toLowerCase()
            // ロール未設定はメイン GM 相当として残す（後方互換）
            return !role || ACTIVE_GM_ROLES.has(role)
          })
        : []
    )
    const actualGmCount = activeGmNames.size

    let gmCost = 0
    const hasGmCostsForCat = scenarioInfo?.gm_costs?.some(g => (g.category || 'normal') === cat) ?? false
    if (hasGmCostsForCat) {
      gmCost = sumGmCosts(scenarioInfo as ScenarioPricing | null, cat, actualGmCount)
    } else if (actualGmCount > 0 && !isVenueRental) {
      const durationMinutes = calcDurationMinutes(event.start_time, event.end_time)
      gmCost = calcGmWageFromSettings(durationMinutes, isGmTest, salarySettings) * actualGmCount
    }

    let totalParticipants = 0
    let staffParticipants = 0
    let regularParticipants = 0
    let onsiteAmount = 0
    let onlineAmount = 0
    const staffParticipantNames: string[] = []

    if (isVenueRental) {
      onsiteAmount = event.category === 'venue_rental_free' ? 0 : (event.venue_rental_fee || 12000)
    } else {
      reservations.forEach(r => {
        const count = r.participant_count || 0
        totalParticipants += count

        const names = r.participant_names || []
        // GM（activeGmNames）またはスタッフ名に一致、またはstaff支払いはスタッフ参加扱い
        const isStaff = r.payment_method === 'staff'
          || names.some((n: string) => staffNames.has(n))
          || names.some((n: string) => activeGmNames.has(n))

        if (isStaff) {
          staffParticipants += count
          for (const n of names) {
            if (n && !staffParticipantNames.includes(n)) staffParticipantNames.push(n)
          }
        } else {
          regularParticipants += count
          // GMテスト公演は participation_costs.gmtest を最優先で適用（旧カラム/通常料金へフォールバック）
          const unitFee = getParticipationFee(scenarioInfo as ScenarioPricing | null, cat)
          const price = isGmTest
            ? unitFee * count
            : (r.final_price ?? unitFee * count)
          if (r.payment_method === 'online') onlineAmount += price
          else onsiteAmount += price
        }
      })
    }

    const totalRevenue = onsiteAmount + onlineAmount
    const netProfit = totalRevenue - licenseAmount - gmCost

    return {
      date: event.date,
      start_time: event.start_time,
      end_time: event.end_time,
      store_name: store?.short_name || store?.name || event.venue || '',
      scenario: event.scenario || '',
      category: event.category,
      is_cancelled: event.is_cancelled ?? false,
      gms: Array.from(activeGmNames).join('・'),
      capacity: event.max_participants || event.capacity || 0,
      total_participants: totalParticipants,
      regular_participants: regularParticipants,
      staff_participants: staffParticipants,
      staff_participant_names: staffParticipantNames.join('・'),
      onsite_amount: onsiteAmount,
      online_amount: onlineAmount,
      total_revenue: totalRevenue,
      license_amount: licenseAmount,
      gm_cost: gmCost,
      net_profit: netProfit,
    }
  })

  return res.status(200).json(result)
}
