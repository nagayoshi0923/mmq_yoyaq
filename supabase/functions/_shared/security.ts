/**
 * Edge Functions 共通セキュリティヘルパー
 * 認証チェック、CORS設定、ログマスキングなどを提供
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * 環境変数取得（Secrets UIの制約に対応）
 * - Supabase Dashboard の Edge Function Secrets では `SUPABASE_` 接頭辞が禁止される場合がある
 * - 既存互換のため、SUPABASE_* があれば優先し、無ければ別名を参照する
 */
export function getServiceRoleKey(): string {
  return (
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    ''
  )
}

export function getAnonKey(): string {
  return (
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    ''
  )
}

/**
 * Cron/DBトリガーからの呼び出し用の共有シークレット
 * - DBの cron.job / triggers に Supabase の service_role key を埋め込むのは漏洩リスクが高いので分離する
 * - 設定されていない場合は従来互換で service_role key でも許可できるようにする（段階移行）
 */
export function getCronSecret(): string {
  return Deno.env.get('CRON_SECRET') ?? Deno.env.get('EDGE_FUNCTION_CRON_SECRET') ?? ''
}

export function isCronOrServiceRoleCall(req: Request): boolean {
  // IMPORTANT:
  // Supabase Functions は Authorization ヘッダを JWT として検証するため、
  // ランダムな CRON_SECRET を Authorization に入れると gateway 側で 401 Invalid JWT になる。
  // そのため Cron/DB トリガーの共有シークレットは専用ヘッダで受ける。
  const cronSecret = getCronSecret().trim()
  const cronHeader =
    (req.headers.get('x-cron-secret') ||
      req.headers.get('x-edge-cron-secret') ||
      req.headers.get('x-mmq-cron-secret') ||
      '').trim()

  if (cronSecret && cronHeader && timingSafeEqualString(cronHeader, cronSecret)) {
    return true
  }

  // 互換: Authorization: Bearer <service_role> の場合は許可
  const authHeader = (req.headers.get('Authorization') || '').trim()
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim()
  const serviceRoleKey = getServiceRoleKey().trim()
  
  // 1. キーが完全一致する場合（旧JWT形式）
  if (serviceRoleKey && bearer && timingSafeEqualString(bearer, serviceRoleKey)) {
    return true
  }
  
  // 2. bearerがJWTの場合、デコードしてroleを確認
  if (bearer && bearer.startsWith('eyJ')) {
    try {
      const parts = bearer.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]))
        if (payload.role === 'service_role') {
          console.log('✅ service_role JWT検証成功')
          return true
        }
      }
    } catch {
      // JWT解析失敗は無視
    }
  }
  
  return false
}

// 許可するオリジン
// - 本番: 本番ドメインのみ（安全側デフォルト）
// - 開発/ステージング: localhost 等を追加
function isNonProduction(): boolean {
  // 明示指定があるならそれを優先
  const env = (Deno.env.get('APP_ENV') || '').toLowerCase()
  if (env) {
    return env !== 'production' && env !== 'prod'
  }

  // ローカルSupabaseなら非本番として扱う
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').toLowerCase()
  if (supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1')) {
    return true
  }

  // env未設定かつURLもローカルではない場合は「本番」とみなす（安全側）
  return false
}

const PROD_ALLOWED_ORIGINS = [
  'https://mmq.game',
  'https://www.mmq.game',
  'https://mmq-yoyaq.vercel.app',
]

const NON_PROD_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
]

export const ALLOWED_ORIGINS = [
  ...PROD_ALLOWED_ORIGINS,
  ...(isNonProduction() ? NON_PROD_ALLOWED_ORIGINS : []),
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
  requiredRoles?: string[],
  options?: { allowAnonymous?: boolean }
): Promise<AuthResult> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()

  const authHeader = req.headers.get('Authorization')
  
  // 認証ヘッダーがない場合
  if (!authHeader) {
    // allowAnonymous が true なら匿名として成功扱い
    if (options?.allowAnonymous) {
      return {
        success: true,
        user: { id: 'anonymous', email: undefined, role: 'anonymous' }
      }
    }
    return {
      success: false,
      error: '認証が必要です',
      statusCode: 401,
    }
  }

  try {
    // Service Role Key で認証を検証（Publishable Key 対応）
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      // SERVICE_ROLE_KEY がなくても allowAnonymous なら続行
      if (options?.allowAnonymous) {
        console.warn('SERVICE_ROLE_KEY未設定、匿名モードで続行')
        return {
          success: true,
          user: { id: 'anonymous', email: undefined, role: 'anonymous' }
        }
      }
      return {
        success: false,
        error: 'サーバー設定エラー（SERVICE_ROLE_KEY）',
        statusCode: 500,
      }
    }

    // Authorization ヘッダーから Bearer トークンを抽出
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    
    // Publishable Key 自体が送られてきた場合はスキップ
    if (token.startsWith('sb_publishable_') || token.startsWith('sb_secret_')) {
      if (options?.allowAnonymous) {
        console.log('Publishable/Secret Key検出、匿名モードで続行')
        return {
          success: true,
          user: { id: 'anonymous', email: undefined, role: 'anonymous' }
        }
      }
      return {
        success: false,
        error: '認証トークンが無効です',
        statusCode: 401,
      }
    }
    
    // Service Role Key を使ってユーザー情報を取得
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token)
    
    if (authError || !user) {
      // 認証失敗でも allowAnonymous なら続行
      if (options?.allowAnonymous) {
        console.log('認証失敗、匿名モードで続行:', authError?.message)
        return {
          success: true,
          user: { id: 'anonymous', email: undefined, role: 'anonymous' }
        }
      }
      console.warn('認証エラー詳細:', authError?.message || 'ユーザーが見つかりません')
      return {
        success: false,
        error: '認証に失敗しました',
        statusCode: 401,
      }
    }

    // ロールが必要な場合は確認
    if (requiredRoles && requiredRoles.length > 0) {
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
      // エラー時は拒否（フェイルクローズ）— 安全側に倒す
      return {
        allowed: false,
        currentCount: maxRequests,
        resetAt: new Date(Date.now() + windowSeconds * 1000),
        retryAfter: windowSeconds,
      }
    }

    const result = data?.[0] || data
    return {
      allowed: result?.allowed ?? false,
      currentCount: result?.current_count ?? 0,
      resetAt: new Date(result?.reset_at ?? Date.now()),
      retryAfter: result?.retry_after ?? 0,
    }
  } catch (err) {
    console.error('Rate limit check exception:', err)
    // 例外時も拒否（フェイルクローズ）— 安全側に倒す
    return {
      allowed: false,
      currentCount: maxRequests,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
      retryAfter: windowSeconds,
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


