import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type AuthUser } from '@/lib/supabase'
import { authTrace, logger } from '@/utils/logger'
import { maskEmail } from '@/utils/security'
import { clearPersistedQueryCache } from '@/lib/persistedQueryCache'
import { removeWebPushSubscription } from '@/lib/webPush'
import { getSignOutRedirectPath, logAuthEvent } from './authContextHelpers'

/**
 * signIn / signOut を生成するファクトリ。元々 AuthContext 内にあった同名関数を
 * 切り出したもの。共有状態（refs / state setter）は deps として受け取る。
 * React フックは使わないため毎レンダーで新しい関数を返す（旧実装＝関数宣言と同じ）。
 * 挙動は AuthContext 内にあった頃と不変。
 */
/** getSession() の応答を待つ上限（ミリ秒）。超えたらセッション無し扱いで先へ進む */
const GET_SESSION_TIMEOUT_MS = 3000

/** getSession() がタイムアウトしたことを示す番兵（セッション無しと同じ形） */
const GET_SESSION_TIMED_OUT: { session: null } = { session: null }

export interface AuthActionsDeps {
  userRef: MutableRefObject<AuthUser | null>
  broadcastChannelRef: MutableRefObject<BroadcastChannel | null>
  isExplicitSignOutRef: MutableRefObject<boolean>
  setUser: Dispatch<SetStateAction<AuthUser | null>>
  setStaffCache: Dispatch<SetStateAction<Map<string, string>>>
  setLoading: Dispatch<SetStateAction<boolean>>
}

