import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type AuthUser } from '@/lib/supabase'
import { authTrace, logger } from '@/utils/logger'
import { maskEmail } from '@/utils/security'
import { getSignOutRedirectPath, logAuthEvent } from './authContextHelpers'

/**
 * signIn / signOut を生成するファクトリ。元々 AuthContext 内にあった同名関数を
 * 切り出したもの。共有状態（refs / state setter）は deps として受け取る。
 * React フックは使わないため毎レンダーで新しい関数を返す（旧実装＝関数宣言と同じ）。
 * 挙動は AuthContext 内にあった頃と不変。
 */
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
      // セッションが無いときは signOut をスキップし、往復を1回減らす
      const { data: currentSession } = await supabase.auth.getSession()
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

  return { signIn, signOut }
}
