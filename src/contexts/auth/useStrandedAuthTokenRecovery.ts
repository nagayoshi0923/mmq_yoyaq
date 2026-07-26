import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase, type AuthUser } from '@/lib/supabase'
import { authTrace } from '@/utils/logger'
import { reportAuthFailure } from './authDiagnostics'

/**
 * 「トークンが URL に残ったまま未ログイン扱い」を検出し、
 * まず自己復旧（setSession のリトライ）を試み、ダメなときだけ利用者に通知するフック。
 *
 * 確定した異常シグネチャ（実測）:
 *   isInitialized === true かつ user === null かつ URL ハッシュに access_token= が残っている
 *
 * 根本原因（Sentry 実測 2026-07-27 / MMQ-YOYAQ-1W・MMQ-YOYAQ-30）:
 *   supabase-js は implicit フローで `GET /auth/v1/user` を呼んでセッションを組み立てるが、
 *   この fetch が `AuthRetryableFetchError: Failed to fetch` / `TypeError: Load failed` で
 *   失敗すると、セッション未確立のままハッシュを消さずに中断する（サーバー側は正常＝
 *   リクエストがブラウザから出ていない。広告ブロッカー等の拡張機能・回線・端末依存）。
 *   supabase-js 自身が「Retryable」と言っているのにアプリが復旧を試みず、無言で永久
 *   ログアウト状態にしていたのが欠陥だったため、ここで有限回リトライする。
 *
 * 🚨 誤検知させないための除外条件（これらの画面ではハッシュに access_token があるのが正常）:
 * - ハッシュに type=recovery（パスワードリセット）
 * - パスが /reset-password・/set-password・/complete-profile
 *
 * ハッシュに error / error_description がある場合はプロバイダ側のエラー内容を優先して表示する
 * （この場合はトークンが無く復旧できないため、リトライせず通知する）。
 */

/** これらの画面はハッシュにトークンがあるのが正常なので何もしない */
const EXCLUDED_PATHS = new Set(['/reset-password', '/set-password', '/complete-profile'])

/**
 * 初期化完了直後の一瞬のズレ（セッション確立中に user が null）で誤検知しないための待機。
 * user が入れば effect が再実行されてタイマーは破棄される。
 */
const DETECTION_DELAY_MS = 1000

/**
 * リトライは有限回（3回）。各試行の前に待つ時間（合計 ~11秒）。
 * 待機中に online イベントが来た場合は即座に次の試行へ進む。
 */
const RETRY_DELAYS_MS = [1000, 3000, 7000] as const

/** オフライン時に online イベントを待つ上限（これを過ぎたら一度試行して失敗を確定させる） */
const OFFLINE_WAIT_MAX_MS = 60 * 1000

const TOAST_ID = 'auth-url-token-recovery'

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

