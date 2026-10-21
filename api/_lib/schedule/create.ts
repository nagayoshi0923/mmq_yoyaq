// api/schedule.ts の公演の作成（POST）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { createUserScopedClient, type AuthUser } from '../auth.js'
import { DB_VALID_CATEGORIES, SCHEDULE_CREATABLE_FIELDS, pickFields, removeMissingScheduleColumn, findMatchingScenario, SCHEDULE_EVENT_FULL_SELECT } from './writeHelpers.js'

// ─── handleCreate (POST) ─────────────────────────────────────────────────
export async function handleCreate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const database = db!
  const body = (req.body ?? {}) as Record<string, unknown>

  // ホワイトリスト + サーバ強制
  const insertRow = pickFields(body, SCHEDULE_CREATABLE_FIELDS)
  insertRow.organization_id = user.orgId // ← クライアント値は使わずサーバ強制

  if (!insertRow.date || !insertRow.store_id || !insertRow.category || !insertRow.start_time || !insertRow.end_time) {
    return res.status(400).json({ error: 'date / store_id / category / start_time / end_time は必須です' })
  }

  // 自組織の店舗かを確認
  const { data: storeRow, error: storeErr } = await database
    .from('stores')
    .select('id, organization_id')
    .eq('id', insertRow.store_id)
    .maybeSingle()
  if (storeErr) {
    console.error('[schedule:create] store lookup error:', storeErr)
    return res.status(500).json({ error: '店舗確認に失敗しました' })
  }
  if (!storeRow) return res.status(404).json({ error: '店舗が見つかりません' })
  if (storeRow.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の店舗は使用できません' })
  }

  // シナリオ名から自動マッチング
  const scenarioInput = typeof insertRow.scenario === 'string' ? insertRow.scenario : undefined
  if (scenarioInput && !insertRow.scenario_master_id) {
    const match = await findMatchingScenario(scenarioInput)
    if (match) {
      insertRow.scenario_master_id = match.id
      insertRow.scenario = match.title
    }
  }

  // organization_scenario_id を自動設定（scenario_master_id 経由）
  if (insertRow.scenario_master_id && !insertRow.organization_scenario_id) {
    const { data: orgScenario } = await database
      .from('organization_scenarios')
      .select('id')
      .eq('scenario_master_id', insertRow.scenario_master_id as string)
      .eq('organization_id', user.orgId)
      .maybeSingle()
    if (orgScenario?.id) {
      insertRow.organization_scenario_id = orgScenario.id
    }
  }

  // カテゴリのバリデーション
  if (typeof insertRow.category === 'string' && !DB_VALID_CATEGORIES.includes(insertRow.category)) {
    insertRow.category = 'open'
  }

  // 公演ダイアログからの作成（staff_assignment 付き。GM 未指定なら担当は空）は、公演・担当・作成履歴を 1 つの取引で確定する
  // （2026-10-22 hotfix、PR #1210）。担当の保存に失敗したら公演も作らない。要求 ID が同じ作成は 1 回だけ作る
  // （結果が分からなかった保存を保存し直しても二重に作らない）。staff_assignment の無い作成（他の画面）は従来の INSERT のまま。
  const staffAssignment = parseStaffAssignment(body.staff_assignment)
  if (staffAssignment === 'invalid') return res.status(400).json({ error: '担当の形式が不正です' })
  const requestId = typeof body.client_request_id === 'string' && UUID_RE.test(body.client_request_id) ? body.client_request_id : null
  if (staffAssignment && !requestId) return res.status(400).json({ error: '作成の要求 ID が必要です。画面を再読み込みしてください' })
  if (staffAssignment && requestId) {
    const { gms: _gms, gm_roles: _roles, organization_id: _org, ...eventFields } = insertRow
    const { data: createdId, error: rpcError } = await createUserScopedClient(user.jwt).rpc('create_schedule_event_with_staff', {
      p_request_id: requestId, p_event: eventFields, p_gms: staffAssignment.gms, p_gm_roles: staffAssignment.gm_roles, p_entries: staffAssignment.entries,
    })
    if (rpcError || typeof createdId !== 'string') {
      const code = rpcError?.code ?? ''
      // DB が SQLSTATE 付きで失敗を返した = 取引は取り消し済み（公演は作られていない）。
      // それ以外（通信の失敗・応答の欠落など）は、作成されたかどうかをここでは断定できない（Codex 再レビュー 2e24bbf の 4）。
      if (!/^[0-9A-Z]{5}$/.test(code)) {
        console.error('[schedule:create] create_schedule_event_with_staff outcome unknown:', rpcError)
        return res.status(502).json({ error: CREATE_OUTCOME_UNKNOWN, outcome: 'unknown' })
      }
      // MMQC1: 照合で未作成と確認して取り消した要求 ID（遅れて届いた作成）。作成していないことが確定している
      if (code === 'MMQC1') return res.status(409).json({ error: rpcError?.message ?? 'この保存は取り消し済みのため作成していません', outcome: 'cancelled' })
      const status = code === '42501' ? 403 : ['40001', '55P03', '23514'].includes(code) ? 409 : ['22023', '22P02'].includes(code) ? 400 : 500
      if (status === 500) console.error('[schedule:create] create_schedule_event_with_staff error:', rpcError)
      return res.status(status).json({ error: status === 500 ? '公演と担当の保存に失敗しました。公演は作成されていません' : `${rpcError?.message ?? '担当を保存できませんでした'}（公演は作成されていません）` })
    }
    return await respondWithCreatedEvent(res, database, user, createdId, { ...eventFields, organization_id: user.orgId, gms: staffAssignment.gms, gm_roles: staffAssignment.gm_roles })
  }

  // INSERT（不明カラムをリトライ削除）
  let insertPayload: Record<string, unknown> = { ...insertRow }
  let lastError: { message?: string; details?: string; hint?: string; code?: string } | null = null
  let insertedId: string | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await database
      .from('schedule_events')
      .insert([insertPayload])
      .select('id')
      .single()
    if (!error) {
      insertedId = data.id as string
      break
    }
    lastError = error
    const removal = removeMissingScheduleColumn(insertPayload, error)
    if (!removal) break
    insertPayload = removal.nextPayload
  }

  if (!insertedId) {
    if (lastError?.code === '23514') return res.status(400).json({ error: lastError.message })
    console.error('[schedule:create] insert error:', lastError)
    return res.status(500).json({ error: '公演の作成に失敗しました', detail: lastError?.message })
  }

  return await respondWithCreatedEvent(res, database, user, insertedId, insertPayload)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CREATE_OUTCOME_UNKNOWN = '公演が作成されたか確認できませんでした。スケジュールを再読み込みして、公演があるか確かめてから保存し直してください'

