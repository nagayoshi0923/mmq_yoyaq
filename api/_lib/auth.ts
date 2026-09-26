import type { VercelRequest } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { db, getMissingEnvError } from './db.js'

export type ApiRole = 'admin' | 'staff' | 'customer' | 'license_admin'

export type AuthUser = {
  userId: string
  orgId: string  // platform customer は '' (空文字)。スタッフ系ルートは requireStaff で別途チェック
  role: ApiRole
  /**
   * 元の JWT。SECURITY DEFINER な RPC で auth.uid() を必要とする場合、
   * createUserScopedClient(jwt) で user-scoped クライアントを作って渡す。
   */
  jwt: string
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * リクエストの Authorization ヘッダから JWT を検証し、
 * public.users テーブルから org_id と role を取得して返す。
 *
 * org_id はフロントから受け取らず必ず DB から取得する。
 */
export async function requireAuth(req: VercelRequest): Promise<AuthUser> {
  const authHeader = req.headers['authorization'] as string | undefined
  if (!authHeader?.startsWith('Bearer ')) {
    throw new ApiError(401, 'Authorization ヘッダが必要です')
  }

  const jwt = authHeader.slice(7)

  const envError = getMissingEnvError()
  if (envError || !db) throw new ApiError(500, `環境変数が未設定です: ${envError}`)

  // Supabase 側で署名検証・有効期限チェック
  const { data: { user }, error: authError } = await db.auth.getUser(jwt)
  if (authError || !user) {
    throw new ApiError(401, 'トークンが無効または期限切れです')
  }

  // org_id と role は必ず DB から取得（JWT クレームは信用しない）
  const { data: profile, error: profileError } = await db
    .from('users')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new ApiError(403, 'ユーザープロフィールが見つかりません')
  }

  // platform customer（role='customer' かつ organization_id=NULL）は許可
  if (!profile.organization_id && profile.role !== 'customer') {
    throw new ApiError(403, 'このユーザーは組織に属していません')
  }

  // 停止したスタッフは顧客として自分の予約へアクセスできるが、業務権限は使えない。
  // 休職中（on-leave）と、招待中などstaff行がまだない既存アカウントは区別する。
  let effectiveRole = profile.role as ApiRole
  if (effectiveRole === 'admin' || effectiveRole === 'staff') {
    const { data: staffRows, error: staffError } = await db
      .from('staff')
      .select('status')
      .eq('user_id', user.id)
      .eq('organization_id', profile.organization_id)
    if (staffError) throw new ApiError(503, 'スタッフの利用状態を確認できませんでした')
    if (staffRows?.length && staffRows.every(row => row.status === 'inactive' || row.status === 'resigned')) {
      effectiveRole = 'customer'
    }
  }

  return {
    userId: user.id,
    orgId: (profile.organization_id as string | null) ?? '',
    role: effectiveRole,
    jwt,
  }
}

export function requireStaff(user: AuthUser): void {
  if (!['admin', 'staff', 'license_admin'].includes(user.role)) {
    throw new ApiError(403, 'スタッフ以上の権限が必要です')
  }
}

export function requireAdmin(user: AuthUser): void {
  if (!['admin', 'license_admin'].includes(user.role)) {
    throw new ApiError(403, '管理者権限が必要です')
  }
}

export function requireLicenseAdmin(user: AuthUser): void {
  if (user.role !== 'license_admin') {
    throw new ApiError(403, 'ライセンス管理者権限が必要です')
  }
}

/**
 * ユーザー JWT を Authorization ヘッダにセットした Supabase クライアントを生成する。
 *
 * 用途:
 *   - SECURITY DEFINER な RPC（admin_update_reservation_fields 等）は
 *     内部で auth.uid() / get_user_organization_id() / is_org_admin() を参照する。
 *     service_role クライアントだと auth.uid() が NULL になり、組織境界チェックで弾かれる。
 *   - そのため、ユーザー文脈で RPC を呼ぶ必要があるときはこの user-scoped クライアントを使う。
 *
 * 注意:
 *   - RLS は通常通り効くので、SELECT 系で「自組織以外のレコードも見たい」場合は
 *     service_role クライアント（_lib/db.ts の db）を使うこと。
 *   - SECURITY DEFINER RPC は RLS をバイパスする（権限関数の中で auth.uid() を使うだけ）。
 */
export function createUserScopedClient(jwt: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  // service_role ではなく anon / publishable を使うことで JWT が尊重される
  const publicKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !publicKey) {
    throw new ApiError(
      500,
      'SUPABASE_URL / SUPABASE_(ANON|PUBLISHABLE)_KEY が設定されていません（user-scoped クライアントを作れません）',
    )
  }
  return createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  })
}
