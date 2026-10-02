// api/scenarios.ts の PATCH（更新・担当 GM 更新）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SELECT_FIELDS, db } from './common.js'

// ─── PATCH: update / updateAvailableGms / updateAvailableGmsWithSync ─────────
export async function routePatch(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const action = (req.query.action as string | undefined) ?? 'update'
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  if (action === 'update') return await handleUpdate(req, res, orgId, id)
  if (action === 'updateAvailableGms') return await handleUpdateAvailableGms(req, res, orgId, id)
  if (action === 'updateAvailableGmsWithSync') {
    return await handleUpdateAvailableGmsWithSync(req, res, orgId, id)
  }

  return res.status(400).json({ error: `unknown action: ${action}` })
}

// 自組織が対象 scenario_master_id の organization_scenarios 行を保有しているか確認し、
// その行 ID を返す。共有シナリオであっても、自組織がまだ取り込んでいなければ更新不可。
export async function ensureOwnedByOrg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
  orgId: string,
  scenarioMasterId: string,
): Promise<{ orgScenarioId: string } | null> {
  const { data } = await database
    .from('organization_scenarios')
    .select('id')
    .eq('scenario_master_id', scenarioMasterId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!data?.id) return null
  return { orgScenarioId: data.id as string }
}

export async function handleUpdate(req: VercelRequest, res: VercelResponse, orgId: string, id: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const updates = (body.updates ?? body) as Record<string, unknown>
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates が必要です' })
  }

  // マルチテナント境界: 自組織がこのシナリオを保有しているかチェック
  const owned = await ensureOwnedByOrg(db, orgId, id)
  if (!owned) {
    return res.status(404).json({ error: 'シナリオが見つかりません' })
  }

  // organization_scenarios の更新ペイロード組み立て
  const orgScenarioData: Record<string, unknown> = {}

  if (updates.status) {
    const validOrgStatuses = ['available', 'unavailable', 'coming_soon']
    if (validOrgStatuses.includes(updates.status as string)) {
      orgScenarioData.org_status = updates.status
    }
  }

  const directOrgColumns = [
    'slug', 'duration', 'participation_fee', 'gm_test_participation_fee',
    'extra_preparation_time', 'license_amount', 'gm_test_license_amount',
    'is_license_buyout',
    'franchise_license_amount', 'franchise_gm_test_license_amount',
    'available_gms', 'experienced_staff', 'available_stores',
    'gm_costs', 'gm_count', 'gm_assignments',
    'production_cost', 'production_costs', 'depreciation_per_performance',
    'play_count', 'notes', 'participation_costs', 'flexible_pricing', 'use_flexible_pricing',
    'booking_start_date', 'booking_end_date', 'private_booking_time_slots',
    'kit_count',
  ] as const
  for (const col of directOrgColumns) {
    if (updates[col] !== undefined) {
      orgScenarioData[col] = updates[col]
    }
  }

  const overrideMapping: Record<string, string> = {
    title: 'override_title',
    author: 'override_author',
    genre: 'override_genre',
    difficulty: 'override_difficulty',
    player_count_min: 'override_player_count_min',
    player_count_max: 'override_player_count_max',
  }
  for (const [scenarioCol, orgCol] of Object.entries(overrideMapping)) {
    if (updates[scenarioCol] !== undefined) {
      const value = updates[scenarioCol]
      // 空文字を書くと COALESCE(override, master) がマスタータイトルを隠す
      orgScenarioData[orgCol] = value === '' ? null : value
    }
  }

  const customMapping: Record<string, string> = {
    key_visual_url: 'custom_key_visual_url',
    description: 'custom_description',
    synopsis: 'custom_synopsis',
    caution: 'custom_caution',
  }
  for (const [scenarioCol, orgCol] of Object.entries(customMapping)) {
    if (updates[scenarioCol] !== undefined) {
      orgScenarioData[orgCol] = updates[scenarioCol]
    }
  }

  if (Object.keys(orgScenarioData).length > 0) {
    orgScenarioData.updated_at = new Date().toISOString()
    const { error: orgError } = await db
      .from('organization_scenarios')
      .update(orgScenarioData)
      .eq('id', owned.orgScenarioId)
      .eq('organization_id', orgId)
    if (orgError) {
      console.error('[scenarios:update] organization_scenarios error:', orgError)
      return res.status(500).json({ error: '更新に失敗しました', detail: orgError.message })
    }
  }

  // マスターを draft → pending に昇格（自組織が「公開中」にした場合のみ）
  // 共有マスター（他組織が作成）の master_status を勝手に変えないよう、
  // submitted_by_organization_id が自組織のマスターに限って昇格する。
  // 他組織提出のマスターの場合は黙ってスキップ（エラーにしない）。
  if (updates.status === 'available') {
    const { data: masterData } = await db
      .from('scenario_masters')
      .select('id, master_status, submitted_by_organization_id')
      .eq('id', id)
      .maybeSingle()

    const master = masterData as
      | { master_status?: string; submitted_by_organization_id?: string | null }
      | null
    if (
      master &&
      master.master_status === 'draft' &&
      master.submitted_by_organization_id === orgId
    ) {
      await db
        .from('scenario_masters')
        .update({ master_status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', id)
    }
  }

  const { data: updatedScenario, error: fetchError } = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()

  if (fetchError || !updatedScenario) {
    console.error('[scenarios:update] fetch error:', fetchError)
    return res.status(500).json({
      error: '更新後のシナリオ取得に失敗しました',
      detail: fetchError?.message,
    })
  }

  return res.status(200).json(updatedScenario)
}

export async function handleUpdateAvailableGms(
  req: VercelRequest,
  res: VercelResponse,
  orgId: string,
  id: string,
) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const availableGms = body.availableGms
  if (!Array.isArray(availableGms)) {
    return res.status(400).json({ error: 'availableGms (配列) が必要です' })
  }

  const owned = await ensureOwnedByOrg(db, orgId, id)
  if (!owned) {
    return res.status(404).json({ error: 'シナリオが見つかりません' })
  }

  const { error } = await db
    .from('organization_scenarios')
    .update({ available_gms: availableGms, updated_at: new Date().toISOString() })
    .eq('id', owned.orgScenarioId)
    .eq('organization_id', orgId)
  if (error) {
    console.error('[scenarios:updateAvailableGms] error:', error)
    return res.status(500).json({ error: '更新に失敗しました', detail: error.message })
  }

  const { data: updatedScenario, error: fetchError } = await db
    .from('organization_scenarios_with_master')
    .select(SELECT_FIELDS)
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()
  if (fetchError || !updatedScenario) {
    console.error('[scenarios:updateAvailableGms] fetch error:', fetchError)
    return res.status(500).json({
      error: '更新後のシナリオ取得に失敗しました',
      detail: fetchError?.message,
    })
  }
  return res.status(200).json(updatedScenario)
}

// NOTE: staff.special_scenarios への同期は廃止済み。staff_scenario_assignments が唯一のソース。
// 現時点では updateAvailableGms と同じ実装。互換性のため別アクションとして残す。
export async function handleUpdateAvailableGmsWithSync(
  req: VercelRequest,
  res: VercelResponse,
  orgId: string,
  id: string,
) {
  return await handleUpdateAvailableGms(req, res, orgId, id)
}
