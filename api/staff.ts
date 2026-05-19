import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, requireAdmin, ApiError, type AuthUser } from './_lib/auth.js'

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

// DB側は discord_user_id。フロントの既存実装（discord_id）に合わせて alias する。
const STAFF_SELECT_FIELDS =
  'id, organization_id, name, line_name, x_account, discord_id:discord_user_id, discord_channel_id, role, stores, ng_days, want_to_learn, available_scenarios, notes, phone, email, user_id, availability, experience, special_scenarios, status, avatar_url, avatar_color, created_at, updated_at'

// 作成可能フィールドのホワイトリスト（Mass Assignment 防止）
const STAFF_CREATABLE_FIELDS = [
  'name', 'line_name', 'x_account', 'discord_user_id', 'discord_channel_id',
  'role', 'stores', 'ng_days', 'want_to_learn', 'available_scenarios',
  'notes', 'phone', 'email', 'user_id', 'availability', 'experience',
  'special_scenarios', 'status', 'avatar_url', 'avatar_color',
] as const

// 更新可能フィールドのホワイトリスト（Mass Assignment 防止）
const STAFF_UPDATABLE_FIELDS = [
  'name', 'line_name', 'x_account', 'discord_user_id', 'discord_channel_id',
  'role', 'stores', 'ng_days', 'want_to_learn', 'available_scenarios',
  'notes', 'phone', 'email', 'availability', 'experience',
  'special_scenarios', 'status', 'avatar_url', 'avatar_color',
] as const

