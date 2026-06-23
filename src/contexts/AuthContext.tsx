import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, type AuthUser, sessionBackupJson } from '@/lib/supabase'
import { authTrace, logger } from '@/utils/logger'
import type { User } from '@supabase/supabase-js'
import { maskEmail } from '@/utils/security'
import { validateRedirectUrl } from '@/lib/utils'
import { setUser as setSentryUser } from '@/lib/sentry'
import {
  getSignOutRedirectPath,
  PASSWORD_RESET_FLAG_KEY,
  AUTH_CHANNEL_NAME,
} from './auth/authContextHelpers'
import { resolveUserFromSession } from './auth/resolveUserFromSession'
import { useSessionRefresh } from './auth/useSessionRefresh'
import { createAuthActions } from './auth/authActions'

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

  // デプロイ後のリロードでトークンリフレッシュが失敗した場合のリカバリー。
  // Supabase クライアント初期化前に保存したバックアップから refresh_token を取り出し、
  // setSession() で再認証を試みる。
  const tryRecoverSession = useCallback(async (): Promise<boolean> => {
    if (!sessionBackupJson) return false
    try {
      const backup = JSON.parse(sessionBackupJson)
      if (!backup?.refresh_token) return false
      authTrace('🔄 バックアップからセッション復元を試行')
      const { data, error } = await supabase.auth.setSession({
        access_token: backup.access_token ?? '',
        refresh_token: backup.refresh_token,
      })
      if (!error && data.session?.user) {
        authTrace('✅ セッション復元成功')
        await resolveUserFromSession(data.session.user, resolveDeps)
        setLoading(false)
        setIsInitialized(true)
        return true
      }
      authTrace('❌ セッション復元失敗:', error?.message)
    } catch (err) {
      authTrace('❌ セッション復元例外:', err)
    }
    return false
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveUserFromSession/resolveDeps は安定
  }, [])

  useEffect(() => {
    const authStartTime = performance.now()
    authTrace('🚀 AuthContext 初期化開始:', new Date().toISOString())
    
    // パフォーマンス最適化: 認証処理を非ブロッキング化
    // 1.2秒後に loading を落とし、ロール取得が遅い環境でも画面を先に出す
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        authTrace('⏱️ 認証処理タイムアウト（1.2秒）、ページ表示を開始')
        setLoading(false)
      }
    }, 1200)
    
    // 初期認証状態の確認（バックグラウンドで実行）
    getInitialSession().then(() => {
      clearTimeout(loadingTimeout)
      const authEndTime = performance.now()
      authTrace(`⏱️ AuthContext 初期認証完了: ${((authEndTime - authStartTime) / 1000).toFixed(2)}秒`)
      setLoading(false)
      setIsInitialized(true)  // 認証完了をマーク
    }).catch(() => {
      clearTimeout(loadingTimeout)
      setLoading(false)
      setIsInitialized(true)  // エラーでも完了とみなす
    })

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const eventStartTime = performance.now()
        authTrace('🔄 認証状態変更:', event, session?.user?.email ? maskEmail(session.user.email) : 'N/A', `(経過時間: ${((eventStartTime - authStartTime) / 1000).toFixed(2)}秒)`)
        
        // 処理中の場合はスキップ（重複実行防止）
        if (isProcessingRef.current) {
          authTrace('⏭️ 認証処理中のためスキップ:', event)
          return
        }
        
        // パスワードリセット中はロール更新をスキップ（一時セッションでロールが変わるのを防ぐ）
        if (sessionStorage.getItem(PASSWORD_RESET_FLAG_KEY)) {
          authTrace('⏭️ パスワードリセット中のためスキップ:', event)
          return
        }
        
        // 既に同じユーザーが設定されている場合はスキップ（重複実行防止）
        if (session?.user && userRef.current && userRef.current.id === session.user.id) {
          authTrace('⏭️ 既に同じユーザーが設定されているためスキップ:', event)
          setLoading(false)
          setIsInitialized(true)  // 認証完了をマーク
          return
        }
        
        // TOKEN_REFRESHEDイベントの場合は、既存のユーザー情報を保持（ロールを維持）
        if (event === 'TOKEN_REFRESHED' && session?.user && userRef.current) {
          // トークンリフレッシュ時は、既存のユーザー情報があればロールを維持
          authTrace('🔄 トークンリフレッシュ検出、既存ロールを維持:', userRef.current.role)
          setLoading(false)
          setIsInitialized(true)  // 認証完了をマーク
          return
        }
        
        // INITIAL_SESSIONイベントの場合は、getInitialSessionで処理済みの可能性があるためスキップ
        if (event === 'INITIAL_SESSION' && userRef.current) {
          authTrace('⏭️ 初期セッションは既に処理済みのためスキップ')
          setLoading(false)
          setIsInitialized(true)  // 認証完了をマーク
          return
        }
        
        if (session?.user) {
          // ⚠️ 重要: resolveUserFromSession の完了を待ってからisInitializedを設定
          // これにより、user情報が設定される前にリダイレクトが発生することを防ぐ
          resolveUserFromSession(session.user, resolveDeps).then(async () => {
            // OAuthログインモードで未登録ユーザーの場合はログアウトしてエラー表示
            if (event === 'SIGNED_IN') {
              const oauthMode = sessionStorage.getItem('oauth_mode')
              authTrace('🔑 OAuth mode:', oauthMode)
              // Google 等のソーシャルログイン時のみ「顧客レコード必須」を検証する。
              // メールのマジックリンク/OTP は app_metadata.provider が 'email' のためここでは除外。
              // oauth_mode=login が前回の試行で残っていると、新規登録→確認メール直後に
              // 顧客未作成のままサインアウトされ /login へ飛ばされるバグになる。
              const authProvider = session.user.app_metadata?.provider as string | undefined
              const isOAuthSocialSignIn = Boolean(authProvider && authProvider !== 'email')

              if (oauthMode === 'login' && isOAuthSocialSignIn) {
                const { data: customerRows } = await supabase
                  .from('customers')
                  .select('id')
                  .eq('user_id', session.user.id)
                  .order('created_at', { ascending: true })
                  .limit(1)

                if (!customerRows || customerRows.length === 0) {
                  authTrace('⚠️ OAuthログインで顧客レコード未検出、プロフィール登録へ誘導')
                  sessionStorage.removeItem('oauth_mode')
                  setLoading(false)
                  setIsInitialized(true)
                  window.location.href = '/complete-profile'
                  return
                }
              }
              sessionStorage.removeItem('oauth_mode')
            }
            
            setLoading(false)
            setIsInitialized(true)  // ユーザー情報設定完了後に認証完了をマーク
            
            // OAuthログイン後のreturnUrl処理（予約フローに戻る）
            if (event === 'SIGNED_IN') {
              const rawReturnUrl = sessionStorage.getItem('returnUrl')
              if (rawReturnUrl) {
                sessionStorage.removeItem('returnUrl')
                const safeReturnUrl = validateRedirectUrl(rawReturnUrl)
                authTrace('🔄 OAuth後のリダイレクト:', safeReturnUrl)
                // 現在のパスと異なる場合のみリダイレクト
                if (window.location.pathname !== safeReturnUrl && !safeReturnUrl.startsWith(window.location.pathname)) {
                  window.location.href = safeReturnUrl
                }
              }
            }
          }).catch((err) => {
            logger.error('❌ resolveUserFromSession error:', err)
            setLoading(false)
            setIsInitialized(true)  // エラーでも完了とみなす
          })
        } else {
          // SIGNED_OUT でユーザーが設定済みの場合（デプロイ後のリロードでトークンリフレッシュが
          // 失敗したケースなど）、バックアップからのリカバリーを試みる。
          // ただし以下の場合はスキップ:
          // - 明示的にログアウトした場合（isExplicitSignOutRef）
          // - 既にリカバリーを試行済みの場合（無限ループ防止）
          if (event === 'SIGNED_OUT' && userRef.current
              && !isExplicitSignOutRef.current
              && !recoveryAttemptedRef.current) {
            recoveryAttemptedRef.current = true
            authTrace('⚠️ SIGNED_OUT だがユーザー設定済み、リカバリーを試行')
            const recovered = await tryRecoverSession()
            if (recovered) {
              recoveryAttemptedRef.current = false
              return
            }
          }
          
          setUser(null)
          userRef.current = null
          setStaffCache(new Map())  // セッション終了時にキャッシュもクリア
          setLoading(false)
          setIsInitialized(true)  // ログアウト状態として認証完了をマーク
        }
      }
    )

    // タブがアクティブになったときにセッションをリフレッシュ（バックグラウンドでの期限切れ対策）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && userRef.current) {
        authTrace('👁️ タブがアクティブになりました、セッションを確認')
        // 非同期でリフレッシュ（UIをブロックしない）
        setTimeout(() => {
          refreshSession()
        }, 100)
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // フォーカス時にもセッションを確認（visibilitychangeが発火しない場合の対策）
    const handleFocus = () => {
      if (userRef.current) {
        authTrace('🎯 ウィンドウにフォーカス、セッションを確認')
        setTimeout(() => {
          refreshSession()
        }, 100)
      }
    }
    
    window.addEventListener('focus', handleFocus)
    
    // 定期的なセッションリフレッシュ（10分ごと）
    // Supabaseのデフォルト有効期限は1時間のため、余裕を持ってリフレッシュ
    const refreshInterval = setInterval(() => {
      if (userRef.current) {
        authTrace('⏰ 定期セッションリフレッシュ（10分間隔）')
        refreshSession()
      }
    }, 10 * 60 * 1000) // 10分

    // 複数タブ間の認証状態同期（BroadcastChannel API）
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannelRef.current = new BroadcastChannel(AUTH_CHANNEL_NAME)
      broadcastChannelRef.current.onmessage = (event) => {
        const { type, payload } = event.data
        authTrace('📡 他タブからの認証イベント受信:', type)
        
        switch (type) {
          case 'SIGNED_OUT':
            // 他のタブでログアウトした場合、このタブもログアウト状態にする
            authTrace('🚪 他タブでログアウト検出、このタブもログアウト')
            isExplicitSignOutRef.current = true
            setUser(null)
            userRef.current = null
            setStaffCache(new Map())  // キャッシュもクリア
            setIsInitialized(true)
            // ページをリロードしてクリーンな状態にする（現在の組織を維持）
            window.location.href = getSignOutRedirectPath()
            break
          case 'SIGNED_IN':
            // 他のタブでログインした場合、セッションをリフレッシュ
            authTrace('🔑 他タブでログイン検出、セッションをリフレッシュ')
            refreshSession()
            break
          case 'ROLE_CHANGED':
            // ロール変更があった場合、セッションをリフレッシュ
            authTrace('👤 他タブでロール変更検出:', payload?.role)
            refreshSession()
            break
        }
      }
      authTrace('📡 BroadcastChannel初期化完了:', AUTH_CHANNEL_NAME)
    }

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      clearInterval(refreshInterval)
      // BroadcastChannelをクローズ
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close()
        broadcastChannelRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ実行、内部関数はコールバック内で使用
  }, [refreshSession])

  async function getInitialSession() {
    const startTime = performance.now()
    authTrace('🚀 初期セッション取得開始')
    try {
      const sessionStartTime = performance.now()
      const { data: { session: initialSession }, error } = await supabase.auth.getSession()
      let session = initialSession
      const sessionEndTime = performance.now()
      authTrace(`⏱️ getSession 完了: ${((sessionEndTime - sessionStartTime) / 1000).toFixed(2)}秒`)
      
      if (error) {
        logger.error('❌ セッション取得エラー:', error)
        return
      }
      
      if (session?.user) {
        // 残り1時間未満で毎回 refresh すると約1時間寿命のJWTでほぼ常に走り、起動・ログインが重くなる。
        // 直前（5分）だけ手動リフレッシュ（SDK の autoRefreshToken に任せる）
        const now = Date.now()
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
        const refreshIfRemainingLessThanMs = 5 * 60 * 1000

        if (expiresAt && expiresAt - now < refreshIfRemainingLessThanMs) {
          authTrace('🔄 セッション有効期限が近いため、リフレッシュを試行')
          try {
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
            if (refreshError) {
              logger.warn('⚠️ リフレッシュ失敗:', refreshError.message)
            } else if (refreshData.session) {
              session = refreshData.session
              authTrace('✅ セッションリフレッシュ成功')
            }
          } catch (refreshErr) {
            logger.warn('⚠️ リフレッシュ例外:', refreshErr)
          }
        }
        
        authTrace('👤 セッションユーザー発見:', maskEmail(session.user.email))
        await resolveUserFromSession(session.user, resolveDeps)
      } else {
        // セッションがない場合、Refresh Tokenからの復元を試みる
        authTrace('🔄 セッションなし、リフレッシュで復元を試行')
        try {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
          if (!refreshError && refreshData.session?.user) {
            authTrace('✅ リフレッシュでセッション復元成功:', maskEmail(refreshData.session.user.email))
            await resolveUserFromSession(refreshData.session.user, resolveDeps)
            return
          }
        } catch (refreshErr) {
          authTrace('⏭️ リフレッシュ復元失敗')
        }
        
        // SDK の refreshSession も失敗した場合、クライアント初期化前に保存した
        // バックアップ（supabase.ts で保存）から復元を試みる。
        // デプロイ後のリロードで autoRefreshToken が旧トークンを消費→
        // レスポンス受信前にリロード→新トークン未保存、という競合で
        // localStorage のセッションが消えるケースに対応。
        const recovered = await tryRecoverSession()
        if (recovered) return
        
        authTrace('👤 セッションユーザーなし')
      }
    } catch (error) {
      logger.error('❌ 初期セッション取得エラー:', error)
    } finally {
      const endTime = performance.now()
      authTrace('✅ 初期セッション処理完了')
      authTrace(`⏱️ getInitialSession 総時間: ${((endTime - startTime) / 1000).toFixed(2)}秒`)
      setLoading(false)
    }
  }

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
