import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'
import { getParticipationFee, SCENARIO_PRICING_COLUMNS, type ScenarioPricing } from '../src/lib/pricing.js'

const EVENT_FIELDS = 'id, date, start_time, end_time, scenario, venue, store_id, gms, category, status, is_cancelled, capacity, max_participants, current_participants, total_revenue, organization_id, notes, scenario_master_id, organization_scenario_id'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!db || getMissingEnvError()) return res.status(500).json({ error: 'サーバー環境変数が未設定です' })
  try {
    const user = await requireAuth(req)
    requireStaff(user)
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
  const customerMap = new Map((customers ?? []).map((c: any) => [c.id, c]))
  const { data: staff, error: staffError } = await database.from('staff').select('id, name, role, stores, organization_id').eq('organization_id', user.orgId).eq('status', 'active').order('name')
  if (staffError) throw staffError
  const staffIds = (staff ?? []).map((s: any) => s.id)
  const { data: checkins, error: checkinError } = staffIds.length ? await database.from('staff_checkins').select('id, staff_id, store_id, checked_in_at, checked_out_at').eq('organization_id', user.orgId).eq('store_id', selectedStoreId).gte('checked_in_at', `${today}T00:00:00+09:00`).lt('checked_in_at', `${today}T23:59:59+09:00`).in('staff_id', staffIds) : { data: [], error: null }
  if (checkinError) throw checkinError
  const checkinMap = new Map((checkins ?? []).map((c: any) => [c.staff_id, c]))
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
      assigned_staff: (event.gms ?? []).map((name: string) => (staff ?? []).find((s: any) => s.name === name || s.display_name === name)).filter(Boolean),
    }
  })
  const assignedStaffIds = new Set(eventRows.flatMap((event: any) => event.assigned_staff.map((s: any) => s.id)))
  const gmStatus = (staff ?? []).filter((s: any) => assignedStaffIds.has(s.id)).map((s: any) => ({ ...s, checkin: checkinMap.get(s.id) ?? null }))
  const promptStaff = gmStatus.find((s: any) => s.checkin && !s.checkin.checked_out_at) ?? gmStatus.find((s: any) => !s.checkin)
  const promptEvent = promptStaff ? eventRows.find((event: any) => event.assigned_staff.some((s: any) => s.id === promptStaff.id)) : null
  return res.status(200).json({ date: today, stores, selected_store_id: selectedStoreId, events: eventRows, gm_status: gmStatus, prompt: promptStaff && promptEvent ? { staff_id: promptStaff.id, staff_name: promptStaff.display_name || promptStaff.name, event_id: promptEvent.id, scenario: promptEvent.scenario, start_time: promptEvent.start_time, store_name: stores?.find((s: any) => s.id === selectedStoreId)?.name ?? '' } : null })
}

async function postAction(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const database = db as any
  const body = (req.body ?? {}) as Record<string, unknown>
  const action = body.action
  if (action === 'customer_checkin') {
    if (typeof body.reservation_id !== 'string') return res.status(400).json({ error: 'reservation_id が必要です' })
    const { data, error } = await database.from('reservations').update({ status: 'checked_in', actual_datetime: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.reservation_id).eq('organization_id', user.orgId).select('id, status').maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: '予約が見つかりません' })
    return res.status(200).json(data)
  }
  if (action !== 'staff_checkin' && action !== 'staff_checkout') return res.status(400).json({ error: 'action が不正です' })
  if (typeof body.staff_id !== 'string' || typeof body.store_id !== 'string') return res.status(400).json({ error: 'staff_id と store_id が必要です' })
  const { data: staff } = await database.from('staff').select('id').eq('id', body.staff_id).eq('organization_id', user.orgId).maybeSingle()
  const { data: store } = await database.from('stores').select('id').eq('id', body.store_id).eq('organization_id', user.orgId).maybeSingle()
  if (!staff || !store) return res.status(403).json({ error: '対象が組織に属していません' })
  if (action === 'staff_checkin') {
    const checkedInAt = new Date().toISOString()
    const { data, error } = await database.from('staff_checkins').insert({ staff_id: body.staff_id, store_id: body.store_id, organization_id: user.orgId, checked_in_at: checkedInAt }).select().single()
    if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'すでに出勤打刻済みです' : '出勤打刻に失敗しました' })
    return res.status(201).json(data)
  }
  const { data, error } = await database.from('staff_checkins').update({ checked_out_at: new Date().toISOString() }).eq('staff_id', body.staff_id).eq('store_id', body.store_id).eq('organization_id', user.orgId).is('checked_out_at', null).select().maybeSingle()
  if (error) throw error
  if (!data) return res.status(404).json({ error: '出勤中の打刻が見つかりません' })
  return res.status(200).json(data)
}