function pickFields<T extends readonly string[]>(
  src: Record<string, unknown>,
  allowed: T,
  renameMap?: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(src)) {
    const targetKey = renameMap?.[key] ?? key
    if ((allowed as readonly string[]).includes(targetKey)) {
      out[targetKey] = src[key]
    }
  }
  return out
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
    console.error('[staff] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  const userId = req.query.user_id as string | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  if (id) {
    const { data, error } = await database
      .from('staff')
      .select(STAFF_SELECT_FIELDS)
      .eq('id', id)
      .eq('organization_id', user.orgId)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') {
      console.error('[staff:getById] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? null)
  }

  if (userId) {
    const { data, error } = await database
      .from('staff')
      .select(STAFF_SELECT_FIELDS)
      .eq('user_id', userId)
      .eq('organization_id', user.orgId)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') {
      console.error('[staff:getByUserId] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? null)
  }

  const { data, error } = await database
    .from('staff')
    .select(STAFF_SELECT_FIELDS)
    .eq('organization_id', user.orgId)
    .order('name', { ascending: true })

  if (error) {
    console.error('[staff] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── POST: スタッフ作成（admin 専用）────────────────────────────────────────
async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireAdmin(user)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const body = (req.body ?? {}) as Record<string, unknown>

  // discord_id → discord_user_id への alias を解決
  const renameMap: Record<string, string> = { discord_id: 'discord_user_id' }
  const insertRow = pickFields(body, STAFF_CREATABLE_FIELDS, renameMap)

  // 名前は必須
  if (!insertRow.name || typeof insertRow.name !== 'string') {
    return res.status(400).json({ error: 'name は必須です' })
  }

  // user_id を指定する場合、自組織のユーザーかチェック（別組織のユーザーを strap しない）
  if (insertRow.user_id) {
    if (typeof insertRow.user_id !== 'string') {
      return res.status(400).json({ error: 'user_id が不正です' })
    }
    const { data: targetUser, error: userErr } = await database
      .from('users')
      .select('id, organization_id')
      .eq('id', insertRow.user_id)
      .maybeSingle()
    if (userErr) {
      console.error('[staff:create] user lookup error:', userErr)
      return res.status(500).json({ error: 'ユーザー情報の確認に失敗しました' })
    }
    if (!targetUser) {
      return res.status(400).json({ error: '指定された user_id のユーザーが存在しません' })
    }
    if (targetUser.organization_id && targetUser.organization_id !== user.orgId) {
      return res.status(403).json({ error: '他組織のユーザーをスタッフとして登録できません' })
    }
  }

  // organization_id はサーバー側で強制（フロントからの上書きを許可しない）
  insertRow.organization_id = user.orgId

  const { data, error } = await database
    .from('staff')
    .insert([insertRow])
    .select(STAFF_SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[staff:create] DB error:', error)
    return res.status(500).json({ error: 'スタッフの作成に失敗しました', detail: error.message })
  }
  return res.status(201).json(data)
}

// ─── PATCH: スタッフ更新 ─────────────────────────────────────────────────────
async function handlePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  const action = req.query.action as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 自組織のスタッフであることを必ず確認
  const { data: existing, error: existingErr } = await database
    .from('staff')
    .select('id, organization_id, name, user_id')
    .eq('id', id)
    .maybeSingle()
  if (existingErr) {
    console.error('[staff:update] existing lookup error:', existingErr)
    return res.status(500).json({ error: 'スタッフ情報の確認に失敗しました' })
  }
  if (!existing) return res.status(404).json({ error: 'スタッフが見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織のスタッフは編集できません' })
  }

  const body = (req.body ?? {}) as Record<string, unknown>

  // ─── action=updateSpecialScenarios（担当シナリオ + organization_scenarios.available_gms 同期）
  if (action === 'updateSpecialScenarios') {
    const special = body.special_scenarios
    if (!Array.isArray(special) || !special.every((s) => typeof s === 'string')) {
      return res.status(400).json({ error: 'special_scenarios は string[] 必須です' })
    }
    return await handleUpdateSpecialScenarios(res, database, user.orgId, id, existing.name, special)
  }

  // ─── 通常の update
  const renameMap: Record<string, string> = { discord_id: 'discord_user_id' }
  const updateRow = pickFields(body, STAFF_UPDATABLE_FIELDS, renameMap)

  // role 変更は admin のみ
  if ('role' in updateRow) {
    requireAdmin(user)
  }

  if (Object.keys(updateRow).length === 0) {
    return res.status(400).json({ error: '更新可能なフィールドがありません' })
  }

  const { data, error } = await database
    .from('staff')
    .update(updateRow)
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .select(STAFF_SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[staff:update] DB error:', error)
    return res.status(500).json({ error: 'スタッフの更新に失敗しました', detail: error.message })
  }

  // ─── 名前変更時の副作用: schedule_events.gms / reservations.assigned_staff・gm_staff の同期
  const newName = typeof updateRow.name === 'string' ? updateRow.name : null
  const oldName = existing.name as string | null
  if (newName && oldName && newName !== oldName) {
    await syncRenamedStaffReferences(database, user.orgId, oldName, newName)
  }

  // ─── role 変更時の副作用: users.role の同期
  if ('role' in updateRow && existing.user_id) {
    await syncStaffRoleToUser(database, existing.user_id as string, updateRow.role)
  }

  return res.status(200).json(data)
}

// ─── DELETE: スタッフ削除（admin 専用）───────────────────────────────────────
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireAdmin(user)

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 自組織のスタッフであることを必ず確認
  const { data: existing, error: existingErr } = await database
    .from('staff')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (existingErr) {
    console.error('[staff:delete] existing lookup error:', existingErr)
    return res.status(500).json({ error: 'スタッフ情報の確認に失敗しました' })
  }
  if (!existing) return res.status(404).json({ error: 'スタッフが見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織のスタッフは削除できません' })
  }

  const { error } = await database
    .from('staff')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.orgId)

  if (error) {
    console.error('[staff:delete] DB error:', error)
    return res.status(500).json({ error: 'スタッフの削除に失敗しました', detail: error.message })
  }
  return res.status(204).end()
}

