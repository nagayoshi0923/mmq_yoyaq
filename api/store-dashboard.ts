import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'
import { getParticipationFee, SCENARIO_PRICING_COLUMNS, type ScenarioPricing } from '../src/lib/pricing.js'

const EVENT_FIELDS = 'id, date, start_time, end_time, scenario, venue, store_id, gms, category, status, is_cancelled, capacity, max_participants, current_participants, total_revenue, organization_id, notes, scenario_master_id, organization_scenario_id'

interface DashboardStaff {
  id: string
  name?: string | null
  display_name?: string | null
  organization_id?: string | null
  [key: string]: unknown
}

export function resolveEventGmStaff(eventGms: unknown, staff: DashboardStaff[], organizationId: string, eventId: string) {
  const names = Array.isArray(eventGms)
    ? eventGms.filter((name): name is string => typeof name === 'string' && name.trim().length > 0).map(name => name.trim())
    : []
  return names.map((name, index) => staff.find(member => member.name === name || member.display_name === name) ?? {
    id: `event-gm:${eventId}:${index}`,
    name,
    display_name: name,
    organization_id: organizationId,
  })
}

export interface StaffCheckinRecord {
  id: string
  checked_in_at: string
}

export interface StaffCheckinPerformance {
  start_time: string
  scenario: string
  store_name: string
}

export interface StaffCheckinContext {
  staff_name?: string
  performance?: StaffCheckinPerformance
}

export interface StaffCheckinScheduledCandidate {
  staff: DashboardStaff
  performance?: StaffCheckinPerformance
  checkin: StaffCheckinRecord | null
}

interface StaffCheckinActor {
  organizationId: string
  storeId: string
}

interface StaffCheckinIdentity {
  staffId: string
  organizationId: string
}

export interface StaffCheckinRepository {
  isStoreRepresentative: (userId: string, organizationId: string) => Promise<boolean>
  storeBelongsToOrganization: (storeId: string, organizationId: string) => Promise<boolean>
  findScheduledCandidates: (organizationId: string, storeId: string, date: string, start: string, end: string) => Promise<StaffCheckinScheduledCandidate[]>
  insert: (values: { staff_id: string; store_id: string; organization_id: string }) => Promise<StaffCheckinRecord>
  deleteToday: (identity: StaffCheckinIdentity, checkinId: string, start: string, end: string) => Promise<StaffCheckinRecord | null>
}

export function getJstDayBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const year = Number(values.year)
  const month = Number(values.month)
  const day = Number(values.day)
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1))
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const nextDate = `${String(nextDay.getUTCFullYear()).padStart(4, '0')}-${String(nextDay.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDay.getUTCDate()).padStart(2, '0')}`
  return {
    start: `${date}T00:00:00+09:00`,
    end: `${nextDate}T00:00:00+09:00`,
  }
}

export function createStaffCheckinService(repository: StaffCheckinRepository, now: () => Date = () => new Date()) {
  const resolveActor = async (user: AuthUser, storeId: string): Promise<StaffCheckinActor> => {
    const [isRepresentative, storeIsValid] = await Promise.all([
      repository.isStoreRepresentative(user.userId, user.orgId),
      repository.storeBelongsToOrganization(storeId, user.orgId),
    ])
    if (!isRepresentative) throw new ApiError(403, '店舗代表アカウントだけが出勤打刻を利用できます')
    if (!storeIsValid) throw new ApiError(403, '選択した店舗を利用できません')
    return { organizationId: user.orgId, storeId }
  }

  const resolveCandidates = async (user: AuthUser, storeId: string) => {
    const actor = await resolveActor(user, storeId)
    const bounds = getJstDayBounds(now())
    return {
      actor,
      candidates: await repository.findScheduledCandidates(
        actor.organizationId,
        actor.storeId,
        bounds.start.slice(0, 10),
        bounds.start,
        bounds.end,
      ),
    }
  }

  const getState = async (user: AuthUser, storeId: string) => {
    const { candidates } = await resolveCandidates(user, storeId)
    if (candidates.length === 0) return { available: false as const }
    const target = candidates.find(candidate => !candidate.checkin) ?? candidates[0]
    return {
      available: true as const,
      my_checkin: target.checkin ? { checked_in_at: target.checkin.checked_in_at } : null,
      ...toStaffCheckinContext(target),
    }
  }

  const checkIn = async (user: AuthUser, storeId: string) => {
    const { actor, candidates } = await resolveCandidates(user, storeId)
    const target = candidates.find(candidate => !candidate.checkin)
    if (!target) {
      throw new ApiError(409, '本日の出勤打刻はすでに記録されています')
    }
    try {
      return await repository.insert({
        staff_id: target.staff.id,
        store_id: actor.storeId,
        organization_id: actor.organizationId,
      })
    } catch (error) {
      if (isDatabaseErrorCode(error, '23505')) throw new ApiError(409, '本日の出勤打刻はすでに記録されています')
      throw error
    }
  }

  const cancel = async (user: AuthUser, storeId: string) => {
    const { actor, candidates } = await resolveCandidates(user, storeId)
    const bounds = getJstDayBounds(now())
    const target = candidates.find(candidate => candidate.checkin)
    if (!target?.checkin) throw new ApiError(404, '本日の出勤打刻が見つかりません')
    const deleted = await repository.deleteToday(
      { staffId: target.staff.id, organizationId: actor.organizationId },
      target.checkin.id,
      bounds.start,
      bounds.end,
    )
    if (!deleted) throw new ApiError(404, '本日の自分の出勤打刻が見つかりません')
    return { cancelled: true as const }
  }

  return { getState, checkIn, cancel }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!db || getMissingEnvError()) return res.status(500).json({ error: 'サーバー環境変数が未設定です' })
  try {
    const user = await requireAuth(req)
    requireStaff(user)
    if (req.method === 'GET' && req.query.resource === 'staff_checkin') return await getStaffCheckin(req, res, user)
    if (req.method === 'GET') return await getDashboard(req, res, user)
    if (req.method === 'POST') return await postAction(req, res, user)
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message })
    console.error('[store-dashboard]', error)
    return res.status(500).json({ error: '店舗ダッシュボードの取得に失敗しました' })
  }
}

