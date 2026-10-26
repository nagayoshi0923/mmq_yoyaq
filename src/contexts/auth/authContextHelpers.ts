import { authSessionApi } from '@/lib/api/authSessionApi'
import { logger } from '@/utils/logger'

/** 役割を確かめる読み取りが失敗・無応答だった（役割が分からない）。お客様などに決め打ちしない（2026-10-26 本番ログイン障害） */
export class AuthRoleUnresolvedError extends Error {
  constructor(message = '利用者の役割を確認できませんでした') {
    super(message)
    this.name = 'AuthRoleUnresolvedError'
  }
}

/** staff テーブルの確認の期限（ロール取得の 2 秒の期限のあとに呼ばれる。無応答で利用者情報の確定が止まらないように） */
export const STAFF_ROLE_LOOKUP_TIMEOUT_MS = 3000

/**
 * staffテーブルを user_id → email の順で検索し、該当すれば 'staff' を返す。
 * user_id/email のどちらにも一致しなければ null を返す。
 * ロール判定のフォールバック処理で重複していた検索ロジックを1箇所に集約。
 * 読み取りの失敗・期限切れは「一致なし」と区別して AuthRoleUnresolvedError を投げる
 * （以前は失敗を null＝お客様として扱い、無応答なら利用者情報の確定が止まっていた）。
 */
export async function lookupStaffRole(
  userId: string,
  email: string | undefined | null,
  timeoutMs: number = STAFF_ROLE_LOOKUP_TIMEOUT_MS,
): Promise<'staff' | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AuthRoleUnresolvedError('staff の確認が応答しませんでした')), timeoutMs)
  })
  const lookup = async (): Promise<'staff' | null> => {
    try {
      const byId = await authSessionApi.findStaffIdByUserId(userId)
      if (byId.error) throw byId.error
      if (byId.data) return 'staff'
      if (email) {
        const byEmail = await authSessionApi.findStaffIdByEmail(email)
        if (byEmail.error) throw byEmail.error
        if (byEmail.data) return 'staff'
      }
      return null
    } catch (error) {
      if (error instanceof AuthRoleUnresolvedError) throw error
      logger.warn('staff の確認に失敗:', error)
      throw new AuthRoleUnresolvedError('staff の確認に失敗しました')
    }
  }
  try {
    return await Promise.race([lookup(), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * サインアウト後のリダイレクト先パスを返す。
 * 公開予約ページ（/org-slug/...）にいる場合はそのorgのトップへ、
 * 管理画面や判定不能な場合はルート（/）へ。
 */
export function getSignOutRedirectPath(): string {
  const pathname = window.location.pathname
  const match = pathname.match(/^\/([^/]+)/)
  if (match) {
    const adminPaths = [
      'dashboard', 'stores', 'staff', 'scenarios', 'schedule',
      'shift-submission', 'gm-availability', 'private-booking-management',
      'reservations', 'accounts', 'sales', 'settings', 'manual',
      'login', 'signup', 'reset-password', 'set-password', 'complete-profile',
      'coupon-present', 'license-management', 'staff-profile', 'mypage', 'author',
      'external-reports', 'accept-invitation', 'organization-register',
      'partner-report',
    ]
    if (!adminPaths.includes(match[1])) {
      return `/${match[1]}`
    }
  }
  return '/'
}

// パスワードリセット中フラグのキー（sessionStorage使用）
export const PASSWORD_RESET_FLAG_KEY = 'MMQ_PASSWORD_RESET_IN_PROGRESS'

// 複数タブ間で認証状態を同期するためのチャンネル名
export const AUTH_CHANNEL_NAME = 'mmq-auth-sync'

/**
 * クライアントのIPアドレスを取得（キャッシュ付き）
 * 注意: 外部サービスへのリクエストのため、失敗する可能性がある
 */
let cachedIpAddress: string | null = null
let ipFetchPromise: Promise<string | null> | null = null

async function getClientIpAddress(): Promise<string | null> {
  if (import.meta.env.VITE_APP_ENV === 'local-repro') {
    return null
  }

  // キャッシュがあれば返す
  if (cachedIpAddress) {
    return cachedIpAddress
  }

  // 既にリクエスト中なら、そのPromiseを待つ
  if (ipFetchPromise) {
    return ipFetchPromise
  }

  ipFetchPromise = (async () => {
    try {
      // ipify APIを使用（無料、HTTPS対応）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1200) // ログ用のため短めに切る

      const response = await fetch('https://api.ipify.org?format=json', {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        cachedIpAddress = data.ip || null
        return cachedIpAddress
      }
    } catch {
      // IP取得失敗は無視（ログ記録自体は続行）
    }
    return null
  })()

  const result = await ipFetchPromise
  ipFetchPromise = null
  return result
}

/**
 * 認証イベントをログに記録（ログイン・ログアウトの体感速度を優先し、呼び出し元は待たない）
 */
export function logAuthEvent(
  eventType: 'login' | 'logout' | 'role_change' | 'password_reset' | 'password_set' | 'signup',
  userId: string | null,
  options?: {
    oldRole?: 'admin' | 'staff' | 'customer' | 'license_admin'
    newRole?: 'admin' | 'staff' | 'customer' | 'license_admin'
    success?: boolean
    errorMessage?: string
    metadata?: Record<string, unknown>
  }
) {
  void (async () => {
    try {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null
      const ipAddress = await getClientIpAddress()

      const { error } = await authSessionApi.insertAuthLog({
        user_id: userId,
        event_type: eventType,
        old_role: options?.oldRole,
        new_role: options?.newRole,
        ip_address: ipAddress,
        user_agent: userAgent,
        success: options?.success ?? true,
        error_message: options?.errorMessage,
        metadata: options?.metadata ?? {},
      })

      if (error) {
        logger.warn('⚠️ 認証ログ記録エラー:', error)
      }
    } catch (err) {
      logger.warn('⚠️ 認証ログ記録例外:', err)
    }
  })()
}
