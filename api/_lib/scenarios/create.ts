// api/scenarios.ts の POST（作成）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SELECT_FIELDS, db } from './common.js'

// ─── POST: create ────────────────────────────────────────────────────────────
export async function routePost(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const scenario = (body.scenario ?? body) as Record<string, unknown>
  if (!scenario || typeof scenario !== 'object') {
    return res.status(400).json({ error: 'scenario が必要です' })
  }
  const title = scenario.title as string | undefined
  if (!title) {
    return res.status(400).json({ error: 'title が必要です' })
  }

  // STEP 1: scenario_masters に追加（submitted_by_organization_id は JWT 由来の orgId）
  const masterPayload = {
    title,
    author: (scenario.author as string | null) ?? null,
    author_email: (scenario.author_email as string | null) ?? null,
    description: (scenario.description as string | null) ?? null,
    synopsis: (scenario.synopsis as string | null) ?? null,
    player_count_min: (scenario.player_count_min as number | null) ?? 4,
    player_count_max: (scenario.player_count_max as number | null) ?? 6,
    official_duration: (scenario.duration as number | null) ?? 180,
    weekend_duration: (scenario.weekend_duration as number | null) ?? null,
    genre: (scenario.genre as unknown[] | null) ?? [],
    difficulty: scenario.difficulty !== undefined && scenario.difficulty !== null
      ? String(scenario.difficulty)
      : null,
    key_visual_url: (scenario.key_visual_url as string | null) ?? null,
    has_pre_reading: (scenario.has_pre_reading as boolean | null) ?? false,
    release_date: (scenario.release_date as string | null) ?? null,
    official_site_url: (scenario.official_site_url as string | null) ?? null,
    master_status: 'draft',
    submitted_by_organization_id: orgId,
  }

  const { data: masterData, error: masterError } = await db
    .from('scenario_masters')
    .insert(masterPayload)
    .select('id')
    .single()

  if (masterError || !masterData) {
    console.error('[scenarios:create] scenario_masters insert error:', masterError)
    return res.status(500).json({
      error: 'シナリオマスター作成に失敗しました',
      detail: masterError?.message,
    })
  }

  const scenarioMasterId = masterData.id as string

  // STEP 2: organization_scenarios に追加
  const orgStatus = scenario.status === 'available' ? 'available' : 'unavailable'
  const orgScenarioPayload = {
    organization_id: orgId, // ← JWT 由来。クライアント引数は無視
    scenario_master_id: scenarioMasterId,
    slug: (scenario.slug as string | null) ?? null,
    duration: (scenario.duration as number | null) ?? null,
    participation_fee: (scenario.participation_fee as number | null) ?? null,
    gm_test_participation_fee: (scenario.gm_test_participation_fee as number | null) ?? null,
    extra_preparation_time: (scenario.extra_preparation_time as number | null) ?? null,
    org_status: orgStatus,
    license_amount: (scenario.license_amount as number | null) ?? null,
    gm_test_license_amount: (scenario.gm_test_license_amount as number | null) ?? null,
    is_license_buyout: scenario.is_license_buyout === true,
    franchise_license_amount: (scenario.franchise_license_amount as number | null) ?? null,
    franchise_gm_test_license_amount: (scenario.franchise_gm_test_license_amount as number | null) ?? null,
    gm_count: (scenario.gm_count as number | null) ?? null,
    gm_costs: (scenario.gm_costs as unknown[] | null) ?? [],
    gm_assignments: (scenario.gm_assignments as unknown) ?? null,
    available_gms: (scenario.available_gms as unknown[] | null) ?? [],
    experienced_staff: (scenario.experienced_staff as unknown[] | null) ?? [],
    available_stores: (scenario.available_stores as unknown[] | null) ?? [],
    production_cost: (scenario.production_cost as number | null) ?? null,
    production_costs: (scenario.production_costs as unknown[] | null) ?? [],
    depreciation_per_performance: (scenario.depreciation_per_performance as number | null) ?? null,
    play_count: (scenario.play_count as number | null) ?? 0,
    notes: (scenario.notes as string | null) ?? null,
    // 貸切受付枠（平日・土日祝は別々。未設定は全枠受付）
    private_booking_time_slots: (scenario.private_booking_time_slots as string[] | null) ?? null,
    private_booking_time_slots_weekend: (scenario.private_booking_time_slots_weekend as string[] | null) ?? null,
  }

  const { error: orgScenarioError } = await db
    .from('organization_scenarios')
    .insert(orgScenarioPayload)
    .select('id')
    .single()

  if (orgScenarioError) {
    console.error('[scenarios:create] organization_scenarios insert error:', orgScenarioError)
    return res.status(500).json({
      error: 'シナリオ作成に失敗しました（マスターは作成済み）',
      detail: orgScenarioError.message,
    })
  }

  // 作成したデータをビューから取得
  const { data: createdScenario, error: fetchError } = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('id', scenarioMasterId)
    .eq('organization_id', orgId)
    .single()

  if (fetchError || !createdScenario) {
    console.error('[scenarios:create] fetch after insert error:', fetchError)
    return res.status(500).json({
      error: '作成後のシナリオ取得に失敗しました',
      detail: fetchError?.message,
    })
  }

  return res.status(201).json(createdScenario)
}
