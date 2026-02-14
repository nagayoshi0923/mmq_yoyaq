/**
 * Sentry エラー監視の初期化
 *
 * VITE_SENTRY_DSN が設定されている場合のみ有効化される。
 * 開発環境ではデフォルトで無効（VITE_SENTRY_DSN 未設定の場合）。
 */
import * as Sentry from '@sentry/react'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

export function initSentry(): void {
  if (!SENTRY_DSN) {
    if (import.meta.env.DEV) {
      console.log('[Sentry] DSN未設定のため無効（VITE_SENTRY_DSN を設定してください）')
    }
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: (import.meta.env.VITE_APP_ENV as string) || 'development',
    // 本番では全エラーを送信、開発では10%
    sampleRate: import.meta.env.PROD ? 1.0 : 0.1,
    // パフォーマンスモニタリング（本番のみ）
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 0,
    // セッションリプレイ（無効 — 必要時に有効化）
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // PII を送信しない
    sendDefaultPii: false,
    // ソースマップ用リリース識別子
    release: `mmq-yoyaq@${import.meta.env.VITE_APP_VERSION || 'unknown'}`,
    // 無視するエラー
    ignoreErrors: [
      // ブラウザ拡張機能由来のエラー
      'ResizeObserver loop',
      'Non-Error promise rejection',
      // ネットワーク系（一時的） — チャンク読み込みエラーは除外して検知可能にする
      'Load failed',
      'NetworkError',
    ],
    beforeSend(event) {
      // チャンク読み込みエラー以外の "Failed to fetch" はノイズなので除外
      const errorMessage = event.exception?.values?.[0]?.value || ''
      if (
        errorMessage === 'Failed to fetch' &&
        !errorMessage.includes('dynamically imported module')
      ) {
        return null
      }

      // エラーメッセージから PII を除去
      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          if (exception.value) {
            // メールアドレスをマスク
            exception.value = exception.value.replace(
              /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
              '[EMAIL]'
            )
            // 電話番号をマスク
            exception.value = exception.value.replace(
              /\d{2,4}-?\d{2,4}-?\d{3,4}/g,
              '[PHONE]'
            )
          }
        }
      }
      return event
    },
  })
}

/**
 * Sentry にエラーを送信するヘルパー
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN) return
  Sentry.captureException(error, {
    extra: context,
  })
}

/**
 * Sentry にユーザー情報を設定（PII は含めない）
 */
export function setUser(userId: string | null, role?: string, orgId?: string): void {
  if (!SENTRY_DSN) return
  if (userId) {
    Sentry.setUser({
      id: userId,
      // email は送信しない（PII保護）
    })
    if (role) Sentry.setTag('user.role', role)
    if (orgId) Sentry.setTag('organization_id', orgId)
  } else {
    Sentry.setUser(null)
  }
}

export { Sentry }
