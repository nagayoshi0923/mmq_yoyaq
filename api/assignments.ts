import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// ─── 所有チェック用ヘルパ ────────────────────────────────────────────────────
/** staff_id が自組織に属するか確認 */
async function assertStaffOwnedByOrg(staffId: string, orgId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('staff')
    .select('id')
    .eq('id', staffId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new ApiError(500, `staff 所有検証に失敗: ${error.message}`)
  if (!data) throw new ApiError(403, '指定の staff は自組織のものではありません')
}

/** scenario_master_id が自組織で扱えるか確認 (org が purchase 済みか) */
async function assertScenarioMasterAccessible(scenarioMasterId: string, orgId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_scenarios')
    .select('id')
    .eq('scenario_master_id', scenarioMasterId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new ApiError(500, `scenario 所有検証に失敗: ${error.message}`)
  if (!data) throw new ApiError(403, '指定の scenario は自組織で利用可能ではありません')
}

// ─── GET ハンドラ ─────────────────────────────────────────────────────────────
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const staffId = req.query.staff_id as string | undefined
  const scenarioId = req.query.scenario_id as string | undefined
  const staffIdsRaw = req.query.staff_ids as string | undefined
  const scenarioIdsRaw = req.query.scenario_ids as string | undefined

  // ─── 一括取得: ?staff_ids=a,b,c ─────────────────────────────────────────
  if (staffIdsRaw) {
    const ids = staffIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) return res.status(200).json([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('staff_scenario_assignments')
      .select('staff_id, scenario_master_id, can_main_gm, can_sub_gm, is_experienced')
      .eq('organization_id', user.orgId)
      .in('staff_id', ids)
      .limit(50000)
    if (error) {
      console.error('[assignments] batch staff DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  }

  // ─── 一括取得: ?scenario_ids=a,b,c ──────────────────────────────────────
  if (scenarioIdsRaw) {
    const ids = scenarioIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) return res.status(200).json([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('staff_scenario_assignments')
      .select('scenario_master_id, staff_id, can_main_gm, can_sub_gm, is_experienced')
      .eq('organization_id', user.orgId)
      .in('scenario_master_id', ids)
      .limit(50000)
    if (error) {
      console.error('[assignments] batch scenario DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  }

  if (!staffId && !scenarioId) {
    return res.status(400).json({ error: 'staff_id / scenario_id / staff_ids / scenario_ids のいずれかが必要です' })
  }

  if (staffId) {
    const SELECT = `
      *,
      scenario_masters:scenario_master_id (
        id,
        title,
        author
      )
    `
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('staff_scenario_assignments')
      .select(SELECT)
      .eq('organization_id', user.orgId)
      .eq('staff_id', staffId)
      .order('assigned_at', { ascending: false })

    if (error) {
      console.error('[assignments] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  }

  // scenarioId
  const SELECT = `
    *,
    staff:staff_id (
      id,
      name,
      line_name
    )
  `
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('staff_scenario_assignments')
    .select(SELECT)
    .eq('organization_id', user.orgId)
    .eq('scenario_master_id', scenarioId)
    .order('assigned_at', { ascending: false })

  if (error) {
    console.error('[assignments] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── POST: action 別に処理 ─────────────────────────────────────────────────
async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = (req.query.action ?? req.body?.action) as string | undefined
  const body = req.body ?? {}

  if (action === 'upsert') {
    // 単一の担当関係を upsert（addAssignment 相当）
    const { staff_id, scenario_master_id, notes, can_main_gm, can_sub_gm, is_experienced } = body as {
      staff_id?: string
      scenario_master_id?: string
      notes?: string | null
      can_main_gm?: boolean
      can_sub_gm?: boolean
      is_experienced?: boolean
    }
    if (!staff_id || !scenario_master_id) {
      return res.status(400).json({ error: 'staff_id / scenario_master_id が必要です' })
    }
    await assertStaffOwnedByOrg(staff_id, user.orgId)
    await assertScenarioMasterAccessible(scenario_master_id, user.orgId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('staff_scenario_assignments')
      .upsert(
        {
          staff_id,
          scenario_master_id,
          notes: notes ?? null,
          can_main_gm: can_main_gm ?? true,
          can_sub_gm: can_sub_gm ?? true,
          is_experienced: is_experienced ?? false,
          assigned_at: new Date().toISOString(),
          organization_id: user.orgId,
        },
        { onConflict: 'staff_id,scenario_master_id' }
      )
      .select()
      .single()
    if (error) {
      console.error('[assignments] upsert error:', error)
      return res.status(500).json({ error: '担当関係の保存に失敗しました', detail: error.message })
    }
    return res.status(200).json(data)
  }

  if (action === 'update_staff_assignments') {
    // スタッフの担当シナリオを一括更新
    // assignments: Array<{ scenarioId, can_main_gm, can_sub_gm, is_experienced, notes? }>
    const { staff_id, assignments, confirm_clear } = body as {
      staff_id?: string
      assignments?: Array<{
        scenarioId: string
        can_main_gm: boolean
        can_sub_gm: boolean
        is_experienced: boolean
        notes?: string | null
      }>
      confirm_clear?: boolean
    }
    if (!staff_id || !Array.isArray(assignments)) {
      return res.status(400).json({ error: 'staff_id / assignments が必要です' })
    }
    await assertStaffOwnedByOrg(staff_id, user.orgId)

    // 🛡 空配列での一括クリアは、明示的な confirm_clear: true なしには受理しない
    // (ロード失敗やクライアント不具合で空配列が送られて全消失する事故を防止)
    if (assignments.length === 0 && confirm_clear !== true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (db as any)
        .from('staff_scenario_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('staff_id', staff_id)
        .eq('organization_id', user.orgId)
      return res.status(409).json({
        error: 'EMPTY_PAYLOAD_REJECTED',
        message: '担当 0 件での一括更新を拒否しました。本当に全件解除する場合は confirm_clear: true を指定してください。',
        existing_count: count ?? 0,
      })
    }

    // 既存を全削除（自組織分のみ）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (db as any)
      .from('staff_scenario_assignments')
      .delete()
      .eq('staff_id', staff_id)
      .eq('organization_id', user.orgId)
    if (deleteError) {
      console.error('[assignments] delete error:', deleteError)
      return res.status(500).json({ error: '既存担当の削除に失敗しました', detail: deleteError.message })
    }

    const valid = assignments.filter((a) => a.scenarioId && typeof a.scenarioId === 'string')
    if (valid.length === 0) return res.status(200).json({ ok: true, inserted: 0 })

    // 各 scenario_master_id を組織所有チェック
    for (const a of valid) {
      await assertScenarioMasterAccessible(a.scenarioId, user.orgId)
    }

    const records = valid.map((a) => ({
      staff_id,
      scenario_master_id: a.scenarioId,
      can_main_gm: a.can_main_gm,
      can_sub_gm: a.can_sub_gm,
      is_experienced: a.is_experienced,
      notes: a.notes ?? null,
      assigned_at: new Date().toISOString(),
      organization_id: user.orgId,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (db as any)
      .from('staff_scenario_assignments')
      .insert(records)
    if (insertError) {
      console.error('[assignments] insert error:', insertError)
      return res.status(500).json({ error: '担当の保存に失敗しました', detail: insertError.message })
    }
    return res.status(200).json({ ok: true, inserted: records.length })
  }

  if (action === 'update_scenario_assignments') {
    // シナリオの担当スタッフを差分更新（GM レコードのみ）
    const { scenario_master_id, staff_ids, notes } = body as {
      scenario_master_id?: string
      staff_ids?: string[]
      notes?: string | null
    }
    if (!scenario_master_id || !Array.isArray(staff_ids)) {
      return res.status(400).json({ error: 'scenario_master_id / staff_ids が必要です' })
    }
    await assertScenarioMasterAccessible(scenario_master_id, user.orgId)
    for (const id of staff_ids) {
      await assertStaffOwnedByOrg(id, user.orgId)
    }

    // 現在の GM 担当を取得
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: current, error: fetchError } = await (db as any)
      .from('staff_scenario_assignments')
      .select('staff_id, can_main_gm, can_sub_gm, is_experienced')
      .eq('scenario_master_id', scenario_master_id)
      .eq('organization_id', user.orgId)
    if (fetchError) {
      return res.status(500).json({ error: '現状取得に失敗', detail: fetchError.message })
    }

    const gm = (current ?? []).filter(
      (a: { can_main_gm: boolean; can_sub_gm: boolean }) => a.can_main_gm === true || a.can_sub_gm === true
    )
    const currentGmStaffIds: string[] = gm.map((a: { staff_id: string }) => a.staff_id)

    const toDowngrade = currentGmStaffIds.filter((id) => !staff_ids.includes(id))
    const toAdd = staff_ids.filter((id) => !currentGmStaffIds.includes(id))

    if (toDowngrade.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: downgradeError } = await (db as any)
        .from('staff_scenario_assignments')
        .update({ can_main_gm: false, can_sub_gm: false, is_experienced: true })
        .eq('scenario_master_id', scenario_master_id)
        .eq('organization_id', user.orgId)
        .in('staff_id', toDowngrade)
      if (downgradeError) {
        return res.status(500).json({ error: 'GM降格に失敗', detail: downgradeError.message })
      }
    }

    if (toAdd.length > 0) {
      const existingExpStaffIds = (current ?? [])
        .filter(
          (a: { can_main_gm: boolean; can_sub_gm: boolean; is_experienced: boolean; staff_id: string }) =>
            !a.can_main_gm && !a.can_sub_gm && a.is_experienced && toAdd.includes(a.staff_id)
        )
        .map((a: { staff_id: string }) => a.staff_id)

      if (existingExpStaffIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: upgradeError } = await (db as any)
          .from('staff_scenario_assignments')
          .update({ can_main_gm: true, can_sub_gm: true, is_experienced: false })
          .eq('scenario_master_id', scenario_master_id)
          .eq('organization_id', user.orgId)
          .in('staff_id', existingExpStaffIds)
        if (upgradeError) {
          return res.status(500).json({ error: 'GM昇格に失敗', detail: upgradeError.message })
        }
      }

      const trulyNew = toAdd.filter((id) => !existingExpStaffIds.includes(id))
      if (trulyNew.length > 0) {
        const newAssignments = trulyNew.map((staffId) => ({
          staff_id: staffId,
          scenario_master_id,
          can_main_gm: true,
          can_sub_gm: true,
          is_experienced: false,
          notes: notes ?? null,
          assigned_at: new Date().toISOString(),
          organization_id: user.orgId,
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertError } = await (db as any)
          .from('staff_scenario_assignments')
          .insert(newAssignments)
        if (insertError) {
          return res.status(500).json({ error: 'GM追加に失敗', detail: insertError.message })
        }
      }
    }

    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: `不明な action: ${action}` })
}

// ─── PATCH: 担当関係の詳細を更新 ──────────────────────────────────────────
async function handlePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = req.body ?? {}
  const { staff_id, scenario_master_id, notes, assigned_at } = body as {
    staff_id?: string
    scenario_master_id?: string
    notes?: string | null
    assigned_at?: string
  }
  if (!staff_id || !scenario_master_id) {
    return res.status(400).json({ error: 'staff_id / scenario_master_id が必要です' })
  }
  await assertStaffOwnedByOrg(staff_id, user.orgId)
  await assertScenarioMasterAccessible(scenario_master_id, user.orgId)

  const updates: Record<string, unknown> = {}
  if (notes !== undefined) updates.notes = notes
  if (assigned_at !== undefined) updates.assigned_at = assigned_at

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: '更新内容が空です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('staff_scenario_assignments')
    .update(updates)
    .eq('staff_id', staff_id)
    .eq('scenario_master_id', scenario_master_id)
    .eq('organization_id', user.orgId)
    .select()
    .single()
  if (error) {
    console.error('[assignments] patch error:', error)
    return res.status(500).json({ error: '更新に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// ─── DELETE: GM 担当を解除（体験済みに降格） ──────────────────────────────
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const staffId = (req.query.staff_id ?? req.body?.staff_id) as string | undefined
  const scenarioMasterId = (req.query.scenario_master_id ?? req.body?.scenario_master_id) as string | undefined
  if (!staffId || !scenarioMasterId) {
    return res.status(400).json({ error: 'staff_id / scenario_master_id が必要です' })
  }
  await assertStaffOwnedByOrg(staffId, user.orgId)
  await assertScenarioMasterAccessible(scenarioMasterId, user.orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('staff_scenario_assignments')
    .update({ can_main_gm: false, can_sub_gm: false, is_experienced: true })
    .eq('staff_id', staffId)
    .eq('scenario_master_id', scenarioMasterId)
    .eq('organization_id', user.orgId)
  if (error) {
    console.error('[assignments] delete (downgrade) error:', error)
    return res.status(500).json({ error: '担当解除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ ok: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    if (req.method === 'GET') return await handleGet(req, res, user)
    if (req.method === 'POST') return await handlePost(req, res, user)
    if (req.method === 'PATCH') return await handlePatch(req, res, user)
    if (req.method === 'DELETE') return await handleDelete(req, res, user)

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[assignments] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
