import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, ApiError, type AuthUser } from './_lib/auth.js'

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

const INVITATION_FIELDS = `
  id,
  organization_id,
  email,
  name,
  role,
  token,
  expires_at,
  accepted_at,
  staff_id,
  created_by,
  created_at,
  updated_at,
  organization:organizations(id, name, slug, plan)
`

function isAdminUser(user: AuthUser): boolean {
  // 招待管理は組織の admin のみ
  return user.role === 'admin'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    // 公開エンドポイント（トークン検証ベース、認証不要）
    if (req.method === 'GET' && req.query.token) {
      return await handleGetByToken(res, req.query.token as string)
    }
    if (req.method === 'POST' && req.query.action === 'accept') {
      return await handleAccept(req, res)
    }

    // ここからは認証必須
    const user = await requireAuth(req)

    if (req.method === 'GET') {
      return await handleListByOrg(res, user)
    }
    if (req.method === 'POST') {
      const action = (req.query.action as string | undefined) ?? 'create'
      if (action === 'create') return await handleCreate(req, res, user)
      return res.status(400).json({ error: `unknown action: ${action}` })
    }
    if (req.method === 'PATCH') {
      const action = (req.query.action as string | undefined) ?? 'resend'
      const id = req.query.id as string | undefined
      if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })
      if (action === 'resend') return await handleResend(res, user, id)
      return res.status(400).json({ error: `unknown action: ${action}` })
    }
    if (req.method === 'DELETE') {
      const id = req.query.id as string | undefined
      if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })
      return await handleDelete(res, user, id)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[invitations] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// 公開: トークンで招待を取得（受諾画面用）
// 未ログインユーザがアクセスするため認証不要。
// トークン自体が秘密情報なので、トークンを知っているクライアントだけ閲覧可能。
async function handleGetByToken(res: VercelResponse, token: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_invitations')
    .select(INVITATION_FIELDS)
    .eq('token', token)
    .maybeSingle()

  if (error) {
    console.error('[invitations:byToken] DB error:', error)
    return res.status(500).json({ error: '招待の取得に失敗しました', detail: error.message })
  }
  if (!data) return res.status(404).json({ error: '招待が見つかりません' })
  return res.status(200).json(data)
}