async function getDashboard(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const database = db as any
  const today = typeof req.query.date === 'string' ? req.query.date : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  const storeId = typeof req.query.store_id === 'string' ? req.query.store_id : undefined
  const { data: stores, error: storesError } = await database.from('stores').select('id, name, short_name, notes, organization_id').eq('organization_id', user.orgId).eq('status', 'active').order('display_order', { ascending: true, nullsFirst: false })
  if (storesError) throw storesError
  const validStoreIds = new Set((stores ?? []).map((s: any) => s.id))
  const selectedStoreId = storeId && validStoreIds.has(storeId) ? storeId : (stores?.[0]?.id ?? null)

  let eventQuery = database.from('schedule_events').select(EVENT_FIELDS).eq('organization_id', user.orgId).eq('date', today).order('start_time')
  if (selectedStoreId) eventQuery = eventQuery.eq('store_id', selectedStoreId)
  const { data: events, error: eventError } = await eventQuery
  if (eventError) throw eventError
  const { data: scenarios, error: scenarioError } = await database
    .from('organization_scenarios_with_master')
    .select(`id, org_scenario_id, scenario_master_id, title, ${SCENARIO_PRICING_COLUMNS}`)
    .eq('organization_id', user.orgId)
  if (scenarioError) throw scenarioError
  const eventIds = (events ?? []).map((event: any) => event.id)
  const { data: reservations, error: reservationError } = eventIds.length
    ? await database.from('reservations').select('id, schedule_event_id, customer_id, customer_name, customer_email, customer_phone, participant_count, status, final_price, total_price').eq('organization_id', user.orgId).in('schedule_event_id', eventIds).not('status', 'in', '(cancelled,rejected)')
    : { data: [], error: null }
  if (reservationError) throw reservationError

  const customerIds = (reservations ?? []).map((r: any) => r.customer_id).filter(Boolean)
  const { data: customers } = customerIds.length ? await database.from('customers').select('id, name, email, phone, visit_count').eq('organization_id', user.orgId).in('id', customerIds) : { data: [] }
  const { data: coupons } = customerIds.length ? await database.from('customer_coupons').select('customer_id').in('customer_id', customerIds).eq('status', 'active').gt('uses_remaining', 0) : { data: [] }
  const couponCounts = new Map<string, number>()
  for (const coupon of coupons ?? []) couponCounts.set(coupon.customer_id, (couponCounts.get(coupon.customer_id) ?? 0) + 1)
  const customerMap = new Map<string, any>((customers ?? []).map((c: any) => [c.id, c]))
  const { data: staff, error: staffError } = await database.from('staff').select('id, name, role, stores, organization_id').eq('organization_id', user.orgId).eq('status', 'active').order('name')
  if (staffError) throw staffError
  const reservationsByEvent = new Map<string, any[]>()
  for (const reservation of reservations ?? []) {
    const customer = reservation.customer_id ? customerMap.get(reservation.customer_id) : null
    const customerId = reservation.customer_id ?? ''
    const row = { ...reservation, customer_name: customer?.name ?? reservation.customer_name ?? '顧客名未登録', customer_email: customer?.email ?? reservation.customer_email ?? '', customer_phone: customer?.phone ?? reservation.customer_phone ?? '', visit_count: customer?.visit_count ?? 0, coupon_count: couponCounts.get(customerId) ?? 0 }
    const list = reservationsByEvent.get(reservation.schedule_event_id) ?? []
    list.push(row)
    reservationsByEvent.set(reservation.schedule_event_id, list)
  }
  const scenarioById = new Map<string, ScenarioPricing & { id?: string; org_scenario_id?: string; scenario_master_id?: string; title?: string }>()
  const scenarioByTitle = new Map<string, ScenarioPricing & { id?: string; org_scenario_id?: string; scenario_master_id?: string; title?: string }>()
  for (const scenario of scenarios ?? []) {
    const pricing = scenario as ScenarioPricing & { id?: string; org_scenario_id?: string; scenario_master_id?: string; title?: string }
    if (pricing.id) scenarioById.set(pricing.id, pricing)
    if (pricing.org_scenario_id) scenarioById.set(pricing.org_scenario_id, pricing)
    if (pricing.scenario_master_id) scenarioById.set(pricing.scenario_master_id, pricing)
    if (pricing.title) scenarioByTitle.set(pricing.title, pricing)
  }
  const eventRows = (events ?? []).map((event: any) => {
    const scenario = (event.organization_scenario_id && scenarioById.get(event.organization_scenario_id))
      ?? (event.scenario_master_id && scenarioById.get(event.scenario_master_id))
      ?? (event.scenario && scenarioByTitle.get(event.scenario))
    const category = event.category === 'gmtest' ? 'gmtest' : 'normal'
    const participationFee = Number(getParticipationFee(scenario, category))
    return {
      ...event,
      participation_fee: Number.isFinite(participationFee) ? participationFee : 0,
      reservations: reservationsByEvent.get(event.id) ?? [],
      assigned_staff: resolveEventGmStaff(event.gms, staff ?? [], user.orgId, event.id),
    }
  })
  const gmStatus = Array.from(new Map(
    eventRows
      .flatMap((event: any) => event.assigned_staff)
      .map((member: DashboardStaff) => [member.display_name || member.name, member] as const),
  ).values())
  return res.status(200).json({ date: today, stores, selected_store_id: selectedStoreId, events: eventRows, gm_status: gmStatus })
}

