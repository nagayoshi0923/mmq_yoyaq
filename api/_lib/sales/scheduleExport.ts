// api/sales.ts の 'handleScheduleExport' ハンドラを切り出したもの（整備 Phase 3、#774）。ロジックの変更なし。
import { calculateEventGmCost, resolveGmCostIdentity, type EventStaffAssignmentLike } from '../../../src/lib/compensation.js'
import { loadCompensationHistory } from '../compensationHistory.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { ApiError } from '../auth.js'
import { getParticipationFee, getLicenseAmount, SCENARIO_PRICING_COLUMNS, type ScenarioPricing } from '../../../src/lib/pricing.js'
import { getStartEnd } from '../sales/common.js'
import { getReservationRevenue, SALES_RESERVATION_STATUSES } from '../sales/revenue.js'

// ─── スケジュール CSV エクスポート (getScheduleExportData 相当) ─────────────
export async function handleScheduleExport(req: VercelRequest, res: VercelResponse, orgId: string) {
  const range = getStartEnd(req)
  if (!range) return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  const { start, end } = range

  const { data: events, error } = await db!
    .from('schedule_events')
    .select('id, date, start_time, end_time, store_id, venue, scenario, scenario_master_id, organization_scenario_id, category, gms, gm_roles, capacity, max_participants, venue_rental_fee, is_cancelled, organization_id, staff_assignments:schedule_event_staff_assignments(staff_id,staff_name,ordinal,resolution_status)')
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
  const { data: staffData, error: staffError } = await db!
    .from('staff')
    .select('id,name,stores')
    .eq('organization_id', orgId)
  if (staffError) throw staffError
  const staffNames = new Set((staffData as { name: string }[] | null | undefined)?.map(s => s.name) || [])

  const settingsForDate = await loadCompensationHistory(db!, orgId, start, end)

  const homeStores = new Map<string,string[]>((staffData ?? []).filter((staff: {stores: unknown}) => Array.isArray(staff.stores)).map((staff: {name: string; stores: string[]}) => [staff.name,staff.stores]))
  const staffById = new Map<string,{ stores: string[] | null }>((staffData ?? []).map((staff: {id: string; stores: string[] | null}) => [staff.id, { stores: staff.stores }]))

  // 店舗
  const { data: stores, error: storesError } = await db!
    .from('stores')
    .select('id, name, short_name, transport_allowance')
    .eq('organization_id', orgId)
  if (storesError) throw storesError
  const storeMap = new Map<string, { id: string; name: string; short_name: string | null; transport_allowance: number | null }>(
    (stores as Array<{ id: string; name: string; short_name: string | null; transport_allowance: number | null }> | null | undefined)?.map(s => [s.id, s]) || []
  )

  // ScenarioInfo は ScenarioPricing を継承し、id を必須にしただけ
  type ScenarioInfo = ScenarioPricing & { id: string; scenario_master_id?: string; title?: string; duration?: number | null }
  const { data: scenariosData, error: scenariosError } = await db!
    .from('organization_scenarios_with_master')
    .select(`id, scenario_master_id, title, duration, ${SCENARIO_PRICING_COLUMNS}`)
    .eq('organization_id', orgId)
  if (scenariosError) throw scenariosError
  const scenarioByMasterId = new Map<string, ScenarioInfo>(
    (scenariosData as ScenarioInfo[] | null | undefined)?.map(s => [s.scenario_master_id ?? s.id, s]) || []
  )

  const normalizeTitle = (title: string) => title.replace(/[\s\-・／/]/g, '').toLowerCase()
  const scenarioByTitle = new Map<string, ScenarioInfo | null>()
  for (const scenario of (scenariosData ?? []) as ScenarioInfo[]) {
    if (!scenario.title) continue
    const key = normalizeTitle(scenario.title)
    if (!scenarioByTitle.has(key)) scenarioByTitle.set(key, scenario)
    else if (scenarioByTitle.get(key)?.scenario_master_id !== scenario.scenario_master_id) scenarioByTitle.set(key, null)
  }

  type OrgScenarioOverride = ScenarioPricing & { id: string; scenario_master_id: string | null; duration: number | null }
  const { data: orgScenariosData, error: orgScenariosError } = await db!
    .from('organization_scenarios')
    .select('id, scenario_master_id, duration, gm_costs, license_amount, gm_test_license_amount, participation_fee, gm_test_participation_fee, participation_costs')
    .eq('organization_id', orgId)
  if (orgScenariosError) throw orgScenariosError
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
    staff_assignments?: EventStaffAssignmentLike[] | null
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
    reservation_source: string | null
    unit_price: number | null
    total_price: number | null
    final_price: number | null
    discount_amount: number | null
  }> = []

  for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
    const batchIds = eventIds.slice(i, i + BATCH_SIZE)
    const { data: batch } = await db!
      .from('reservations')
      .select('schedule_event_id, participant_count, participant_names, payment_method, reservation_source, unit_price, total_price, final_price, discount_amount')
      .eq('organization_id', orgId)
      .in('schedule_event_id', batchIds)
      .in('status', SALES_RESERVATION_STATUSES)

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
        scenarioInfo = scenarioByMasterId.get(override.scenario_master_id ?? '') ?? scenarioInfo
        scenarioInfo = {
          ...scenarioInfo,
          id: scenarioInfo?.id ?? '',
          duration: override.duration ?? scenarioInfo?.duration,
          gm_costs: ((override.gm_costs?.length ?? 0) > 0 ? override.gm_costs : scenarioInfo?.gm_costs) ?? null,
          license_amount: override.license_amount ?? scenarioInfo?.license_amount ?? null,
          gm_test_license_amount: override.gm_test_license_amount ?? scenarioInfo?.gm_test_license_amount ?? null,
          participation_fee: override.participation_fee ?? scenarioInfo?.participation_fee ?? null,
          gm_test_participation_fee: override.gm_test_participation_fee ?? scenarioInfo?.gm_test_participation_fee ?? null,
          participation_costs: ((override.participation_costs?.length ?? 0) > 0 ? override.participation_costs : scenarioInfo?.participation_costs) ?? null,
        }
      }
    }

    if (!scenarioInfo && event.scenario) scenarioInfo = scenarioByTitle.get(normalizeTitle(event.scenario)) ?? null
    if (!isVenueRental && !event.is_cancelled && !scenarioInfo && (event.gms ?? []).some(name =>
      !['staff', 'observer', 'reception'].includes(event.gm_roles?.[name] ?? 'main'))) {
      throw new ApiError(422, `${event.date} ${event.scenario ?? ''} の作品設定を特定できないため、公演CSVを出力できません。公演のシナリオを設定してください。`)
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

    // GM の照合は担当表（ID）を正にする（#734）。表示名は従来どおり gms を使う。
    const gmCost = isVenueRental ? 0 : calculateEventGmCost({
      ...resolveGmCostIdentity(event, staffById, homeStores), duration: scenarioInfo?.duration ?? 180,
      isGmTest, costs: scenarioInfo?.gm_costs ?? [], getSettings: () => settingsForDate(event.date),
      storeId: event.store_id ?? '', transportAllowance: store?.transport_allowance,
      isCancelled: Boolean(event.is_cancelled), estimateUnassigned: Boolean(scenarioInfo),
    })

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
          const price = getReservationRevenue(r, count, unitFee)
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
