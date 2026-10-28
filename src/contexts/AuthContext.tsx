import { useLoginCompletionPending } from '@/components/auth/loginCompletion'
import { AuthRecoveryNotice } from './auth/AuthRecoveryNotice'
import React, { createContext, useCallback, useContext, useState } from 'react'
import { type AuthUser } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import { setUser as setSentryUser } from '@/lib/sentry'
import { useSessionRefresh } from './auth/useSessionRefresh'
import { createAuthActions } from './auth/authActions'
import { createSessionBootstrap } from './auth/sessionBootstrap'
import { useAuthLifecycle } from './auth/useAuthLifecycle'
import { useStrandedAuthTokenRecovery } from './auth/useStrandedAuthTokenRecovery'
import { resolveUserFromSession, type ResolveUserDeps } from './auth/resolveUserFromSession'

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  isInitialized: boolean  // 初期認証が完了したか（タイムアウトではなく、実際に完了）
  /** admin または license_admin ロール */
  isAdmin: boolean
  /** staff / admin / license_admin ロール（顧客・未ログイン以外） */
  isStaff: boolean
  /** customer ロール（または未ログイン） */
  isCustomer: boolean
  signIn: (email: string, password: string) => Promise<{ user: User }>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>  // 手動でセッションをリフレッシュ
  /**
   * ログインした利用者の役割・情報を確かめ直す（ログイン画面の「利用者情報を再読み込み」）。確定できなければ null。
   * パスワードのログインはやり直さない（2026-10-26 本番ログイン障害）
   */
  reloadUser: (supabaseUser: User) => Promise<AuthUser | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)  // 認証完了フラグ
  const loginCompletionPending = useLoginCompletionPending()
  const [recoveryError, setRecoveryError] = useState(false)
  const [retryingAuth, setRetryingAuth] = useState(false)
  const retryingAuthRef = React.useRef(false)
  const onAuthFailure = useCallback(() => setRecoveryError(true), [])
  const onAuthResolved = useCallback(() => setRecoveryError(false), [])
  const [staffCache, setStaffCache] = useState<Map<string, string>>(new Map())
  // 最新のユーザー情報を保持するためのref（クロージャー問題を回避）
  const userRef = React.useRef<AuthUser | null>(null)
  const generationRef = React.useRef(0)
  const pendingResolutionRef = React.useRef<NonNullable<ResolveUserDeps['pendingResolutionRef']>['current']>(null)
  // 認証処理中のフラグ（クロージャー問題を回避するためuseRefを使用）
  const isProcessingRef = React.useRef<boolean>(false)
  // 明示的ログアウト中フラグ（SIGNED_OUT でリカバリーを試みないようにする）
  const isExplicitSignOutRef = React.useRef<boolean>(false)
  // セッション復元の試行済みフラグ（無限ループ防止）
  const recoveryAttemptedRef = React.useRef<boolean>(false)
  // 複数タブ間の同期用BroadcastChannel
  const broadcastChannelRef = React.useRef<BroadcastChannel | null>(null)
  
  // userが変更されたらrefも更新
  React.useEffect(() => {
    userRef.current = user
  }, [user])

  // Sentryにユーザー情報を紐付け（エラー追跡の改善）
  React.useEffect(() => {
    if (user) {
      setSentryUser(user.id, user.role)
    } else {
      setSentryUser(null)
    }
  }, [user])

  // resolveUserFromSession（旧 setUserFromSession）へ渡す共有状態。
  // 各 effect / callback は生成時のクロージャでこれを捕捉する（旧実装と同じ捕捉タイミング）。
  const resolveDeps = { pendingResolutionRef, generationRef, isProcessingRef, userRef, staffCache, setStaffCache, setUser, onResolutionError: onAuthFailure, onResolutionSuccess: onAuthResolved }

  // 手動セッションリフレッシュ（auth/useSessionRefresh.ts へ切り出し）
  const refreshSession = useSessionRefresh(userRef, setUser)

  // signIn / signOut（auth/authActions.ts へ切り出し）
  const { signIn: performSignIn, signOut: performSignOut } = createAuthActions({
    userRef,
    broadcastChannelRef,
    isExplicitSignOutRef,
    setUser,
    setStaffCache,
    setLoading,
  })

  const signIn = async (email: string, password: string) => {
    generationRef.current += 1
    return performSignIn(email, password)
  }

  const signOut = async () => {
    generationRef.current += 1
    setRecoveryError(false)
    await performSignOut()
  }

  // 初期セッション取得・バックアップ復元（auth/sessionBootstrap.ts へ切り出し）
  const { getInitialSession, tryRecoverSession } = createSessionBootstrap({
    resolveDeps,
    setLoading,
    setIsInitialized,
    onFailure: onAuthFailure,
  })

  // マウント時ライフサイクル（onAuthStateChange 購読 / タブ復帰・focus / 定期リフレッシュ /
  // BroadcastChannel マルチタブ同期）を auth/useAuthLifecycle.ts へ切り出し
  useAuthLifecycle({
    loading,
    resolveDeps,
    getInitialSession,
    tryRecoverSession,
    refreshSession,
    userRef,
    isProcessingRef,
    isExplicitSignOutRef,
    recoveryAttemptedRef,
    broadcastChannelRef,
    setUser,
    setStaffCache,
    setLoading,
    setIsInitialized,
    onFailure: onAuthFailure,
  })

  // 再認証/ログアウトはせず、現在のセッションと利用者情報だけを確認する。
  const retryAuth = async () => {
    if (retryingAuthRef.current) return
    retryingAuthRef.current = true
    setRetryingAuth(true)
    try {
      await getInitialSession()
    } finally {
      retryingAuthRef.current = false
      setRetryingAuth(false)
    }
  }

  // 認証トークンが URL ハッシュに残ったまま未ログインになった場合の自己復旧＋可視化
  // （supabase-js の /auth/v1/user fetch 失敗で無言のログアウト状態になる障害への対策）
  useStrandedAuthTokenRecovery({ isInitialized, user })

  const reloadUser = useCallback(async (supabaseUser: User) => {
    const result = await resolveUserFromSession(supabaseUser, resolveDeps)
    return result === 'resolved' && userRef.current?.id === supabaseUser.id ? userRef.current : null
    // resolveDeps は毎回作り直す入れ物（中身の ref・setter は同じ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isAdmin = !!user && (user.role === 'admin' || user.role === 'license_admin')
  const isStaff = !!user && user.role !== 'customer'
  const isCustomer = !user || user.role === 'customer'

  const value = {
    user,
    loading,
    isInitialized,
    isAdmin,
    isStaff,
    isCustomer,
    signIn,
    signOut,
    refreshSession,
    reloadUser,
  }

  return (
    <AuthContext.Provider value={value}>
      {recoveryError && !loginCompletionPending && <AuthRecoveryNotice retrying={retryingAuth} onRetry={() => { void retryAuth() }} />}
      {children}
    </AuthContext.Provider>
  )
}