/** URL からハッシュだけを除去（トークンを URL に残さない） */
function stripAuthHashFromUrl(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

export function useStrandedAuthTokenRecovery(params: {
  isInitialized: boolean
  user: AuthUser | null
}) {
  const { isInitialized, user } = params
  // 「再試行」ボタンで復旧処理をもう一度走らせるためのカウンタ
  const [retryNonce, setRetryNonce] = useState(0)
  // 1ページロード（＋明示的な再試行）につき復旧セットは1回だけ
  const startedNonceRef = useRef(-1)

  const requestRetry = useCallback(() => {
    setRetryNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!isInitialized || user) return
    if (startedNonceRef.current === retryNonce) return

    const hash = window.location.hash
    if (!hash) return

    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const providerError = hashParams.get('error_description') || hashParams.get('error')
    if (!accessToken && !providerError) return

    // パスワードリセットはハッシュに access_token を含むのが正常
    if (hashParams.get('type') === 'recovery') return
    if (EXCLUDED_PATHS.has(normalizePath(window.location.pathname))) return

    startedNonceRef.current = retryNonce

    let cancelled = false
    let finished = false
    let loadingToastShown = false
    /** 進行中の待機を中断する（cleanup 用） */
    let cancelWait: (() => void) | null = null
    /** 進行中の待機を「オンライン復帰で即再開」させる（online ハンドラ用） */
    let resumeOnOnline: (() => void) | null = null

    const wait = (ms: number, options?: { resumeOnOnline?: boolean }) =>
      new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer)
          if (cancelWait === finish) cancelWait = null
          if (resumeOnOnline === finish) resumeOnOnline = null
          resolve()
        }
        const timer = setTimeout(finish, ms)
        cancelWait = finish
        if (options?.resumeOnOnline) resumeOnOnline = finish
      })

    const handleOnline = () => {
      authTrace('🌐 オンライン復帰を検出、認証リトライを即時再開')
      resumeOnOnline?.()
    }
    window.addEventListener('online', handleOnline)

    /** ハッシュのトークンで setSession を1回試す */
    const attemptRecovery = async (
      token: string,
      refresh: string
    ): Promise<{ ok: true } | { ok: false; error: unknown }> => {
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: token,
          refresh_token: refresh,
        })
        if (error) return { ok: false, error }
        if (!data.session) return { ok: false, error: new Error('setSession returned no session') }
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err }
      }
    }

    /** 全リトライ失敗（または復旧不能）時の通知。Sentry 送信はここ1回だけ */
    const notifyFailure = (
      stage: 'urlTokenNotConsumed' | 'urlAuthProviderError',
      error: unknown,
      extra: Record<string, unknown>
    ) => {
      finished = true
      const { code } = reportAuthFailure(stage, error, {
        // プロバイダのエラー文言は PII を含まない（Supabase の固定メッセージ）
        providerError: providerError ?? undefined,
        providerErrorCode: hashParams.get('error_code') ?? undefined,
        ...extra,
      })

      const guide =
        '通信がブロックされている可能性があります。シークレットウィンドウ（プライベートブラウズ）でお試しください。広告ブロッカー等の拡張機能をお使いの場合は mmq.game を許可してください。'
      toast.error('ログインを完了できませんでした', {
        id: TOAST_ID,
        description: `${providerError ? `${providerError}／` : ''}${guide}解決しない場合はこのコードをお伝えください: ${code}`,
        duration: Infinity,
        action: {
          label: '再試行',
          onClick: requestRetry,
        },
      })
    }

    const run = async () => {
      // 誤検知防止の待機（online では中断しない = user 確定を待つ猶予を必ず確保する）
      await wait(DETECTION_DELAY_MS)
      if (cancelled) return

      // refresh_token が無い（またはプロバイダエラーのみ）ときは復旧不能 → そのまま通知
      if (!accessToken || !refreshToken) {
        notifyFailure(providerError ? 'urlAuthProviderError' : 'urlTokenNotConsumed', undefined, {
          recoverable: false,
          hasRefreshToken: Boolean(refreshToken),
        })
        return
      }

      authTrace('🔁 URL トークンからセッション復旧を開始（最大3回）')
      toast.loading('接続を再試行しています…', { id: TOAST_ID, duration: Infinity })
      loadingToastShown = true

      let lastError: unknown
      for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        await wait(RETRY_DELAYS_MS[attempt - 1], { resumeOnOnline: true })
        if (cancelled) return

        // オフラインなら試行を消費せず待つ（online イベントで即再開）
        if (!navigator.onLine) {
          authTrace('📴 オフラインのため待機（オンライン復帰で即再試行）')
          await wait(OFFLINE_WAIT_MAX_MS, { resumeOnOnline: true })
          if (cancelled) return
        }

        const result = await attemptRecovery(accessToken, refreshToken)
        if (cancelled) return

        if (result.ok) {
          finished = true
          // 成功したらトークンを URL から消す（セキュリティ・再検出防止）
          stripAuthHashFromUrl()
          toast.dismiss(TOAST_ID)
          authTrace(`✅ URL トークンからセッションを復旧しました（${attempt}回目）`)
          // user の確定は既存フロー（onAuthStateChange → resolveUserFromSession）に任せる
          return
        }

        lastError = result.error
        authTrace(`⚠️ セッション復旧に失敗（${attempt}/${RETRY_DELAYS_MS.length}回目）`)
      }

      notifyFailure('urlTokenNotConsumed', lastError, {
        recoverable: true,
        retryAttempts: RETRY_DELAYS_MS.length,
        wasOnline: navigator.onLine,
      })
    }

    void run()

    return () => {
      cancelled = true
      cancelWait?.()
      window.removeEventListener('online', handleOnline)
      // 復旧中に別経路でログインが確定した場合、進行中トーストを残さない
      if (loadingToastShown && !finished) toast.dismiss(TOAST_ID)
    }
  }, [isInitialized, user, retryNonce, requestRetry])
}