async function postAction(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const database = db as any
  const body = (req.body ?? {}) as Record<string, unknown>
  const action = body.action
  if (action === 'staff_checkin' || action === 'staff_checkin_cancel') {
    if ('staff_id' in body || 'checked_in_at' in body) return res.status(400).json({ error: '本人と打刻時刻はサーバーで決定します' })
    const service = createStaffCheckinService(createStaffCheckinRepository(database))
    if (typeof body.store_id !== 'string' || !body.store_id) return res.status(400).json({ error: 'store_id が必要です' })
    const result = action === 'staff_checkin'
      ? await service.checkIn(user, body.store_id as string)
      : await service.cancel(user, body.store_id as string)
    return res.status(action === 'staff_checkin' ? 201 : 200).json(result)
  }
  if (action === 'customer_checkin') {
    if (typeof body.reservation_id !== 'string') return res.status(400).json({ error: 'reservation_id が必要です' })
    const { data, error } = await database.from('reservations').update({ status: 'checked_in', actual_datetime: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.reservation_id).eq('organization_id', user.orgId).select('id, status').maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: '予約が見つかりません' })
    return res.status(200).json(data)
  }
  return res.status(400).json({ error: 'action が不正です' })
}

async function getStaffCheckin(_req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const service = createStaffCheckinService(createStaffCheckinRepository(db as any))
  const storeId = typeof _req.query.store_id === 'string' ? _req.query.store_id : undefined
  if (!storeId) return res.status(200).json({ available: false })
  return res.status(200).json(await service.getState(user, storeId))
}

