/**
 * Edge Functions 共通セキュリティヘルパー
 * 認証チェック、CORS設定、ログマスキングなどを提供
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 許可するオリジン（本番環境用）
export const ALLOWED_ORIGINS = [
  'https://mmq-yoyaq.vercel.app',
  'https://mmq-yoyaq-git-main-nagayoshi0923s-projects.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

/**
 * CORSヘッダーを生成
 * @param origin リクエストのOriginヘッダー
 * @returns CORSヘッダーオブジェクト
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

/**
 * メールアドレスをマスキング
 * 例: "example@gmail.com" → "ex***@gmail.com"
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***'
  const [local, domain] = email.split('@')
  const maskedLocal = local.length > 2 ? local.slice(0, 2) + '***' : '***'
  return `${maskedLocal}@${domain}`
}

/**
 * 名前をマスキング
 * 例: "山田太郎" → "山***"
 */
export function maskName(name: string): string {
  if (!name || name.length === 0) return '***'
  return name.slice(0, 1) + '***'
}

/**
 * 電話番号をマスキング
 * 例: "090-1234-5678" → "090-****-5678"
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return '***'
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

/**
 * 認証結果の型定義
 */
export interface AuthResult {
  success: boolean
  user?: {
    id: string
    email: string | undefined
    role: string
  }
  error?: string
  statusCode?: number
}

/**
 * 呼び出し元ユーザーの認証と権限を検証
 * @param req リクエストオブジェクト
 * @param requiredRoles 必要なロールの配列（省略時は認証のみ確認）
 * @returns 認証結果
 */
export async function verifyAuth(
  req: Request,
  requiredRoles?: string[]
): Promise<AuthResult> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return {
      success: false,
      error: '認証が必要です',
      statusCode: 401,
    }
  }

  try {
    // 呼び出し元ユーザーの認証を検証
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    })
    
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    
    if (authError || !user) {
      return {
        success: false,
        error: '認証に失敗しました',
        statusCode: 401,
      }
    }

    // ロールが必要な場合は確認
    if (requiredRoles && requiredRoles.length > 0) {
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const { data: userData, error: userError } = await serviceClient
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (userError || !userData) {
        return {
          success: false,
          error: 'ユーザー情報の取得に失敗しました',
          statusCode: 403,
        }
      }

      if (!requiredRoles.includes(userData.role)) {
        console.warn('⚠️ 権限エラー: ユーザー', maskEmail(user.email || ''), 'は必要な権限がありません')
        return {
          success: false,
          error: '必要な権限がありません',
          statusCode: 403,
        }
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          role: userData.role,
        },
      }
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: 'unknown',
      },
    }
  } catch (error: unknown) {
    console.error('認証エラー:', error)
    return {
      success: false,
      error: '認証処理でエラーが発生しました',
      statusCode: 500,
    }
  }
}

/**
 * エラーレスポンスを生成
 */
export function errorResponse(
  error: string,
  statusCode: number,
  headers: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ success: false, error }),
    { status: statusCode, headers }
  )
}

/**
 * 成功レスポンスを生成
 */
export function successResponse(
  data: Record<string, unknown>,
  headers: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    { status: 200, headers }
  )
}



