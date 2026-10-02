import { calculateEventGmCost, resolveGmCostIdentity, type EventStaffAssignmentLike } from '../src/lib/compensation.js'
import { loadCompensationHistory } from './_lib/compensationHistory.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleSalaryReportData } from './_lib/salaryReportData.js'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError } from './_lib/auth.js'
import { getParticipationFee, getLicenseAmount, SCENARIO_PRICING_COLUMNS, type ScenarioPricing } from '../src/lib/pricing.js'
import { isInternalLicenseReportablePerformance } from '../src/lib/licensePerformance.js'

// NOTE: schedule_events_staff_view ではなく schedule_events を直接参照する。
// 理由: スタッフ向けビューは `WHERE is_staff_or_admin()` で auth.uid() を見るが、
// この API ハンドラは service role で実行されるため auth.uid() が NULL になり
// ビュー越しでは常に 0 件しか返らない。本ハンドラは requireStaff(user) で既に
// スタッフ権限を確認しているので、ビューの追加チェックは不要。
import { setCors, getStartEnd, getStoreIds, SCHEDULE_EVENT_SALES_SELECT_FIELDS, STORE_SELECT_FIELDS_FOR_SALES, STORE_AND_SCENARIO_NESTED_SELECT, AUTHOR_PERFORMANCE_SELECT } from './_lib/sales/common.js'
import { getReservationRevenue, SALES_RESERVATION_STATUSES } from './_lib/sales/revenue.js'
import type { ScheduleEvent, ScenarioForPeriod, OrgScenarioRow } from './_lib/sales/types.js'
export { getReservationRevenue } from './_lib/sales/revenue.js'
import { handleScheduleExport } from './_lib/sales/scheduleExport.js'
import { handleByPeriod } from './_lib/sales/byPeriod.js'
import { handleAnnualAnalysis } from './_lib/sales/annualAnalysis.js'
import { handleScenarioPerformance } from './_lib/sales/scenarioPerformance.js'

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
      case 'salary-history':
      case 'salary-inputs':
      case 'sales-cost-inputs':
        return await handleSalaryReportData(req, res, user.orgId)
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
      case 'annual-analysis':
        return await handleAnnualAnalysis(req, res, user.orgId)
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
