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

const SELECT_FIELDS =
  'id, staff_id, date, morning, afternoon, evening, all_day, submitted_at, status, organization_id, created_at, updated_at'

/** staff_id が自組織のものか検証 */
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

/** 複数 staff_id を一括検証 */
async function assertStaffIdsOwnedByOrg(staffIds: string[], orgId: string): Promise<void> {
  if (staffIds.length === 0) return
  const unique = Array.from(new Set(staffIds))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('staff')
    .select('id')
    .eq('organization_id', orgId)
    .in('id', unique)
  if (error) throw new ApiError(500, `staff 所有検証に失敗: ${error.message}`)
  const found = new Set((data ?? []).map((s: { id: string }) => s.id))
  for (const id of unique) {
    if (!found.has(id)) throw new ApiError(403, `staff ${id} は自組織のものではありません`)
  }
}

// ─── GET ────────────────────────────────────────────────────────────────────
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const dateQ = req.query.date as string | undefined
  // 単一日付の全スタッフのシフト（getByDate 相当）
  if (dateQ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: staffRows, error: staffError } = await (db as any)
      .from('staff')
      .select('id')
      .eq('organization_id', user.orgId)
    if (staffError) {
      return res.status(500).json({ error: 'staff 取得に失敗', detail: staffError.message })
    }
    const ids = (staffRows ?? []).map((s: { id: string }) => s.id)
    if (ids.length === 0) return res.status(200).json([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('shift_submissions')
      .select(SELECT_FIELDS)
      .eq('date', dateQ)
      .eq('status', 'submitted')
      .in('staff_id', ids)
    if (error) {
      return res.status(500).json({ error: 'データ取得に失敗', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  }

  const year = Number(req.query.year)
  const month = Number(req.query.month)
  const staffId = req.query.staff_id as string | undefined
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year/month または date クエリパラメータが必要です' })
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const daysInMonth = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  if (staffId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('shift_submissions')
      .select(SELECT_FIELDS)
      .eq('organization_id', user.orgId)
      .eq('staff_id', staffId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
    if (error) {
      console.error('[shifts] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staffRows, error: staffError } = await (db as any)
    .from('staff')
    .select('id')
    .eq('organization_id', user.orgId)
  if (staffError) {
    console.error('[shifts] staff DB error:', staffError)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: staffError.message })
  }
  const staffIds = (staffRows ?? []).map((s: { id: string }) => s.id)
  if (staffIds.length === 0) return res.status(200).json([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('shift_submissions')
    .select(SELECT_FIELDS)
    .gte('date', startDate)
    .lte('date', endDate)
    .in('staff_id', staffIds)
    .or('morning.eq.true,afternoon.eq.true,evening.eq.true,all_day.eq.true')
    .limit(10000)
    .order('date')
  if (error) {
    console.error('[shifts] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── POST: シフトを upsert ─────────────────────────────────────────────────
type ShiftInput = {
  id?: string
  staff_id: string
  date: string
  morning?: boolean
  afternoon?: boolean
  evening?: boolean
  all_day?: boolean
  status?: 'draft' | 'submitted' | 'approved' | 'rejected'
  submitted_at?: string | null
  notes?: string | null
}

function normalizeShiftRow(row: ShiftInput, orgId: string) {
  const base: Record<string, unknown> = {
    staff_id: row.staff_id,
    date: row.date,
    morning: row.morning ?? false,
    afternoon: row.afternoon ?? false,
    evening: row.evening ?? false,
    all_day: row.all_day ?? false,
    organization_id: orgId,
  }
  if (row.status !== undefined) base.status = row.status
  if (row.submitted_at !== undefined) base.submitted_at = row.submitted_at
  return base
}

async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = (req.query.action ?? req.body?.action) as string | undefined
  const body = req.body ?? {}

  if (action === 'submit_monthly') {
    const { staff_id, year, month } = body as { staff_id?: string; year?: number; month?: number }
    if (!staff_id || !Number.isInteger(year) || !Number.isInteger(month)) {
      return res.status(400).json({ error: 'staff_id / year / month が必要です' })
    }
    await assertStaffOwnedByOrg(staff_id, user.orgId)

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year as number, month as number, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from('shift_submissions')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('staff_id', staff_id)
      .eq('organization_id', user.orgId)
      .gte('date', startDate)
      .lte('date', endDate)
    if (error) {
      console.error('[shifts] submit_monthly error:', error)
      return res.status(500).json({ error: '月間シフト提出に失敗しました', detail: error.message })
    }
    return res.status(200).json({ ok: true })
  }

  // デフォルト action == 'upsert' or 'upsert_multiple'
  const rows: ShiftInput[] = Array.isArray(body.shifts)
    ? body.shifts
    : body.shift
      ? [body.shift]
      : Array.isArray(body)
        ? body
        : []
  if (rows.length === 0) {
    return res.status(400).json({ error: 'shift / shifts が必要です' })
  }
  for (const r of rows) {
    if (!r.staff_id || !r.date) return res.status(400).json({ error: 'staff_id / date が必要です' })
  }
  await assertStaffIdsOwnedByOrg(rows.map((r) => r.staff_id), user.orgId)

  const records = rows.map((r) => normalizeShiftRow(r, user.orgId))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('shift_submissions')
    .upsert(records, { onConflict: 'staff_id,date' })
    .select(SELECT_FIELDS)
  if (error) {
    console.error('[shifts] upsert error:', error)
    return res.status(500).json({ error: 'シフトの保存に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── PATCH: 承認 / 却下 ──────────────────────────────────────────────────
async function handlePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = req.body ?? {}
  const { id, action } = body as { id?: string; action?: 'approve' | 'reject'; notes?: string | null }
  if (!id || !action) return res.status(400).json({ error: 'id / action が必要です' })

  // id が自組織のシフトか検証
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: fetchError } = await (db as any)
    .from('shift_submissions')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) {
    return res.status(500).json({ error: 'シフト取得に失敗', detail: fetchError.message })
  }
  if (!existing) return res.status(404).json({ error: 'シフトが見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織のシフトは操作できません' })
  }

  const updates: Record<string, unknown> = {}
  if (action === 'approve') {
    updates.status = 'approved'
  } else if (action === 'reject') {
    updates.status = 'rejected'
    // notes 列は環境により存在しないため設定しない（互換性維持）
  } else {
    return res.status(400).json({ error: '不明な action: approve|reject のみ' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('shift_submissions')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', user.orgId)
  if (error) {
    console.error('[shifts] patch error:', error)
    return res.status(500).json({ error: '状態更新に失敗しました', detail: error.message })
  }
  return res.status(200).json({ ok: true })
}

// ─── DELETE ────────────────────────────────────────────────────────────────
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = (req.query.id ?? req.body?.id) as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: fetchError } = await (db as any)
    .from('shift_submissions')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return res.status(500).json({ error: 'シフト取得に失敗', detail: fetchError.message })
  if (!existing) return res.status(404).json({ error: 'シフトが見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織のシフトは削除できません' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('shift_submissions')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.orgId)
  if (error) {
    console.error('[shifts] delete error:', error)
    return res.status(500).json({ error: 'シフト削除に失敗しました', detail: error.message })
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
    console.error('[shifts] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
