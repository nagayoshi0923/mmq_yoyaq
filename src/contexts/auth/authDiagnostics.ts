/**
 * 認証失敗の診断ログ（PII・トークン非出力）
 *
 * 「ログインしたのに未ログイン扱いになる」障害の原因が未特定のため、
 * 次に誰かが踏んだときに原因が特定できる材料を残すためのユーティリティ。
 *
 * 🚨 出力してよいのは以下だけ。トークン本体・メール・電話番号は絶対に含めない。
 * - Supabase から返ったエラーの name / message / status
 * - URL ハッシュに含まれるパラメータ「名」だけ（値は出さない）
 * - localStorage の認証セッションの有無（真偽値のみ）
 * - 現在のパス（クエリ・ハッシュは含めない）
 */
import { AUTH_STORAGE_KEY } from '@/lib/supabase'
import { captureException, Sentry } from '@/lib/sentry'
import { logger } from '@/utils/logger'

/** 診断のどの段階で失敗したか */
export type AuthFailureStage =
  /** getInitialSession() の reject */
  | 'getInitialSession'
  /** onAuthStateChange 内の resolveUserFromSession() の reject */
  | 'resolveUserFromSession'
  /** 初期化完了・未ログインなのに URL ハッシュに access_token が残っている */
  | 'urlTokenNotConsumed'
  /** 認証プロバイダ（Supabase）がハッシュでエラーを返した */
  | 'urlAuthProviderError'

/** ハッシュに現れうる認証パラメータ名のホワイトリスト（これ以外は 'other' に丸める） */
const KNOWN_AUTH_HASH_PARAMS = new Set([
  'access_token',
  'refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'type',
  'provider_token',
  'provider_refresh_token',
  'state',
  'error',
  'error_code',
  'error_description',
])

/**
 * URL ハッシュに含まれるパラメータ「名」だけを返す（値は返さない）。
 * ホワイトリスト外の名前は 'other' に丸めて、パス等が混ざっても漏らさないようにする。
 */
export function getAuthHashParamNames(hash: string): string[] {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return []
  const names: string[] = []
  let hasOther = false
  for (const key of new URLSearchParams(raw).keys()) {
    if (KNOWN_AUTH_HASH_PARAMS.has(key)) {
      if (!names.includes(key)) names.push(key)
    } else {
      hasOther = true
    }
  }
  if (hasOther) names.push('other')
  return names
}

/** localStorage に Supabase の認証セッションが存在するか（真偽値のみ） */
export function hasStoredAuthSession(): boolean {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) !== null
  } catch {
    // private browsing 等で localStorage が触れない
    return false
  }
}

interface DescribedError {
  name?: string
  message?: string
  status?: number
}

/** エラーから name / message / status だけを取り出す */
export function describeAuthError(error: unknown): DescribedError | undefined {
  if (error === null || error === undefined) return undefined
  if (typeof error === 'string') return { message: error }
  if (typeof error !== 'object') return { message: String(error) }
  const e = error as { name?: unknown; message?: unknown; status?: unknown }
  const described: DescribedError = {}
  if (typeof e.name === 'string') described.name = e.name
  if (typeof e.message === 'string') described.message = e.message
  if (typeof e.status === 'number') described.status = e.status
  return Object.keys(described).length > 0 ? described : { message: 'unknown error' }
}

/** 利用者が我々に伝えられる短いコード（例: AUTH-URLTOKEN-K3F9） */
function buildDiagnosticCode(stage: AuthFailureStage): string {
  const stageCode =
    stage === 'getInitialSession'
      ? 'INIT'
      : stage === 'resolveUserFromSession'
        ? 'RESOLVE'
        : stage === 'urlTokenNotConsumed'
          ? 'URLTOKEN'
          : 'PROVIDER'
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `AUTH-${stageCode}-${suffix}`
}

export interface AuthDiagnostics {
  /** 利用者に見せる短いコード */
  code: string
  stage: AuthFailureStage
  /** クエリ・ハッシュを含まないパス */
  path: string
  /** ハッシュに含まれるパラメータ名（値は含まない） */
  hashParamNames: string[]
  /** localStorage に認証セッションがあるか */
  hasStoredSession: boolean
  error?: DescribedError
  occurredAt: string
}

/**
 * 認証失敗を logger.error（常に出力）と Sentry（DSN 設定時のみ）へ記録する。
 * 戻り値の code を UI に出すことで、利用者からの申告とログを突き合わせられる。
 */
export function reportAuthFailure(
  stage: AuthFailureStage,
  error?: unknown,
  extra?: Record<string, unknown>
): AuthDiagnostics {
  const diagnostics: AuthDiagnostics = {
    code: buildDiagnosticCode(stage),
    stage,
    path: typeof window !== 'undefined' ? window.location.pathname : '',
    hashParamNames:
      typeof window !== 'undefined' ? getAuthHashParamNames(window.location.hash) : [],
    hasStoredSession: hasStoredAuthSession(),
    error: describeAuthError(error),
    occurredAt: new Date().toISOString(),
  }

  // 生のエラーは console にだけ渡す（スタックを潰さないため）。Sentry へは整形済みのみ。
  logger.error(`❌ 認証失敗 [${stage}]`, { ...diagnostics, ...extra }, error ?? '')

  if (error !== null && error !== undefined) {
    captureException(error, { ...diagnostics, ...extra })
  } else {
    Sentry.captureMessage(`auth failure: ${stage}`, {
      level: 'error',
      tags: { feature: 'auth', auth_stage: stage, auth_code: diagnostics.code },
      extra: { ...diagnostics, ...extra },
    })
  }

  return diagnostics
}
