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
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : null
  return {
    'Content-Type': 'application/json',
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

/**
 * 文字列の（概ね）定数時間比較
 * - 長さの違いで早期returnしない
 * - service role key のような固定長トークン比較用途
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a || '')
  const bBytes = new TextEncoder().encode(b || '')

  const len = Math.max(aBytes.length, bBytes.length)
  let diff = aBytes.length ^ bBytes.length
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0)
  }
  return diff === 0
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

/**
 * 🔒 エラーメッセージをサニタイズ
 * 技術的詳細を含むメッセージを、ユーザーフレンドリーな汎用メッセージに変換
 * 
 * @param error 元のエラー
 * @param defaultMessage デフォルトのエラーメッセージ
 * @returns サニタイズされたメッセージ
 */
export function sanitizeErrorMessage(
  error: unknown,
  defaultMessage = 'エラーが発生しました'
): string {
  // 安全なメッセージのパターン（日本語のみ許可）
  const safePatterns: Array<[RegExp, string]> = [
    [/満席/i, 'この公演は満席です'],
    [/空席がありません/i, '選択した人数分の空席がありません'],
    [/公演が見つかりません/i, '公演が見つかりませんでした'],
    [/予約が見つかりません/i, '予約が見つかりませんでした'],
    [/参加人数が不正/i, '参加人数が不正です'],
    [/権限がありません/i, 'この操作を実行する権限がありません'],
    [/認証が必要/i, 'ログインが必要です'],
    [/認証に失敗/i, 'ログインに失敗しました'],
    [/メール送信サービスが設定されていません/i, 'メール送信サービスが設定されていません'],
    [/キャンセル待ちリストの取得に失敗/i, 'キャンセル待ちリストの取得に失敗しました'],
  ]

  const errorMessage = error instanceof Error ? error.message : String(error)

  // 安全なパターンに一致するか確認
  for (const [pattern, safeMessage] of safePatterns) {
    if (pattern.test(errorMessage)) {
      return safeMessage
    }
  }

  // 技術的な詳細を含む可能性がある場合はデフォルトメッセージを返す
  // PostgreSQLエラーコード、スタックトレース、テーブル名などを含む場合
  const technicalPatterns = [
    /PGRST\d+/i,          // Supabase REST APIエラー
    /P\d{4}/i,            // PostgreSQLエラーコード
    /relation ".+" does not exist/i,
    /column ".+" does not exist/i,
    /duplicate key/i,
    /violates .+ constraint/i,
    /syntax error/i,
    /at line \d+/i,
    /JSON\.stringify/i,
    /\{.*statusCode.*\}/i,  // JSON形式のエラー
    /Error:/i,
    /undefined/i,
    /null/i,
    /TypeError/i,
    /ReferenceError/i,
  ]

  for (const pattern of technicalPatterns) {
    if (pattern.test(errorMessage)) {
      console.warn('🔒 技術的詳細を含むエラーをサニタイズ:', errorMessage)
      return defaultMessage
    }
  }

  // 日本語のみのメッセージはそのまま返す
  if (/^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3000-\u303F、。！？\s]+$/.test(errorMessage)) {
    return errorMessage
  }

  // それ以外はデフォルトメッセージ
  return defaultMessage
}

/**
 * レートリミット結果の型定義
 */
export interface RateLimitResult {
  allowed: boolean
  currentCount: number
  resetAt: Date
  retryAfter: number
}

/**
 * 🔒 APIレートリミットをチェック
 * 
 * @param serviceClient Service Role権限を持つSupabaseクライアント
 * @param identifier IPアドレスまたはユーザーID
 * @param endpoint エンドポイント名
 * @param maxRequests ウィンドウ内の最大リクエスト数（デフォルト: 60）
 * @param windowSeconds ウィンドウの秒数（デフォルト: 60）
 * @returns レートリミット結果
 */
export async function checkRateLimit(
  serviceClient: ReturnType<typeof createClient>,
  identifier: string,
  endpoint: string,
  maxRequests = 60,
  windowSeconds = 60
): Promise<RateLimitResult> {
  try {
    const { data, error } = await serviceClient.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    })

    if (error) {
      console.error('Rate limit check error:', error)
      // エラー時は許可（フェイルオープン）
      return {
        allowed: true,
        currentCount: 0,
        resetAt: new Date(),
        retryAfter: 0,
      }
    }

    const result = data?.[0] || data
    return {
      allowed: result?.allowed ?? true,
      currentCount: result?.current_count ?? 0,
      resetAt: new Date(result?.reset_at ?? Date.now()),
      retryAfter: result?.retry_after ?? 0,
    }
  } catch (err) {
    console.error('Rate limit check exception:', err)
    return {
      allowed: true,
      currentCount: 0,
      resetAt: new Date(),
      retryAfter: 0,
    }
  }
}

/**
 * リクエストからクライアントIPを取得
 */
export function getClientIP(req: Request): string {
  // Cloudflare/Vercel等のプロキシ経由の場合
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  // 直接接続の場合
  const realIP = req.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // フォールバック
  return 'unknown'
}

/**
 * レートリミット超過時のレスポンスを生成
 */
export function rateLimitResponse(
  retryAfter: number,
  headers: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'リクエストが多すぎます。しばらくしてから再試行してください。',
    }),
    {
      status: 429,
      headers: {
        ...headers,
        'Retry-After': String(retryAfter),
      },
    }
  )
}


