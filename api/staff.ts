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
  'role', 'stores', 'ng_days', 'want_to_learn',
  'notes', 'phone', 'email', 'user_id', 'availability', 'experience',
  'status', 'avatar_url', 'avatar_color',
] as const

// 更新可能フィールドのホワイトリスト（Mass Assignment 防止）
// special_scenarios / available_scenarios は書かない。正本は staff_scenario_assignments。
const STAFF_UPDATABLE_FIELDS = [
  'name', 'line_name', 'x_account', 'discord_user_id', 'discord_channel_id',
  'role', 'stores', 'ng_days', 'want_to_learn',
  'notes', 'phone', 'email', 'availability', 'experience',
  'status', 'avatar_url', 'avatar_color',
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
      if (targetKey === 'status') {
        const status = src[key] === 'on_leave' ? 'on-leave' : src[key]
        if (typeof status !== 'string' || !['active','inactive','on-leave','resigned'].includes(status)) throw new ApiError(400, 'スタッフの利用状態が不正です')
        out[targetKey] = status
      } else out[targetKey] = src[key]
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

// プロフィールと担当の両方を、既存の認可検査を通した後で一括保存する。
async function saveEditor(req: VercelRequest, res: VercelResponse, user: AuthUser, id: string | null, profile: Record<string, unknown>, oldName?: string) {
  const edit = req.body?.assignment_edit
  if (!edit || !Array.isArray(edit.records) || !Array.isArray(edit.baseline)) {
    return res.status(400).json({ error: '担当の保存形式が不正です' })
  }
  const { data, error } = await db!.rpc('save_staff_editor_atomic', {
    p_org: user.orgId, p_staff: id, p_profile: profile, p_edit: edit,
    p_confirm: req.body?.confirm_clear === true, p_actor: user.userId,
  })
  if (error) {
    if (error.code === 'P0101') {
      return res.status(409).json({ ...JSON.parse(error.details || '{}'), message: '担当が減ります。変更内容を確認してください。' })
    }
    console.error('[staff:saveEditor] transaction failed', { code: error.code, message: error.message })
    const conflict = error.code === '40001' || error.code === '23503'
    return res.status(conflict ? 409 : error.code === '22023' || error.code === '22P02' ? 400 : 500)
      .json({ error: conflict ? 'ASSIGNMENTS_CHANGED' : 'STAFF_SAVE_FAILED', message: conflict ? '担当情報が変更されました。開き直してから保存してください。' : 'スタッフ情報と担当の保存を確認できませんでした。画面を開き直して現在の状態を確認してください。' })
  }
  if (!data || typeof data !== 'object' || !('id' in data)) return res.status(500).json({ error: '保存結果を確認できませんでした' })
  const row = data as Record<string, unknown>
  if (id && oldName && typeof profile.name === 'string' && profile.name !== oldName) {
    await syncRenamedStaffReferences(db, user.orgId, oldName, profile.name)
  }
  const visible = Object.fromEntries(STAFF_SELECT_FIELDS.split(', ').map(field => {
    const [alias, column] = field.split(':')
    return [alias, row[column || alias]]
  }))
  return res.status(id ? 200 : 201).json(visible)
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
      .select('id, organization_id, role')
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

  if (body.assignment_edit !== undefined) return saveEditor(req, res, user, null, insertRow)

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

  if (action === 'linkAccount') {
    requireAdmin(user)
    const targetUserId = body.user_id
    if (targetUserId !== null && (typeof targetUserId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId))) {
      return res.status(400).json({ error: '連携先アカウントが不正です' })
    }
    if (body.email !== undefined && (typeof body.email !== 'string' || body.email.length > 320)) {
      return res.status(400).json({ error: 'メールアドレスが不正です' })
    }
    const { error: linkError } = await database.rpc('admin_link_staff_account', {
      p_actor_id: user.userId, p_staff_id: id, p_user_id: targetUserId, p_email: body.email ?? null,
    })
    if (linkError) {
      console.error('[staff:linkAccount] transaction failed:', linkError)
      return res.status(linkError.code === '42501' ? 403 : linkError.code === '23505' ? 409 : 500)
        .json({ error: 'アカウント連携を保存できませんでした。変更は反映されていません。' })
    }
    return res.status(200).json({ id })
  }

  // ─── action=updateSpecialScenarios（廃止。正本は /api/assignments）
  if (action === 'updateSpecialScenarios') {
    return res.status(410).json({
      error: '担当シナリオは /api/assignments で更新してください。staff.special_scenarios への書き込みは廃止しました。',
    })
  }

  // ─── 通常の update
  const renameMap: Record<string, string> = { discord_id: 'discord_user_id' }
  const updateRow = pickFields(body, STAFF_UPDATABLE_FIELDS, renameMap)

  // role / 利用状態の変更は admin のみ
  if ('role' in updateRow || 'status' in updateRow) {
    requireAdmin(user)
  }

  // ─── user_id（アカウント紐付け/解除）は権限操作として個別に処理する
  //     Mass Assignment 防止のため updatable whitelist には含めず、ここで明示的に検証・付与する。
  if ('user_id' in body) {
    const rawUserId = body.user_id
    const newUserId = typeof rawUserId === 'string' && rawUserId.length > 0 ? rawUserId : null
    const oldUserId = (existing.user_id as string | null) || null
    if (newUserId !== oldUserId) {
      // 紐付け/解除は権限操作。role 変更と同様に admin のみ許可する。
      requireAdmin(user)
      if (newUserId) {
        // 紐付け先ユーザーの検証（create 側の越境チェックと同じ）
        const { data: targetUser, error: targetErr } = await database
          .from('users')
          .select('id, role, organization_id')
          .eq('id', newUserId)
          .maybeSingle()
        if (targetErr) {
          console.error('[staff:update] user lookup error:', targetErr)
          return res.status(500).json({ error: 'ユーザー情報の確認に失敗しました' })
        }
        if (!targetUser) {
          return res.status(400).json({ error: '指定された user_id のユーザーが存在しません' })
        }
        if (targetUser.organization_id && targetUser.organization_id !== user.orgId) {
          return res.status(403).json({ error: '他組織のユーザーをスタッフとして登録できません' })
        }
      }
      // staff.user_id 自体の更新を反映（whitelist 外なので明示的に付与）
      updateRow.user_id = newUserId
    }
  }

  if (Object.keys(updateRow).length === 0) {
    return res.status(400).json({ error: '更新可能なフィールドがありません' })
  }

  if (body.assignment_edit !== undefined) return saveEditor(req, res, user, id, updateRow, existing.name)

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
    if (error.code === '23503') return res.status(409).json({ error: '公演などの記録があるスタッフは削除できません。在籍状態を非アクティブに変更してください。' })
    console.error('[staff:delete] DB error:', error)
    return res.status(500).json({ error: 'スタッフの削除に失敗しました', detail: error.message })
  }
  return res.status(204).end()
}

// ─── helpers ─────────────────────────────────────────────────────────────────
async function syncRenamedStaffReferences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
  orgId: string,
  oldName: string,
  newName: string,
) {
  // 公演の名前と役割はDBトリガーでスタッフ改名と同時に更新する。

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
            const { data: updateResult, error: updateError } = await database.rpc('admin_update_reservation_fields', {
              p_reservation_id: r.id,
              p_updates: updates,
            })
            if (updateError) {
              console.error('[staff:syncRenamed] reservation RPC error:', {
                reservationId: r.id,
                error: updateError,
              })
              return
            }
            if (
              typeof updateResult === 'object'
              && updateResult !== null
              && (updateResult as { success?: boolean }).success === false
            ) {
              console.error('[staff:syncRenamed] reservation RPC rejected:', {
                reservationId: r.id,
                error: (updateResult as { error?: string }).error ?? 'unknown error',
              })
            }
          },
        ),
      )
    }
  } catch (e) {
    console.warn('[staff:syncRenamed] reservations sync warn:', e)
  }
}