// ─── helpers ─────────────────────────────────────────────────────────────────
async function handleUpdateSpecialScenarios(
  res: VercelResponse,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
  orgId: string,
  staffId: string,
  staffName: string,
  specialScenarios: string[],
) {
  // 1. スタッフの special_scenarios を更新
  const { data: updatedStaff, error: updErr } = await database
    .from('staff')
    .update({ special_scenarios: specialScenarios })
    .eq('id', staffId)
    .eq('organization_id', orgId)
    .select(STAFF_SELECT_FIELDS)
    .single()

  if (updErr) {
    console.error('[staff:updateSpecialScenarios] DB error:', updErr)
    return res.status(500).json({ error: '担当シナリオの更新に失敗しました', detail: updErr.message })
  }

  // 2. 自組織のシナリオを取得して available_gms を同期
  const { data: scenarios, error: scErr } = await database
    .from('organization_scenarios')
    .select('id, scenario_master_id, available_gms')
    .eq('organization_id', orgId)

  if (scErr) {
    console.error('[staff:updateSpecialScenarios] scenarios fetch error:', scErr)
    // 部分成功: スタッフ自体は更新済みなので 200 で返す
    return res.status(200).json(updatedStaff)
  }

  const updatePromises = (scenarios ?? []).map(
    async (s: { id: string; scenario_master_id: string; available_gms: string[] | null }) => {
      const current: string[] = s.available_gms ?? []
      const shouldHaveStaff = specialScenarios.includes(s.scenario_master_id)
      const hasStaff = current.includes(staffName)
      let next: string[] = current
      if (shouldHaveStaff && !hasStaff) next = [...current, staffName]
      else if (!shouldHaveStaff && hasStaff) next = current.filter((g) => g !== staffName)
      else return
      if (JSON.stringify([...next].sort()) === JSON.stringify([...current].sort())) return
      await database
        .from('organization_scenarios')
        .update({ available_gms: next })
        .eq('id', s.id)
        .eq('organization_id', orgId)
    },
  )
  await Promise.all(updatePromises)

  return res.status(200).json(updatedStaff)
}

async function syncRenamedStaffReferences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
  orgId: string,
  oldName: string,
  newName: string,
) {
  // schedule_events.gms 配列の同期
  try {
    const { data: events } = await database
      .from('schedule_events')
      .select('id, gms')
      .eq('organization_id', orgId)
      .contains('gms', [oldName])
    if (events && events.length > 0) {
      await Promise.all(
        events.map((ev: { id: string; gms: string[] | null }) => {
          const nextGms = (ev.gms ?? []).map((g) => (g === oldName ? newName : g))
          return database
            .from('schedule_events')
            .update({ gms: nextGms })
            .eq('id', ev.id)
            .eq('organization_id', orgId)
        }),
      )
    }
  } catch (e) {
    console.warn('[staff:syncRenamed] schedule_events sync warn:', e)
  }

  // reservations.assigned_staff / gm_staff の同期
  try {
    // PostgREST フィルタ用のサニタイズ（カンマ・括弧・ダブルクオートのみエスケープ）
    const safe = oldName.replace(/[",()]/g, ' ')
    const { data: reservations } = await database
      .from('reservations')
      .select('id, assigned_staff, gm_staff')
      .eq('organization_id', orgId)
      .or(`assigned_staff.cs.{${safe}},gm_staff.eq.${safe}`)
    if (reservations && reservations.length > 0) {
      await Promise.all(
        reservations.map(
          async (r: { id: string; assigned_staff: string[] | null; gm_staff: string | null }) => {
            const updates: Record<string, unknown> = {}
            if (r.assigned_staff && r.assigned_staff.includes(oldName)) {
              updates.assigned_staff = r.assigned_staff.map((s) => (s === oldName ? newName : s))
            }
            if (r.gm_staff === oldName) {
              updates.gm_staff = newName
            }
            if (Object.keys(updates).length === 0) return
            await database.rpc('admin_update_reservation_fields', {
              p_reservation_id: r.id,
              p_updates: updates,
            })
          },
        ),
      )
    }
  } catch (e) {
    console.warn('[staff:syncRenamed] reservations sync warn:', e)
  }
}

async function syncStaffRoleToUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
  userId: string,
  role: unknown,
) {
  const roles = Array.isArray(role) ? role : [role]
  const isAdmin = roles.some((r) => r === 'admin' || r === '管理者')
  const userRole = isAdmin ? 'admin' : 'staff'

  try {
    const { data: existingUser } = await database
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    // 既存が admin で、更新後が staff なら降格しない
    if (existingUser?.role === 'admin' && userRole === 'staff') return
    await database
      .from('users')
      .update({ role: userRole, updated_at: new Date().toISOString() })
      .eq('id', userId)
  } catch (e) {
    console.warn('[staff:syncRole] users.role sync warn:', e)
  }
}
