import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

/**
 * staffテーブルを user_id → email の順で検索し、該当すれば 'staff' を返す。
 * user_id/email のどちらにも一致しなければ null を返す。
 * ロール判定のフォールバック処理で重複していた検索ロジックを1箇所に集約。
 */
export async function lookupStaffRole(
  userId: string,
  email: string | undefined | null
): Promise<'staff' | null> {
  try {
    const { data: byId } = await supabase
      .from('staff')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    if (byId) return 'staff'

    if (email) {
      const { data: byEmail } = await supabase
        .from('staff')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (byEmail) return 'staff'
    }
  } catch {
    // staff テーブルへのアクセス失敗は無視
  }
  return null
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

      const { error } = await supabase.from('auth_logs').insert({
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