function createStaffCheckinRepository(database: any): StaffCheckinRepository {
  return {
    async isStoreRepresentative(userId, organizationId) {
      const { data, error } = await database
        .from('users')
        .select('id, is_store_representative')
        .eq('id', userId)
        .eq('organization_id', organizationId)
        .eq('is_store_representative', true)
        .maybeSingle()
      if (error) throw error
      return data?.is_store_representative === true
    },
    async storeBelongsToOrganization(storeId, organizationId) {
      const { data, error } = await database
        .from('stores')
        .select('id')
        .eq('id', storeId)
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
    async findScheduledCandidates(organizationId, storeId, date, start, end) {
      const [{ data: events, error: eventError }, { data: store, error: storeError }, { data: staff, error: staffError }] = await Promise.all([
        database.from('schedule_events')
          .select('start_time, scenario, gms, status, is_cancelled')
          .eq('organization_id', organizationId)
          .eq('store_id', storeId)
          .eq('date', date)
          .order('start_time'),
        database.from('stores')
          .select('id, name')
          .eq('id', storeId)
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .maybeSingle(),
        database.from('staff')
          .select('id, name, organization_id')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('name'),
      ])
      if (eventError) throw eventError
      if (storeError) throw storeError
      if (staffError) throw staffError

      const staffIds = (staff ?? []).map((member: DashboardStaff) => member.id)
      const { data: checkins, error: checkinError } = staffIds.length
        ? await database.from('staff_checkins')
          .select('id, staff_id, checked_in_at')
          .eq('organization_id', organizationId)
          .gte('checked_in_at', start)
          .lt('checked_in_at', end)
          .in('staff_id', staffIds)
          .order('checked_in_at', { ascending: false })
        : { data: [], error: null }
      if (checkinError) throw checkinError
      return resolveStaffCheckinCandidates(staff ?? [], events, checkins, store?.name)
    },
    async insert(values) {
      const { data, error } = await database
        .from('staff_checkins')
        .insert(values)
        .select('id, checked_in_at')
        .single()
      if (error) throw error
      return data as StaffCheckinRecord
    },
    async deleteToday(identity, checkinId, start, end) {
      const { data, error } = await database
        .from('staff_checkins')
        .delete()
        .eq('id', checkinId)
        .eq('staff_id', identity.staffId)
        .eq('organization_id', identity.organizationId)
        .gte('checked_in_at', start)
        .lt('checked_in_at', end)
        .select('id, checked_in_at')
        .maybeSingle()
      if (error) throw error
      return data as StaffCheckinRecord | null
    },
  }
}

function isDatabaseErrorCode(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code
}

export async function loadStaffCheckinContext(database: any, user: AuthUser, storeId?: string): Promise<StaffCheckinContext> {
  if (!storeId) return {}
  const service = createStaffCheckinService(createStaffCheckinRepository(database))
  const state = await service.getState(user, storeId)
  if (state.available === false || !state.staff_name) return {}
  return {
    staff_name: state.staff_name,
    ...(state.performance ? { performance: state.performance } : {}),
  }
}

export function resolveStaffCheckinCandidates(
  staff: DashboardStaff[],
  events: unknown,
  checkins: unknown,
  storeName: unknown,
): StaffCheckinScheduledCandidate[] {
  if (!Array.isArray(events)) return []
  const checkinByStaffId = new Map<string, StaffCheckinRecord>()
  if (Array.isArray(checkins)) {
    for (const value of checkins) {
      if (!isRecord(value) || !isNonEmptyString(value.staff_id) || !isNonEmptyString(value.id) || !isNonEmptyString(value.checked_in_at)) continue
      if (!checkinByStaffId.has(value.staff_id)) {
        checkinByStaffId.set(value.staff_id, {
          id: value.id,
          checked_in_at: value.checked_in_at,
        })
      }
    }
  }

  const store = typeof storeName === 'string' && storeName.trim() ? storeName.trim() : undefined
  const result: StaffCheckinScheduledCandidate[] = []
  const assignedStaffIds = new Set<string>()
  for (const event of events) {
    if (!isRecord(event) || event.is_cancelled === true || event.status === 'cancelled' || !Array.isArray(event.gms)) continue
    const performance = isNonEmptyString(event.start_time) && isNonEmptyString(event.scenario) && store
      ? { start_time: event.start_time.trim(), scenario: event.scenario.trim(), store_name: store }
      : undefined
    for (const rawName of event.gms) {
      if (!isNonEmptyString(rawName)) continue
      const name = rawName.trim()
      const member = staff.find(candidate => candidate.name?.trim() === name || candidate.display_name?.trim() === name)
      if (!member || assignedStaffIds.has(member.id)) continue
      assignedStaffIds.add(member.id)
      result.push({ staff: member, performance, checkin: checkinByStaffId.get(member.id) ?? null })
    }
  }
  return result
}

function toStaffCheckinContext(candidate: StaffCheckinScheduledCandidate): StaffCheckinContext {
  const staffName = firstNonEmptyString(candidate.staff.display_name, candidate.staff.name)
  return {
    ...(staffName ? { staff_name: staffName } : {}),
    ...(candidate.performance ? { performance: candidate.performance } : {}),
  }
}

function firstNonEmptyString(...values: unknown[]) {
  return values.find(isNonEmptyString)?.trim()
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
