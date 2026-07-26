import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { AuthUser } from '@/lib/supabase'
import { reportAuthFailure } from './authDiagnostics'

/**
 * 「トークンが URL に残ったまま未ログイン扱い」を検出して利用者に知らせるフック。
 *
 * 確定した異常シグネチャ（実測）:
 *   isInitialized === true かつ user === null かつ URL ハッシュに access_token= が残っている
 * → supabase-js が implicit フローのハッシュ消費に失敗している。従来はエラー表示が一切なく、
 *   利用者から見ると「ログインしたのに未ログイン＋URL にトークンが見える」状態だった。
 *
 * 🚨 誤検知させないための除外条件（これらの画面ではハッシュに access_token があるのが正常）:
 * - ハッシュに type=recovery（パスワードリセット）
 * - パスが /reset-password・/set-password・/complete-profile
 *
 * ハッシュに error / error_description がある場合はプロバイダ側のエラー内容を優先して表示する。
 */

/** これらの画面はハッシュにトークンがあるのが正常なので通知しない */
const EXCLUDED_PATHS = new Set(['/reset-password', '/set-password', '/complete-profile'])

/**
 * 初期化完了直後の一瞬のズレ（セッション確立中に user が null）で誤検知しないための待機。
 * user が入れば effect が再実行されてタイマーは破棄される。
 */
const DETECTION_DELAY_MS = 1000

const TOAST_ID = 'auth-url-token-not-consumed'

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

export function useStrandedAuthTokenNotice(params: {
  isInitialized: boolean
  user: AuthUser | null
}) {
  const { isInitialized, user } = params
  const notifiedRef = useRef(false)

  useEffect(() => {
    if (!isInitialized || user || notifiedRef.current) return

    const hash = window.location.hash
    if (!hash) return

    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
    const hasAccessToken = hashParams.has('access_token')
    const providerError = hashParams.get('error_description') || hashParams.get('error')
    if (!hasAccessToken && !providerError) return

    // パスワードリセットはハッシュに access_token を含むのが正常
    if (hashParams.get('type') === 'recovery') return
    if (EXCLUDED_PATHS.has(normalizePath(window.location.pathname))) return

    const timer = setTimeout(() => {
      notifiedRef.current = true
      const stage = providerError ? 'urlAuthProviderError' : 'urlTokenNotConsumed'
      const { code } = reportAuthFailure(stage, undefined, {
        // プロバイダのエラー文言は PII を含まない（Supabase の固定メッセージ）
        providerError: providerError ?? undefined,
        providerErrorCode: hashParams.get('error_code') ?? undefined,
      })

      toast.error('ログインを完了できませんでした', {
        id: TOAST_ID,
        description: providerError
          ? `${providerError}／お手数ですが、もう一度ログインをお試しください。解決しない場合はこのコードをお伝えください: ${code}`
          : `お手数ですが、もう一度ログインをお試しください。解決しない場合はこのコードをお伝えください: ${code}`,
        duration: Infinity,
        action: {
          label: 'ログイン画面へ',
          onClick: () => {
            window.location.assign('/login')
          },
        },
      })
    }, DETECTION_DELAY_MS)

    return () => clearTimeout(timer)
  }, [isInitialized, user])
}
