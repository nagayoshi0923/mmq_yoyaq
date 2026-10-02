// api/scenarios.ts の統計（stats / all-stats）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import { calculateEventGmCost, resolveGmCostIdentity, type EventStaffAssignmentLike, type IndividualGmCost } from '../../../src/lib/compensation.js'
import { loadCompensationHistory } from '../compensationHistory.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getParticipationFee, getLicenseAmount, type ScenarioPricing } from '../../../src/lib/pricing.js'
import { DEMO_RESERVATION_SOURCES, STAFF_RESERVATION_SOURCES, STATS_ALL_SCHEDULE_EVENT_FIELDS, STATS_FUTURE_RESERVATION_FIELDS, STATS_RESERVATION_FIELDS, STATS_SCENARIO_FIELDS, STATS_SCHEDULE_EVENT_COUNT_FIELDS, STATS_SCHEDULE_EVENT_DETAIL_FIELDS, db } from './common.js'

export async function handleGetScenarioStats(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const scenarioId = req.query.scenarioId as string | undefined
  if (!scenarioId) {
    return res.status(400).json({ error: 'scenarioId が必要です' })
  }
  const today = new Date().toISOString().split('T')[0]

  // ── シナリオの料金・GM報酬等のメタ情報を取得（自組織） ───────────────────
  const { data: _scenarioRaw, error: scenarioError } = await db
    .from('organization_scenarios_with_master')
    .select(STATS_SCENARIO_FIELDS)
    .eq('id', scenarioId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (scenarioError) throw scenarioError
  if (!_scenarioRaw) return res.status(404).json({ error: 'シナリオが見つかりません' })
  const scenarioData = _scenarioRaw as {
    player_count_max?: number
    license_amount?: number
    gm_test_license_amount?: number
    license_rewards?: Array<{ item: string; amount: number }>
    participation_fee?: number
    gm_test_participation_fee?: number
    participation_costs?: Array<{ time_slot: string; amount: number }>
    gm_costs?: IndividualGmCost[]
    duration?: number
  } | null

  const maxParticipants = scenarioData?.player_count_max ?? 99
  const defaultLicenseAmount = scenarioData?.license_amount ?? 0
  const pricing = scenarioData as ScenarioPricing | null
  const normalLicenseAmount = getLicenseAmount(pricing, 'normal')
  const gmTestLicenseAmount = getLicenseAmount(pricing, 'gmtest')
  const normalParticipationFee = getParticipationFee(pricing, 'normal')
  const gmTestParticipationFee = getParticipationFee(pricing, 'gmtest')

  // ── 公演回数 ────────────────────────────────────────────────────────────
  const { count: performanceCount, error: perfError } = await db
    .from('schedule_events')
    .select(STATS_SCHEDULE_EVENT_COUNT_FIELDS, { count: 'exact', head: true })
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .lte('date', today)
    .neq('category', 'offsite')
    .neq('is_cancelled', true)
  if (perfError) throw perfError

  const { count: cancelledCount, error: cancelError } = await db
    .from('schedule_events')
    .select(STATS_SCHEDULE_EVENT_COUNT_FIELDS, { count: 'exact', head: true })
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .lte('date', today)
    .neq('category', 'offsite')
    .eq('is_cancelled', true)
  if (cancelError) throw cancelError

  // ── 初公演日 ────────────────────────────────────────────────────────────
  const { data: firstEvent, error: firstError } = await db
    .from('schedule_events')
    .select('date')
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .lte('date', today)
    .neq('category', 'offsite')
    .neq('is_cancelled', true)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle()
  const firstPerformanceDate = firstError ? null : (firstEvent?.date as string | null) ?? null

  // ── 公演イベント詳細 ────────────────────────────────────────────────────
  const { data: events, error: eventsError } = await db
    .from('schedule_events')
    .select(STATS_SCHEDULE_EVENT_DETAIL_FIELDS)
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .lte('date', today)
    .order('date', { ascending: false })
  if (eventsError) throw eventsError

  type EventRow = {
    id: string
    date: string
    category: string | null
    current_participants: number | null
    total_revenue: number | null
    gm_cost: number | null
    license_cost: number | null
    start_time: string | null
    store_id: string | null
    is_cancelled: boolean | null
    gms: string[] | null
    gm_roles: Record<string,string> | null
    staff_assignments?: EventStaffAssignmentLike[] | null
    stores?: { venue_cost_per_performance?: number | null; transport_allowance?: number | null } | null
  }
  const eventList = (events ?? []) as unknown as EventRow[]
  const unrecordedEvents = eventList.filter(event => event.gm_cost === null && !event.is_cancelled)
  const dates = unrecordedEvents.map(event => event.date).sort()
  const settingsForDate = dates.length ? await loadCompensationHistory(db, orgId, dates[0], dates.at(-1)!) : null
  const { data: staff, error: staffError } = dates.length ? await db.from('staff').select('id,name,stores').eq('organization_id',orgId) : {data:[],error:null}
  if (staffError) throw staffError
  const homeStores = new Map<string,string[]>((staff ?? []).filter(person => Array.isArray(person.stores)).map(person => [person.name, person.stores as string[]]))
  const staffById = new Map<string,{ stores: string[] | null }>((staff ?? []).map(person => [person.id, { stores: (person.stores as string[] | null) ?? null }]))
  const eventIds = eventList.map((e) => e.id)
  const demoParticipantsMap: Record<string, number> = {}
  const actualParticipantsMap: Record<string, number> = {}
  const staffParticipantsMap: Record<string, number> = {}

  if (eventIds.length > 0) {
    const BATCH_SIZE = 100
    type ResRow = {
      schedule_event_id: string | null
      participant_count: number | null
      reservation_source: string | null
      payment_method: string | null
    }
    const allReservations: ResRow[] = []

    for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
      const batchIds = eventIds.slice(i, i + BATCH_SIZE)
      const { data, error: resError } = await db
        .from('reservations')
        .select(STATS_RESERVATION_FIELDS)
        .eq('organization_id', orgId)
        .in('schedule_event_id', batchIds)
        .in('status', ['confirmed', 'gm_confirmed'])
      if (!resError && data) {
        allReservations.push(...(data as unknown as ResRow[]))
      }
    }

    for (const r of allReservations) {
      if (!r.schedule_event_id) continue
      const count = r.participant_count ?? 0
      const src = r.reservation_source ?? ''
      if (DEMO_RESERVATION_SOURCES.has(src)) {
        demoParticipantsMap[r.schedule_event_id] = (demoParticipantsMap[r.schedule_event_id] ?? 0) + count
      } else if (STAFF_RESERVATION_SOURCES.has(src) || r.payment_method === 'staff') {
        staffParticipantsMap[r.schedule_event_id] = (staffParticipantsMap[r.schedule_event_id] ?? 0) + count
      } else {
        actualParticipantsMap[r.schedule_event_id] = (actualParticipantsMap[r.schedule_event_id] ?? 0) + count
      }
    }
  }

  let totalRevenue = 0
  let totalParticipants = 0
  let totalStaffParticipants = 0
  let totalGmCost = 0
  let totalLicenseCost = 0
  let totalVenueCost = 0
  const venueCostSet = new Set<number>()
  const performanceDates: Array<{
    date: string
    category: string
    participants: number
    demoParticipants: number
    staffParticipants: number
    revenue: number
    licenseCost: number
    startTime: string
    storeId: string | null
    isCancelled: boolean
  }> = []

  for (const event of eventList) {
    const isCancelled = event.is_cancelled === true
    const demoCount = demoParticipantsMap[event.id] ?? 0
    const staffCount = staffParticipantsMap[event.id] ?? 0
    const actualCount = actualParticipantsMap[event.id] ?? 0
    const reservationParticipants = actualCount + demoCount
    const rawParticipants = reservationParticipants > 0
      ? reservationParticipants
      : event.current_participants ?? 0
    const participants = Math.min(rawParticipants, maxParticipants)

    const isGmTest = event.category === 'gmtest'
    const fee = isGmTest ? gmTestParticipationFee : normalParticipationFee
    const eventRevenue = event.total_revenue ?? participants * fee
    const eventGmCost = event.gm_cost ?? calculateEventGmCost({
      ...resolveGmCostIdentity(event, staffById, homeStores), duration: scenarioData?.duration ?? 180,
      isGmTest, costs: scenarioData?.gm_costs ?? [], getSettings: () => { if (!settingsForDate) throw new Error('報酬履歴が取得されていません'); return settingsForDate(event.date) },
      storeId: event.store_id ?? '', transportAllowance: event.stores?.transport_allowance,
      isCancelled, estimateUnassigned: Boolean(scenarioData),
    })

    let licenseCost = event.license_cost ?? 0
    if (licenseCost === 0) {
      licenseCost = isGmTest ? gmTestLicenseAmount : normalLicenseAmount
    }

    if (!isCancelled) {
      totalParticipants += participants
      totalStaffParticipants += staffCount
      totalRevenue += eventRevenue
      totalGmCost += eventGmCost
      totalLicenseCost += licenseCost

      const venueCost = event.stores?.venue_cost_per_performance ?? 0
      totalVenueCost += venueCost
      if (venueCost > 0) venueCostSet.add(venueCost)
    }

    performanceDates.push({
      date: event.date,
      category: event.category ?? 'open',
      participants,
      demoParticipants: demoCount,
      staffParticipants: staffCount,
      revenue: eventRevenue,
      licenseCost: isCancelled ? 0 : licenseCost,
      startTime: event.start_time ?? '',
      storeId: event.store_id ?? null,
      isCancelled,
    })
  }

  const perfCount = performanceCount ?? 0
  const venueCostPerPerformance =
    venueCostSet.size === 1
      ? [...venueCostSet][0]
      : venueCostSet.size > 1
        ? Math.round(totalVenueCost / (perfCount || 1))
        : 0

  // ── 将来分カウント ──────────────────────────────────────────────────────
  const { count: futurePerformanceCount } = await db
    .from('schedule_events')
    .select(STATS_SCHEDULE_EVENT_COUNT_FIELDS, { count: 'exact', head: true })
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .gt('date', today)
    .neq('category', 'offsite')
    .neq('is_cancelled', true)

  const { count: futureReservationCount } = await db
    .from('reservations')
    .select(STATS_FUTURE_RESERVATION_FIELDS, { count: 'exact', head: true })
    .eq('scenario_master_id', scenarioId)
    .eq('organization_id', orgId)
    .is('schedule_event_id', null)
    .in('status', ['confirmed', 'gm_confirmed', 'pending'])

  return res.status(200).json({
    performanceCount: perfCount,
    cancelledCount: cancelledCount ?? 0,
    totalRevenue,
    totalParticipants,
    totalStaffParticipants,
    totalGmCost,
    totalLicenseCost,
    totalVenueCost,
    venueCostPerPerformance,
    firstPerformanceDate,
    performanceDates,
    futurePerformanceCount: futurePerformanceCount ?? 0,
    futureReservationCount: futureReservationCount ?? 0,
  })
}

