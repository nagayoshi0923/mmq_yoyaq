// api/sales.ts の 'handleByPeriod' ハンドラを切り出したもの（整備 Phase 3、#774）。ロジックの変更なし。
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { getParticipationFee, SCENARIO_PRICING_COLUMNS, type ScenarioPricing } from '../../../src/lib/pricing.js'
import { getStartEnd, SCHEDULE_EVENT_SALES_SELECT_FIELDS } from '../sales/common.js'
import { getReservationRevenue, SALES_RESERVATION_STATUSES } from '../sales/revenue.js'
import type { ScheduleEvent, ScenarioForPeriod, OrgScenarioRow } from '../sales/types.js'

// ─── 期間別売上 (getSalesByPeriod 相当) ──────────────────────────────────────
export async function handleByPeriod(req: VercelRequest, res: VercelResponse, orgId: string) {
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
    .select(`id, title, author, duration, scenario_type, production_costs, required_props, ${SCENARIO_PRICING_COLUMNS}`)
    .eq('organization_id', orgId)

  if (scenariosError) {
    console.error('[sales] by-period scenarios error:', scenariosError)
  }

  // organization_scenarios 取得（組織固有 GM 報酬等）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgScenarios, error: orgScenariosError } = await (db as any)
    .from('organization_scenarios')
    .select(`id, scenario_master_id, ${SCENARIO_PRICING_COLUMNS}`)
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

  // シナリオマップ (id, title 両方)
  const scenarioMap = new Map<string, ScenarioForPeriod>()
  const scenarioByIdMap = new Map<string, ScenarioForPeriod>()
  ;(scenarios as ScenarioForPeriod[] | null | undefined)?.forEach(s => {
    scenarioMap.set(s.title, s)
    scenarioByIdMap.set(s.id, s)
  })

  // 予約をバッチで一括取得（N+1 防止: 以前はイベント1件ごとにクエリしていた）
  const eventList = events as ScheduleEvent[]
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch, error: batchError } = await (db as any)
      .from('reservations')
      .select('schedule_event_id, participant_count, participant_names, payment_method, reservation_source, unit_price, total_price, final_price, discount_amount')
      .eq('organization_id', orgId)
      .in('schedule_event_id', batchIds)
      .in('status', SALES_RESERVATION_STATUSES)
    if (batchError && batchError.code !== 'PGRST116') {
      console.warn('[sales] by-period reservation batch error:', batchError.message)
    } else if (batch) {
      allReservations.push(...batch)
    }
  }
  const reservationsByEvent = new Map<string, typeof allReservations>()
  allReservations.forEach(r => {
    const list = reservationsByEvent.get(r.schedule_event_id) || []
    list.push(r)
    reservationsByEvent.set(r.schedule_event_id, list)
  })

  // 各イベントを enrich（同期処理、DB クエリは行わない）
  const enriched = eventList.map((event) => {
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
    if (scenarioKey) {
      scenarioInfo = scenarioByIdMap.get(scenarioKey) ?? null
    }
    if (!scenarioInfo && event.scenario) {
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

    // 予約は事前にバッチ取得した reservationsByEvent から引く
    const reservations = reservationsByEvent.get(event.id) || []

    let totalParticipants = 0
    let totalRevenue = 0

    const isVenueRental = event.category === 'venue_rental' || event.category === 'venue_rental_free'
    if (isVenueRental) {
      totalRevenue = event.category === 'venue_rental_free' ? 0 : (event.venue_rental_fee || 12000)
    } else {
      reservations.forEach(r => {
        const participantCount = r.participant_count || 0
        totalParticipants += participantCount

        const participantNames = r.participant_names || []
        const hasStaffParticipant = participantNames.some((name: string) => staffNames.has(name))

        if (hasStaffParticipant || r.payment_method === 'staff') {
          totalRevenue += 0
        } else {
          const category = event.category === 'gmtest' ? 'gmtest' : 'normal'
          const unitFee = getParticipationFee(scenarioInfo as ScenarioPricing | null, category)
          totalRevenue += getReservationRevenue(r, participantCount, unitFee)
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
  })

  return res.status(200).json(enriched)
}
