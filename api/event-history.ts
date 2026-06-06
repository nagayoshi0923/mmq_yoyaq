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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

const SELECT_FIELDS =
  'id, schedule_event_id, organization_id, event_date, store_id, time_slot, changed_by_user_id, changed_by_staff_id, changed_by_name, action_type, changes, old_values, new_values, deleted_event_scenario, notes, created_at'

const ACTION_TYPES = new Set([
  'create',
  'update',
  'delete',
  'cancel',
  'restore',
  'publish',
  'unpublish',
  'add_participant',
  'remove_participant',
  'move_out',
  'move_in',
  'copy',
  'email_sent',
])

// ─── ヘルパ ─────────────────────────────────────────────────────────────────
async function assertStoreOwnedByOrg(storeId: string, orgId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new ApiError(500, `store 所有検証に失敗: ${error.message}`)
  if (!data) throw new ApiError(403, '指定の store は自組織のものではありません')
}

async function assertScheduleEventOwnedByOrg(scheduleEventId: string, orgId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('schedule_events')
    .select('id, organization_id')
    .eq('id', scheduleEventId)
    .maybeSingle()
  if (error) throw new ApiError(500, `schedule_event 取得失敗: ${error.message}`)
  // 削除後の履歴を残せるよう schedule_event が無い場合は許容（schedule_event_id は null になる）
  if (data && data.organization_id !== orgId) {
    throw new ApiError(403, '他組織のイベントの履歴は記録できません')
  }
}

// ─── GET ────────────────────────────────────────────────────────────────────
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const date = req.query.date as string | undefined
  const storeId = req.query.store_id as string | undefined
  const timeSlotRaw = req.query.time_slot as string | undefined
  if (!date || !storeId) {
    return res.status(400).json({ error: 'date / store_id クエリパラメータが必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (db as any)
    .from('schedule_event_history')
    .select(SELECT_FIELDS)
    .eq('organization_id', user.orgId)
    .eq('event_date', date)
    .eq('store_id', storeId)

  if (timeSlotRaw === undefined || timeSlotRaw === 'null') {
    query = query.is('time_slot', null)
  } else {
    query = query.eq('time_slot', timeSlotRaw)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) {
    console.error('[event-history] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── POST: 履歴エントリを記録 ─────────────────────────────────────────────
async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = req.body ?? {}
  const {
    schedule_event_id,
    event_date,
    store_id,
    time_slot,
    action_type,
    changes,
    old_values,
    new_values,
    deleted_event_scenario,
    notes,
    changed_by_user_id,
    changed_by_staff_id,
    changed_by_name,
  } = body as {
    schedule_event_id?: string | null
    event_date?: string
    store_id?: string
    time_slot?: string | null
    action_type?: string
    changes?: Record<string, unknown>
    old_values?: Record<string, unknown> | null
    new_values?: Record<string, unknown> | null
    deleted_event_scenario?: string | null
    notes?: string | null
    changed_by_user_id?: string | null
    changed_by_staff_id?: string | null
    changed_by_name?: string | null
  }

  if (!event_date || !store_id || !action_type) {
    return res.status(400).json({ error: 'event_date / store_id / action_type が必要です' })
  }
  if (!ACTION_TYPES.has(action_type)) {
    return res.status(400).json({ error: `不明な action_type: ${action_type}` })
  }

  // 認証ユーザー以外のスタッフ ID は受け付けない（なりすまし防止）
  const safeChangedByUserId = changed_by_user_id ?? user.userId
  if (safeChangedByUserId && safeChangedByUserId !== user.userId) {
    return res.status(403).json({ error: 'changed_by_user_id は認証ユーザーと一致する必要があります' })
  }

  // 全 ownership/権限チェックを並列化 (sequential 3 クエリ → 1 ラウンドトリップ分に短縮)
  const checks: Promise<void>[] = [assertStoreOwnedByOrg(store_id, user.orgId)]
  if (schedule_event_id) {
    checks.push(assertScheduleEventOwnedByOrg(schedule_event_id, user.orgId))
  }
  if (changed_by_staff_id) {
    checks.push((async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: staffRow, error: staffErr } = await (db as any)
        .from('staff')
        .select('id, organization_id')
        .eq('id', changed_by_staff_id)
        .maybeSingle()
      if (staffErr) throw new ApiError(500, `staff 取得失敗: ${staffErr.message}`)
      if (!staffRow || staffRow.organization_id !== user.orgId) {
        throw new ApiError(403, 'changed_by_staff_id は自組織のスタッフである必要があります')
      }
    })())
  }
  try {
    await Promise.all(checks)
  } catch (e) {
    if (e instanceof ApiError) {
      return res.status(e.status).json({ error: e.message })
    }
    throw e
  }

  const entry = {
    schedule_event_id: schedule_event_id ?? null,
    organization_id: user.orgId,
    event_date,
    store_id,
    time_slot: time_slot ?? null,
    changed_by_user_id: safeChangedByUserId,
    changed_by_staff_id: changed_by_staff_id ?? null,
    changed_by_name: changed_by_name ?? null,
    action_type,
    changes: changes ?? {},
    old_values: old_values ?? null,
    new_values: new_values ?? null,
    deleted_event_scenario: deleted_event_scenario ?? null,
    notes: notes ?? null,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('schedule_event_history')
    .insert(entry)
    .select(SELECT_FIELDS)
    .single()
  if (error) {
    console.error('[event-history] insert error:', error)
    return res.status(500).json({ error: '履歴記録に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
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

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[event-history] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