// 自組織の招待一覧（admin のみ）
async function handleListByOrg(res: VercelResponse, user: AuthUser) {
  if (!isAdminUser(user)) {
    return res.status(403).json({ error: '管理者権限が必要です' })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_invitations')
    .select(INVITATION_FIELDS)
    .eq('organization_id', user.orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[invitations:list] DB error:', error)
    return res.status(500).json({ error: '招待一覧の取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// 招待を作成（admin のみ、必ず自組織として）
async function handleCreate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (!isAdminUser(user)) {
    return res.status(403).json({ error: '管理者権限が必要です' })
  }

  const body = req.body as {
    email?: string
    name?: string
    role?: string[]
  }
  const email = (body.email ?? '').toLowerCase().trim()
  const name = (body.name ?? '').trim()
  if (!email || !name) {
    return res.status(400).json({ error: 'email, name は必須です' })
  }

  // マルチテナント境界:
  // - organization_id は必ず JWT 経由のユーザ所属組織を使用（フロントから受け取らない）
  // - created_by は JWT の userId を使用
  const token = crypto.randomUUID() + '-' + Date.now().toString(36)
  const expires_at = new Date()
  expires_at.setDate(expires_at.getDate() + 7)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_invitations')
    .insert({
      organization_id: user.orgId, // JWT 経由で強制
      email,
      name,
      role: body.role ?? ['スタッフ'],
      token,
      expires_at: expires_at.toISOString(),
      created_by: user.userId,
    })
    .select(INVITATION_FIELDS)
    .single()

  if (error) {
    console.error('[invitations:create] DB error:', error)
    return res.status(500).json({ error: '招待の作成に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// 招待を再送信（admin のみ、自組織のものに限る）
async function handleResend(res: VercelResponse, user: AuthUser, id: string) {
  if (!isAdminUser(user)) {
    return res.status(403).json({ error: '管理者権限が必要です' })
  }

  // 所属組織を検証
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: lookupErr } = await (db as any)
    .from('organization_invitations')
    .select('id, organization_id, accepted_at')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr) {
    console.error('[invitations:resend] lookup error:', lookupErr)
    return res.status(500).json({ error: '招待の取得に失敗しました' })
  }
  if (!existing) return res.status(404).json({ error: '招待が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の招待は操作できません' })
  }
  if (existing.accepted_at) {
    return res.status(409).json({ error: 'この招待は既に受諾済みです' })
  }

  const token = crypto.randomUUID() + '-' + Date.now().toString(36)
  const expires_at = new Date()
  expires_at.setDate(expires_at.getDate() + 7)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('organization_invitations')
    .update({
      token,
      expires_at: expires_at.toISOString(),
    })
    .eq('id', id)
    .select(INVITATION_FIELDS)
    .single()

  if (error) {
    console.error('[invitations:resend] DB error:', error)
    return res.status(500).json({ error: '招待の再送信に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// 招待を削除（admin のみ、自組織のものに限る）
async function handleDelete(res: VercelResponse, user: AuthUser, id: string) {
  if (!isAdminUser(user)) {
    return res.status(403).json({ error: '管理者権限が必要です' })
  }

  // 所属組織を検証
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: lookupErr } = await (db as any)
    .from('organization_invitations')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr) {
    console.error('[invitations:delete] lookup error:', lookupErr)
    return res.status(500).json({ error: '招待の取得に失敗しました' })
  }
  if (!existing) return res.status(404).json({ error: '招待が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の招待は削除できません' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('organization_invitations')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[invitations:delete] DB error:', error)
    return res.status(500).json({ error: '招待の削除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ success: true })
}

// 公開: 招待を受諾（パスワード設定 & ユーザー作成）
// 未ログインユーザがアクセスするため認証不要。
// token によりサーバ側で招待を検証する。
async function handleAccept(req: VercelRequest, res: VercelResponse) {
  const body = req.body as { token?: string; password?: string }
  const token = (body.token ?? '').trim()
  const password = body.password ?? ''

  if (!token || !password) {
    return res.status(400).json({ error: 'token と password は必須です' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'パスワードは8文字以上で入力してください' })
  }

  if (!db) return res.status(500).json({ error: 'DB unavailable' })

  // 1. アトミックに招待を受諾（accept_invitation_atomic RPC）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: atomicResult, error: atomicError } = await (db as any).rpc(
    'accept_invitation_atomic',
    { p_token: token }
  )

  if (atomicError) {
    console.error('[invitations:accept] atomic error:', atomicError)
    return res.status(500).json({ success: false, error: '招待の処理中にエラーが発生しました' })
  }

  const invitationResult = Array.isArray(atomicResult) ? atomicResult[0] : atomicResult
  if (!invitationResult?.success) {
    return res.status(400).json({
      success: false,
      error: invitationResult?.error_message ?? '招待の受諾に失敗しました',
    })
  }

  // 2. 招待詳細を取得（受諾時に name などを使うため）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invitation } = await (db as any)
    .from('organization_invitations')
    .select('id, email, name, role, organization_id')
    .eq('token', token)
    .maybeSingle()

  const invitationData = invitation ?? {
    id: invitationResult.id,
    email: invitationResult.email,
    role: invitationResult.role,
    organization_id: invitationResult.organization_id,
    name: '',
  }

  // 3. Supabase Auth でユーザを作成（service_role なので admin.createUser を使う）
  // メール検証無しで作成する（招待リンク経由＝メール確認済みとみなす）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: authData, error: authError } = await (db as any).auth.admin.createUser({
    email: invitationData.email,
    password,
    email_confirm: true,
  })

  if (authError) {
    const msg = (authError as { message?: string }).message ?? ''
    if (msg.includes('already registered') || msg.toLowerCase().includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: 'このメールアドレスは既に登録されています。ログインしてください。',
      })
    }
    console.error('[invitations:accept] auth createUser error:', authError)
    return res.status(500).json({ success: false, error: msg || 'ユーザの作成に失敗しました' })
  }

  const userId = authData?.user?.id
  if (!userId) {
    return res.status(500).json({ success: false, error: 'ユーザの作成に失敗しました' })
  }

  // 4. users テーブルにレコードを作成
  const roleArray = Array.isArray(invitationData.role) ? invitationData.role : []
  const userRole = roleArray.some((r: string) => r.includes('管理者')) ? 'admin' : 'staff'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: userError } = await (db as any).from('users').upsert(
    {
      id: userId,
      email: invitationData.email,
      role: userRole,
      organization_id: invitationData.organization_id, // 招待の組織を強制
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (userError) {
    console.error('[invitations:accept] user upsert error:', userError)
  }

  // 5. staff テーブルにレコードを作成
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staffData, error: staffError } = await (db as any)
    .from('staff')
    .insert({
      name: invitationData.name || invitationData.email?.split('@')[0] || '',
      email: invitationData.email,
      user_id: userId,
      organization_id: invitationData.organization_id, // 招待の組織を強制
      role: invitationData.role,
      status: 'active',
      stores: [],
      ng_days: [],
      want_to_learn: [],
      available_scenarios: [],
      availability: [],
      experience: 0,
      special_scenarios: [],
    })
    .select()
    .single()

  if (staffError) {
    console.error('[invitations:accept] staff insert error:', staffError)
    // スタッフ作成失敗でも続行（後で修正可能）
  }

  // 6. 招待に staff_id を紐付け
  if (staffData?.id && invitationData.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: linkError } = await (db as any)
      .from('organization_invitations')
      .update({ staff_id: staffData.id })
      .eq('id', invitationData.id)
    if (linkError) {
      console.error('[invitations:accept] link staff error:', linkError)
    }
  }

  return res.status(200).json({ success: true })
}
