// api/scenarios.ts の統計（stats / all-stats）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import { calculateEventGmCost, resolveGmCostIdentity, type EventStaffAssignmentLike, type IndividualGmCost } from '../../../src/lib/compensation.js'
import { loadCompensationHistory } from '../compensationHistory.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getParticipationFee, getLicenseAmount, type ScenarioPricing } from '../../../src/lib/pricing.js'
import { SALES_RESERVATION_STATUSES } from '../sales/revenue.js'
import { DEMO_RESERVATION_SOURCES, STAFF_RESERVATION_SOURCES, STATS_ALL_SCHEDULE_EVENT_FIELDS, STATS_FUTURE_RESERVATION_FIELDS, STATS_RESERVATION_FIELDS, STATS_SCENARIO_FIELDS, STATS_SCHEDULE_EVENT_COUNT_FIELDS, STATS_SCHEDULE_EVENT_DETAIL_FIELDS, STATS_UPCOMING_EVENT_FIELDS, UPCOMING_RESERVATION_STATUSES, db } from './common.js'

export async function handleGetScenarioStats(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })
  const scenarioId = req.query.scenarioId as string | undefined
  if (!scenarioId) {
    return res.status(400).json({ error: 'scenarioId が必要です' })
  }
  const today = new Date().toISOString().split('T')[0]

  // 互いに依存しない読み取りは同時に始める（関数は米国東部・DB は東京で、1 往復ごとに待ちが積み重なるため）。
  // ── シナリオの料金・GM報酬等のメタ情報（自組織）／公演回数・中止数・初公演日・公演イベント詳細・将来分・これからの公演 ──
  const [
    { data: _scenarioRaw, error: scenarioError },
    { count: performanceCount, error: perfError },
    { count: cancelledCount, error: cancelError },
    { data: firstEvent, error: firstError },
    { data: events, error: eventsError },
    { count: futurePerformanceCount },
    { count: futureReservationCount },
    { data: upcomingRaw, error: upcomingError },
  ] = await Promise.all([
    db
      .from('organization_scenarios_with_master')
      .select(STATS_SCENARIO_FIELDS)
      .eq('id', scenarioId)
      .eq('organization_id', orgId)
      .maybeSingle(),
    db
      .from('schedule_events')
      .select(STATS_SCHEDULE_EVENT_COUNT_FIELDS, { count: 'exact', head: true })
      .eq('scenario_master_id', scenarioId)
      .eq('organization_id', orgId)
      .lte('date', today)
      .neq('category', 'offsite')
      .neq('is_cancelled', true),
    db
      .from('schedule_events')
      .select(STATS_SCHEDULE_EVENT_COUNT_FIELDS, { count: 'exact', head: true })
      .eq('scenario_master_id', scenarioId)
      .eq('organization_id', orgId)
      .lte('date', today)
      .neq('category', 'offsite')
      .eq('is_cancelled', true),
    db
      .from('schedule_events')
      .select('date')
      .eq('scenario_master_id', scenarioId)
      .eq('organization_id', orgId)
      .lte('date', today)
      .neq('category', 'offsite')
      .neq('is_cancelled', true)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    db
      .from('schedule_events')
      .select(STATS_SCHEDULE_EVENT_DETAIL_FIELDS)
      .eq('scenario_master_id', scenarioId)
      .eq('organization_id', orgId)
      .lte('date', today)
      .order('date', { ascending: false }),
    db
      .from('schedule_events')
      .select(STATS_SCHEDULE_EVENT_COUNT_FIELDS, { count: 'exact', head: true })
      .eq('scenario_master_id', scenarioId)
      .eq('organization_id', orgId)
      .gt('date', today)
      .neq('category', 'offsite')
      .neq('is_cancelled', true),
    db
      .from('reservations')
      .select(STATS_FUTURE_RESERVATION_FIELDS, { count: 'exact', head: true })
      .eq('scenario_master_id', scenarioId)
      .eq('organization_id', orgId)
      .is('schedule_event_id', null)
      .in('status', ['confirmed', 'gm_confirmed', 'pending']),
    // これからの公演と予約数（明日以降・出張以外・中止以外）
    db
      .from('schedule_events')
      .select(STATS_UPCOMING_EVENT_FIELDS)
      .eq('scenario_master_id', scenarioId)
      .eq('organization_id', orgId)
      .gt('date', today)
      .neq('category', 'offsite')
      .neq('is_cancelled', true)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true }),
  ])
  if (scenarioError) throw scenarioError
  if (!_scenarioRaw) return res.status(404).json({ error: 'シナリオが見つかりません' })
  if (perfError) throw perfError
  if (cancelError) throw cancelError
  if (eventsError) throw eventsError
  if (upcomingError) throw upcomingError

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
  const pricing = scenarioData as ScenarioPricing | null
  const normalLicenseAmount = getLicenseAmount(pricing, 'normal')
  const gmTestLicenseAmount = getLicenseAmount(pricing, 'gmtest')
  const normalParticipationFee = getParticipationFee(pricing, 'normal')
  const gmTestParticipationFee = getParticipationFee(pricing, 'gmtest')
  const firstPerformanceDate = firstError ? null : (firstEvent?.date as string | null) ?? null

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
  type UpcomingRow = {
    id: string
    date: string
    category: string | null
    start_time: string | null
    store_id: string | null
    current_participants: number | null
    max_participants: number | null
    capacity: number | null
  }
  type ResRow = {
    schedule_event_id: string | null
    participant_count: number | null
    reservation_source: string | null
    payment_method: string | null
  }
  const eventList = (events ?? []) as unknown as EventRow[]
  const upcomingList = (upcomingRaw ?? []) as unknown as UpcomingRow[]
  const unrecordedEvents = eventList.filter(event => event.gm_cost === null && !event.is_cancelled)
  const dates = unrecordedEvents.map(event => event.date).sort()
  const eventIds = eventList.map((e) => e.id)
  const upcomingIds = upcomingList.map(e => e.id)
  const BATCH_SIZE = 100
  const batches = (ids: string[]) => {
    const out: string[][] = []
    for (let i = 0; i < ids.length; i += BATCH_SIZE) out.push(ids.slice(i, i + BATCH_SIZE))
    return out
  }

  // ── 2 段目: 報酬履歴・スタッフ・過去公演の予約・これからの公演の予約（いずれも 1 段目の結果だけに依存） ──
  const [settingsForDate, staffResult, pastReservationBatches, upcomingReservationBatches] = await Promise.all([
    dates.length ? loadCompensationHistory(db, orgId, dates[0], dates.at(-1)!) : Promise.resolve(null),
    dates.length
      ? db.from('staff').select('id,name,stores').eq('organization_id', orgId)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; stores: unknown }>, error: null }),
    Promise.all(batches(eventIds).map(batchIds => db!
      .from('reservations')
      .select(STATS_RESERVATION_FIELDS)
      .eq('organization_id', orgId)
      .in('schedule_event_id', batchIds)
      // 来店済み（checked_in）も参加者に数える。売上側と同じ規則（#787）
      .in('status', SALES_RESERVATION_STATUSES))),
    Promise.all(batches(upcomingIds).map(batchIds => db!
      .from('reservations')
      .select(STATS_RESERVATION_FIELDS)
      .eq('organization_id', orgId)
      .in('schedule_event_id', batchIds)
      // 席を押さえている予約（定員計算と同じ。仮予約 pending を含む）
      .in('status', UPCOMING_RESERVATION_STATUSES))),
  ])
  const { data: staff, error: staffError } = staffResult
  if (staffError) throw staffError
  const homeStores = new Map<string,string[]>((staff ?? []).filter(person => Array.isArray(person.stores)).map(person => [person.name, person.stores as string[]]))
  const staffById = new Map<string,{ stores: string[] | null }>((staff ?? []).map(person => [person.id, { stores: (person.stores as string[] | null) ?? null }]))
  const demoParticipantsMap: Record<string, number> = {}
  const actualParticipantsMap: Record<string, number> = {}
  const staffParticipantsMap: Record<string, number> = {}

  // 過去公演の予約は、取得に失敗したバッチを飛ばす（従来どおり）
  const allReservations: ResRow[] = []
  for (const { data, error: resError } of pastReservationBatches) {
    if (!resError && data) allReservations.push(...(data as unknown as ResRow[]))
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

  const upcomingReserved: Record<string, { participants: number; staff: number; reservations: number }> = {}
  for (const { data, error: upResError } of upcomingReservationBatches) {
    if (upResError) throw upResError
    for (const r of (data ?? []) as unknown as ResRow[]) {
      if (!r.schedule_event_id) continue
      const entry = upcomingReserved[r.schedule_event_id] ?? (upcomingReserved[r.schedule_event_id] = { participants: 0, staff: 0, reservations: 0 })
      const count = r.participant_count ?? 0
      if (STAFF_RESERVATION_SOURCES.has(r.reservation_source ?? '') || r.payment_method === 'staff') {
        entry.staff += count
      } else {
        entry.participants += count
        entry.reservations += 1
      }
    }
  }
  const upcomingPerformances = upcomingList.map(event => {
    const reserved = upcomingReserved[event.id]
    return {
      date: event.date,
      category: event.category ?? 'open',
      startTime: event.start_time ?? '',
      storeId: event.store_id ?? null,
      reservedParticipants: reserved ? reserved.participants : (event.current_participants ?? 0),
      staffParticipants: reserved?.staff ?? 0,
      reservationCount: reserved?.reservations ?? 0,
      // 予約受付（COALESCE(max_participants, capacity, …)）と同じ順で定員を決める
      maxParticipants: event.max_participants ?? event.capacity ?? scenarioData?.player_count_max ?? null,
    }
  })

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
    upcomingPerformances,
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
