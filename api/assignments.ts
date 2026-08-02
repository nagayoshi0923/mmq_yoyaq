import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'
import { computeAssignmentDiff } from '../src/lib/assignmentDiff.js'

// ─── 担当変更履歴 ────────────────────────────────────────────────────────────
/**
 * staff_scenario_assignments の増減差分だけを履歴として記録する。
 * 履歴 INSERT の失敗は本体更新を壊してはならない（best-effort・warn のみ）。
 */
async function recordAssignmentHistory(
  orgId: string,
  changedBy: string | null,
  changes: Array<{ staffId: string; scenarioMasterId: string; action: 'added' | 'removed' }>
): Promise<void> {
  if (changes.length === 0) return
  try {
    const rows = changes.map((c) => ({
      organization_id: orgId,
      staff_id: c.staffId,
      scenario_master_id: c.scenarioMasterId,
      action: c.action,
      changed_by: changedBy,
      source: 'api',
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('staff_scenario_assignment_history')
      .insert(rows)
    if (error) {
      console.warn('[assignments] 履歴記録に失敗（本体更新は成功）:', error.message)
    }
  } catch (e) {
    console.warn('[assignments] 履歴記録で例外（本体更新は成功）:', e)
  }
}

/** scenario_master_id[] → title のマップを引く（減少ガードの「外れる担当」表示用） */
async function fetchScenarioTitles(
  orgId: string,
  scenarioMasterIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const ids = Array.from(new Set(scenarioMasterIds)).filter(Boolean)
  if (ids.length === 0) return map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_scenarios_with_master')
    .select('scenario_master_id, title')
    .eq('organization_id', orgId)
    .in('scenario_master_id', ids)
  if (error) {
    console.warn('[assignments] シナリオ名解決に失敗:', error.message)
    return map
  }
  for (const r of data ?? []) {
    if (r.scenario_master_id) map.set(r.scenario_master_id, r.title ?? r.scenario_master_id)
  }
  return map
}

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
  const historyStaffId = req.query.history_staff_id as string | undefined

  // ─── 担当変更履歴（直近） ?history_staff_id=... ────────────────────────────
  if (historyStaffId) {
    await assertStaffOwnedByOrg(historyStaffId, user.orgId)
    const limitRaw = Number.parseInt((req.query.limit as string | undefined) ?? '20', 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('staff_scenario_assignment_history')
      .select('id, scenario_master_id, action, changed_by, changed_at, source')
      .eq('organization_id', user.orgId)
      .eq('staff_id', historyStaffId)
      .order('changed_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[assignments] history DB error:', error)
      return res.status(500).json({ error: '履歴取得に失敗しました', detail: error.message })
    }
    const rows = data ?? []
    // シナリオ名を解決して付与（表示用）
    const titleMap = await fetchScenarioTitles(
      user.orgId,
      rows.map((r: { scenario_master_id: string }) => r.scenario_master_id)
    )
    const withTitles = rows.map((r: { scenario_master_id: string }) => ({
      ...r,
      scenario_title: titleMap.get(r.scenario_master_id) ?? r.scenario_master_id,
    }))
    return res.status(200).json(withTitles)
  }

  // ─── 一括取得: ?staff_ids=a,b,c ─────────────────────────────────────────
  if (staffIdsRaw) {
    const ids = staffIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) return res.status(200).json([])
    // PostgREST の max-rows (Supabase デフォルト 1000) で打ち切られるのを避けるため
    // range() でページネーション。担当データが欠落すると公演ダイアログで GM の
    // 「担当」バッジが消える（過去にこれで じの 等が表示されない事故あり）。
    const PAGE_SIZE = 1000
    const allRows: Array<Record<string, unknown>> = []
    for (let from = 0; ; from += PAGE_SIZE) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (db as any)
        .from('staff_scenario_assignments')
        .select('staff_id, scenario_master_id, can_main_gm, can_sub_gm, is_experienced')
        .eq('organization_id', user.orgId)
        .in('staff_id', ids)
        .order('staff_id')
        .range(from, from + PAGE_SIZE - 1)
      if (error) {
        console.error('[assignments] batch staff DB error:', error)
        return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
      }
      if (!data || data.length === 0) break
      allRows.push(...data)
      if (data.length < PAGE_SIZE) break
    }
    return res.status(200).json(allRows)
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

    const valid = assignments.filter((a) => a.scenarioId && typeof a.scenarioId === 'string')

    // ⚠️ 破壊的な delete の「前」にアクセス可否を一括検証する。
    // 自組織で扱えない scenario_master_id（organization_scenarios から外れた孤児など）は
    // throw せず除外する。これを delete の後に throw 方式でやると、孤児行が 1 つでも
    // 混ざっていた場合に「全削除済みだが再挿入されず全消失」する事故になる（過去に発生）。
    const accessibleScenarioIds = new Set<string>()
    if (valid.length > 0) {
      const uniqueIds = Array.from(new Set(valid.map((a) => a.scenarioId)))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: accRows, error: accError } = await (db as any)
        .from('organization_scenarios')
        .select('scenario_master_id')
        .eq('organization_id', user.orgId)
        .in('scenario_master_id', uniqueIds)
      if (accError) {
        return res.status(500).json({ error: 'シナリオ所有検証に失敗', detail: accError.message })
      }
      for (const r of accRows ?? []) accessibleScenarioIds.add(r.scenario_master_id)
    }

    const insertable = valid.filter((a) => accessibleScenarioIds.has(a.scenarioId))
    const skipped = valid.filter((a) => !accessibleScenarioIds.has(a.scenarioId)).map((a) => a.scenarioId)
    if (skipped.length > 0) {
      console.warn('[assignments] update_staff_assignments: 自組織で扱えないシナリオを除外:', skipped)
    }

    // 🛡 減少ガード（YOYAQ-011）: delete の「前」に既存の担当集合を取得し、
    // 新しい配列が既存より1件でも減る場合は 409 で拒否する（PO要件「登録済みが減らないこと」）。
    // confirm_clear: true 明示時のみ通す（部分欠けの配列で担当が黙って消える事故を防ぐ）。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRows, error: existingError } = await (db as any)
      .from('staff_scenario_assignments')
      .select('scenario_master_id')
      .eq('staff_id', staff_id)
      .eq('organization_id', user.orgId)
    if (existingError) {
      return res.status(500).json({ error: '既存担当の取得に失敗しました', detail: existingError.message })
    }
    const existingIds = new Set<string>(
      (existingRows ?? []).map((r: { scenario_master_id: string }) => r.scenario_master_id)
    )
    // 新配列が「保持しようとしている」集合（アクセス不能な孤児も client の意図としては保持扱い）
    const {
      existingCount,
      incomingCount,
      removed: removedIds,
      added: addedIds,
    } = computeAssignmentDiff(existingIds, valid.map((a) => a.scenarioId))

    if (removedIds.length > 0 && confirm_clear !== true) {
      const titleMap = await fetchScenarioTitles(user.orgId, removedIds)
      return res.status(409).json({
        error: 'ASSIGNMENT_DECREASE_REJECTED',
        message: `担当が ${existingCount} 件から ${incomingCount} 件に減ります。減少を許可する場合は confirm_clear: true を指定してください。`,
        existing_count: existingCount,
        incoming_count: incomingCount,
        removed_scenario_ids: removedIds,
        removed_scenario_names: removedIds.map((id) => titleMap.get(id) ?? id),
      })
    }

    // 既存を全削除（自組織分のみ）— 検証を通過した後にのみ実行する
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

    if (insertable.length === 0) {
      await recordAssignmentHistory(
        user.orgId,
        user.userId,
        removedIds.map((id) => ({ staffId: staff_id, scenarioMasterId: id, action: 'removed' as const }))
      )
      return res.status(200).json({ ok: true, inserted: 0, skipped })
    }

    const records = insertable.map((a) => ({
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
    // 履歴: 実際に増減した分だけ（孤児で挿入されなかった added は除外）
    const insertedIds = new Set(insertable.map((a) => a.scenarioId))
    await recordAssignmentHistory(user.orgId, user.userId, [
      ...addedIds
        .filter((id) => insertedIds.has(id))
        .map((id) => ({ staffId: staff_id, scenarioMasterId: id, action: 'added' as const })),
      ...removedIds.map((id) => ({ staffId: staff_id, scenarioMasterId: id, action: 'removed' as const })),
    ])
    return res.status(200).json({ ok: true, inserted: records.length, skipped })
  }

  if (action === 'update_scenario_assignments') {
    // シナリオの担当スタッフを差分更新（GM レコードのみ）
    const { scenario_master_id, staff_ids, notes, confirm_clear } = body as {
      scenario_master_id?: string
      staff_ids?: string[]
      notes?: string | null
      confirm_clear?: boolean
    }
    if (!scenario_master_id || !Array.isArray(staff_ids)) {
      return res.status(400).json({ error: 'scenario_master_id / staff_ids が必要です' })
    }
    await assertScenarioMasterAccessible(scenario_master_id, user.orgId)
    for (const id of staff_ids) {
      await assertStaffOwnedByOrg(id, user.orgId)
    }

    // 🛡 空 staff_ids は既存 GM を全員降格させる。ロード失敗やレースで空配列が
    // 送られて全 GM が消える事故を防ぐため、明示的な confirm_clear なしには拒否する。
    if (staff_ids.length === 0 && confirm_clear !== true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (db as any)
        .from('staff_scenario_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('scenario_master_id', scenario_master_id)
        .eq('organization_id', user.orgId)
        .or('can_main_gm.eq.true,can_sub_gm.eq.true')
      return res.status(409).json({
        error: 'EMPTY_PAYLOAD_REJECTED',
        message: '担当GM 0 件での更新を拒否しました。本当に全員を降格する場合は confirm_clear: true を指定してください。',
        existing_gm_count: count ?? 0,
      })
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

    // 🛡 減少ガード（YOYAQ-011）: 担当GMが1人でも減る（降格される）場合は 409 で拒否する。
    // confirm_clear: true 明示時のみ通す。既存の空配列ガードは 0 件だけを見るため部分欠けを素通りする穴を塞ぐ。
    if (toDowngrade.length > 0 && confirm_clear !== true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: staffRows } = await (db as any)
        .from('staff')
        .select('id, name')
        .eq('organization_id', user.orgId)
        .in('id', toDowngrade)
      const nameMap = new Map<string, string>(
        (staffRows ?? []).map((s: { id: string; name: string }) => [s.id, s.name])
      )
      return res.status(409).json({
        error: 'ASSIGNMENT_DECREASE_REJECTED',
        message: `担当GMが ${currentGmStaffIds.length} 人から ${staff_ids.length} 人に減ります。減少を許可する場合は confirm_clear: true を指定してください。`,
        existing_count: currentGmStaffIds.length,
        incoming_count: staff_ids.length,
        removed_staff_ids: toDowngrade,
        removed_staff_names: toDowngrade.map((id) => nameMap.get(id) ?? id),
      })
    }

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

    // 履歴: GM担当の増減分だけ（added=GMに昇格/新規、removed=GMから降格）
    await recordAssignmentHistory(user.orgId, user.userId, [
      ...toAdd.map((id) => ({ staffId: id, scenarioMasterId: scenario_master_id, action: 'added' as const })),
      ...toDowngrade.map((id) => ({ staffId: id, scenarioMasterId: scenario_master_id, action: 'removed' as const })),
    ])

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
