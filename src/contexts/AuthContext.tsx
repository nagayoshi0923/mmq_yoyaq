import React, { createContext, useContext, useState } from 'react'
import { type AuthUser } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import { setUser as setSentryUser } from '@/lib/sentry'
import { useSessionRefresh } from './auth/useSessionRefresh'
import { createAuthActions } from './auth/authActions'
import { createSessionBootstrap } from './auth/sessionBootstrap'
import { useAuthLifecycle } from './auth/useAuthLifecycle'

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
  const [staffCache, setStaffCache] = useState<Map<string, string>>(new Map())
  // 最新のユーザー情報を保持するためのref（クロージャー問題を回避）
  const userRef = React.useRef<AuthUser | null>(null)
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
  const resolveDeps = { isProcessingRef, userRef, staffCache, setStaffCache, setUser }

  // 手動セッションリフレッシュ（auth/useSessionRefresh.ts へ切り出し）
  const refreshSession = useSessionRefresh(userRef, setUser)

  // signIn / signOut（auth/authActions.ts へ切り出し）
  const { signIn, signOut } = createAuthActions({
    userRef,
    broadcastChannelRef,
    isExplicitSignOutRef,
    setUser,
    setStaffCache,
    setLoading,
  })

  // 初期セッション取得・バックアップ復元（auth/sessionBootstrap.ts へ切り出し）
  const { getInitialSession, tryRecoverSession } = createSessionBootstrap({
    resolveDeps,
    setLoading,
    setIsInitialized,
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
  })

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
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