type StaffAssignment = { gms: string[]; gm_roles: Record<string, string>; entries: unknown[] }

/** 作成と同時に保存する担当。staff_assignment が無ければ null（従来の作成）。gms が空なら GM 未指定の作成。 */
function parseStaffAssignment(raw: unknown): StaffAssignment | null | 'invalid' {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'invalid'
  const { gms, gm_roles, entries } = raw as Record<string, unknown>
  if (!Array.isArray(gms) || gms.some(name => typeof name !== 'string')) return 'invalid'
  if (gm_roles === null || typeof gm_roles !== 'object' || Array.isArray(gm_roles)) return 'invalid'
  if (entries !== undefined && !Array.isArray(entries)) return 'invalid'
  if (gms.length === 0 && (entries ?? []).length > 0) return 'invalid'
  return { gms: gms as string[], gm_roles: gm_roles as Record<string, string>, entries: (entries ?? []) as unknown[] }
}

async function respondWithCreatedEvent(res: VercelResponse, database: NonNullable<typeof db>, user: AuthUser, insertedId: string, savedFields: Record<string, unknown>) {
  // スタッフ専用ビューから完全レコードを返す（1 回だけ取り直す）
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: fullEvent, error: fetchError } = await database
      .from('schedule_events')
      .select(SCHEDULE_EVENT_FULL_SELECT)
      .eq('id', insertedId)
      .eq('organization_id', user.orgId)
      .single()
    if (!fetchError && fullEvent) return res.status(201).json(fullEvent)
    console.error('[schedule:create] fetch error:', fetchError)
  }
  // 作成は確定済み（ID 既知）。取得の失敗を「未作成」として返すと、画面が保存し直して二重に作成する
  // （Codex 再レビュー 2e24bbf の 4）。保存した値と ID で作成済みとして返す（一覧は Realtime の取り直しで揃う）。
  return res.status(201).json({ current_participants: 0, is_cancelled: false, ...savedFields, id: insertedId, read_back: false })
}