// 全シナリオの統計（リスト表示用、scenario_master_id ごとに集計）
export async function handleGetAllScenarioStats(res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const today = new Date().toISOString().split('T')[0]

  const pageSize = 1000
  let page = 0
  let hasMore = true
  type EventStatsRow = {
    scenario_master_id: string | null
    is_cancelled: boolean | null
    total_revenue: number | null
    date: string
    category: string | null
  }
  const allEvents: EventStatsRow[] = []

  while (hasMore) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await db
      .from('schedule_events')
      .select(STATS_ALL_SCHEDULE_EVENT_FIELDS)
      .eq('organization_id', orgId)
      .lte('date', today)
      .neq('category', 'offsite')
      .range(from, to)
      .order('date', { ascending: false })
    if (error) {
      console.error('[scenarios:all-stats] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    const rows = (data ?? []) as unknown as EventStatsRow[]
    allEvents.push(...rows)
    hasMore = rows.length === pageSize
    page++
  }

  const statsMap: Record<string, { performanceCount: number; cancelledCount: number; totalRevenue: number }> = {}
  for (const event of allEvents) {
    const sid = event.scenario_master_id
    if (!sid) continue
    if (!statsMap[sid]) {
      statsMap[sid] = { performanceCount: 0, cancelledCount: 0, totalRevenue: 0 }
    }
    if (event.is_cancelled) {
      statsMap[sid].cancelledCount++
    } else {
      statsMap[sid].performanceCount++
      statsMap[sid].totalRevenue += event.total_revenue ?? 0
    }
  }

  return res.status(200).json(statsMap)
}