export function createAuthActions(deps: AuthActionsDeps) {
  const {
    userRef,
    broadcastChannelRef,
    isExplicitSignOutRef,
    setUser,
    setStaffCache,
    setLoading,
  } = deps

  async function signIn(email: string, password: string): Promise<{ user: User }> {
    // グローバル loading は立てない（全アプリのスピナーでログインが重く見えるため）。
    // LoginForm の isSubmitting で十分。onAuthStateChange が user を流し込む。
    try {
      // セッションが無いときは signOut をスキップし、往復を1回減らす。
      // getSession() は navigator.locks の競合（他タブ／破損状態）で永遠に resolve しない
      // ことがあるため、3秒で打ち切って「セッション無し扱い」で先へ進む。
      let getSessionTimer: ReturnType<typeof setTimeout> | undefined
      const currentSession = await Promise.race([
        supabase.auth.getSession().then(result => result.data),
        new Promise<{ session: null }>(resolve => {
          getSessionTimer = setTimeout(() => resolve(GET_SESSION_TIMED_OUT), GET_SESSION_TIMEOUT_MS)
        }),
      ]).finally(() => {
        if (getSessionTimer !== undefined) clearTimeout(getSessionTimer)
      })
      if (currentSession === GET_SESSION_TIMED_OUT) {
        logger.warn('⚠️ getSession が3秒応答せずスキップ（ロック競合の疑い）')
      }
      if (currentSession.session) {
        authTrace('🔄 既存セッションを検出、クリアします')
        await supabase.auth.signOut({ scope: 'local' })
        // ストレージ反映を1ティック譲る（50ms 固定待ちは体感を悪化させる）
        await new Promise<void>(resolve => queueMicrotask(resolve))
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        logger.error('❌ ログインエラー:', error.message)
        logAuthEvent('login', null, {
          success: false,
          errorMessage: error.message,
        })
        throw error
      }

      const signedUser = data.user
      if (!signedUser) {
        throw new Error('ログインに失敗しました')
      }

      // メール未確認ユーザーはログイン不可
      const emailConfirmedAt = signedUser.email_confirmed_at || signedUser.confirmed_at
      if (!emailConfirmedAt) {
        logger.warn('⚠️ メール未確認のためログイン拒否:', signedUser.email ? maskEmail(signedUser.email) : 'N/A')
        await supabase.auth.signOut({ scope: 'local' })
        throw new Error('Email not confirmed')
      }

      authTrace('✅ ログイン成功:', signedUser.email ? maskEmail(signedUser.email) : 'N/A')

      logAuthEvent('login', signedUser.id, {
        newRole: userRef.current?.role,
        success: true,
      })

      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({ type: 'SIGNED_IN' })
        authTrace('📡 他タブにログインを通知')
      }

      return { user: signedUser }
    } catch (error) {
      throw error
    }
  }

  async function signOut() {
    setLoading(true)
    isExplicitSignOutRef.current = true
    const currentUserId = userRef.current?.id ?? null
    const currentUserRole = userRef.current?.role
    
    try {
      // この端末のプッシュ通知の購読を外す（次に使う人に前の人の通知が届かないように。ログイン中にしか消せない）
      await removeWebPushSubscription()
      const { error } = await supabase.auth.signOut()
      if (error) {
        // ログアウト失敗をログに記録
        logAuthEvent('logout', currentUserId, {
          success: false,
          errorMessage: error.message,
        })
        throw error
      }
      
      // ログアウト成功をログに記録
      logAuthEvent('logout', currentUserId, {
        oldRole: currentUserRole,
        success: true,
      })
      
      // ユーザー情報をクリア
      setUser(null)
      userRef.current = null
      
      // 🚨 キャッシュをクリア（別ユーザーでログイン時に古い情報が表示されるのを防ぐ）
      setStaffCache(new Map())
      await clearPersistedQueryCache()
      
      // 他のタブにログアウトを通知
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({ type: 'SIGNED_OUT' })
        authTrace('📡 他タブにログアウトを通知')
      }
      
      // 予約サイトにリダイレクト（現在の組織を維持）
      window.location.href = getSignOutRedirectPath()
    } catch (error) {
      setLoading(false)
      isExplicitSignOutRef.current = false
      throw error
    } finally {
      setLoading(false)
    }
  }

  /**
   * ログイン方法を選び直すためのログアウト（お客様情報が別のログインに結び付いている案内から。2026-10-29）。
   * 明示的なログアウトとして扱い（isExplicitSignOutRef）、SIGNED_OUT のあとのバックアップからの復旧を起こさない
   * （起こすと同じ利用者のセッションが戻り、ログイン画面から同じ案内へ戻ってしまう。Codex レビュー）。
   * 移動はしない（呼び出し側が ok のときだけログイン画面へ移る）。このタブのログイン情報だけ消す（scope: local）。
   * ok = ログアウトできた／failed = { error }・例外（明示ログアウトの印は戻す）／timeout = 上限までに返らない
   * （印は残す: 遅れて SIGNED_OUT が来ても復旧しない。利用者はログアウトを選んでいる）
   */
  async function signOutForRelogin(limitMs: number = RELOGIN_SIGN_OUT_LIMIT_MS): Promise<'ok' | 'failed' | 'timeout'> {
    isExplicitSignOutRef.current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = (async (): Promise<'ok' | 'failed'> => {
      try {
        // 次に使う人に前の人の通知が届かないように（ログイン中にしか消せない。失敗してもログアウトは続ける）
        await removeWebPushSubscription().catch((err) => logger.warn('通知の購読の解除に失敗（続行）:', err))
        const { error } = await supabase.auth.signOut({ scope: 'local' })
        return error ? 'failed' : 'ok'
      } catch {
        return 'failed'
      }
    })()
    const result = await Promise.race([
      attempt,
      new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), limitMs) }),
    ]).finally(() => { if (timer !== undefined) clearTimeout(timer) })
    if (result === 'failed') {
      isExplicitSignOutRef.current = false
      return result
    }
    if (result === 'ok') {
      setUser(null)
      userRef.current = null
      setStaffCache(new Map())
      await clearPersistedQueryCache().catch((err) => logger.warn('キャッシュの消去に失敗（続行）:', err))
      broadcastChannelRef.current?.postMessage({ type: 'SIGNED_OUT' })
    }
    return result
  }

  return { signIn, signOut, signOutForRelogin }
}

/** 選び直しのログアウトを待つ上限（ミリ秒） */
export const RELOGIN_SIGN_OUT_LIMIT_MS = 3000
