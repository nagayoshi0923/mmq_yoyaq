import type { VercelRequest } from '@vercel/node'
import { db } from './db'

export type ApiRole = 'admin' | 'staff' | 'customer' | 'license_admin'

export type AuthUser = {
  userId: string
  orgId: string
  role: ApiRole
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

  if (!profile.organization_id) {
    throw new ApiError(403, 'このユーザーは組織に属していません')
  }

  return {
    userId: user.id,
    orgId: profile.organization_id as string,
    role: profile.role as ApiRole,
  }
}

export function requireStaff(user: AuthUser): void {
  if (!['admin', 'staff', 'license_admin'].includes(user.role)) {
    throw new ApiError(403, 'スタッフ以上の権限が必要です')
  }
}

export function requireLicenseAdmin(user: AuthUser): void {
  if (user.role !== 'license_admin') {
    throw new ApiError(403, 'ライセンス管理者権限が必要です')
  }
}
