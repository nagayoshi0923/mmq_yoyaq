import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, type AuthUser } from '@/lib/supabase'
import { authTrace, logger } from '@/utils/logger'
import type { User } from '@supabase/supabase-js'
import { determineUserRole } from '@/utils/authUtils'
import { maskEmail } from '@/utils/security'
import { validateRedirectUrl } from '@/lib/utils'
import { setUser as setSentryUser } from '@/lib/sentry'

/**
 * 現在のURLからorganizationSlugを抽出するヘルパー関数
 */
function getOrganizationSlugFromUrl(): string {
  const hash = window.location.hash.replace('#', '')
  const bookingMatch = hash.match(/^booking\/([^/]+)/)
  return bookingMatch ? bookingMatch[1] : 'queens-waltz'
}

// パスワードリセット中フラグのキー（sessionStorage使用）
const PASSWORD_RESET_FLAG_KEY = 'MMQ_PASSWORD_RESET_IN_PROGRESS'

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  isInitialized: boolean  // 初期認証が完了したか（タイムアウトではなく、実際に完了）
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

// 複数タブ間で認証状態を同期するためのチャンネル名
const AUTH_CHANNEL_NAME = 'mmq-auth-sync'

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
function logAuthEvent(
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

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)  // 認証完了フラグ
  const [staffCache, setStaffCache] = useState<Map<string, string>>(new Map())
  // 最新のユーザー情報を保持するためのref（クロージャー問題を回避）
  const userRef = React.useRef<AuthUser | null>(null)
  // 認証処理中のフラグ（クロージャー問題を回避するためuseRefを使用）
  const isProcessingRef = React.useRef<boolean>(false)
  // 最後のトークンリフレッシュ時間（重複リフレッシュ防止）
  const lastRefreshRef = React.useRef<number>(0)
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
  
  // 手動セッションリフレッシュ関数
  const refreshSession = useCallback(async () => {
    const now = Date.now()
    // 30秒以内に既にリフレッシュした場合はスキップ
    if (now - lastRefreshRef.current < 30000) {
      authTrace('⏭️ セッションリフレッシュ: 30秒以内に既に実行済み、スキップ')
      return
    }
    
    lastRefreshRef.current = now
    authTrace('🔄 セッションリフレッシュ開始')
    
    try {
      // まず現在のセッション状態を確認（不要なrefreshを避ける）
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        logger.error('❌ セッション確認エラー:', sessionError)
        return
      }
      
      const session = sessionData.session
      if (!session) {
        authTrace('⏭️ セッションなし: リフレッシュをスキップ')
        return
      }
      
      // 有効期限まで十分余裕がある場合はリフレッシュしない
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
      const refreshThresholdMs = 15 * 60 * 1000 // 15分前からリフレッシュ開始
      if (expiresAt && expiresAt - now > refreshThresholdMs) {
        authTrace('⏭️ セッション有効: リフレッシュ不要（残り', Math.round((expiresAt - now) / 60000), '分）')
        return
      }
      
      authTrace('🔄 セッション有効期限が近いためリフレッシュ開始（残り', Math.round((expiresAt - now) / 60000), '分）')
      
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        logger.error('❌ セッションリフレッシュエラー:', error)
        
        // リフレッシュに失敗した場合も、直ちにログアウトせずに再確認
        if (error.message?.includes('Invalid Refresh Token') || 
            error.message?.includes('Refresh Token Not Found')) {
          const { data: retrySession } = await supabase.auth.getSession()
          if (!retrySession.session) {
            setUser(null)
            userRef.current = null
          } else {
            authTrace('⚠️ リフレッシュ失敗だがセッションは有効: 状態維持')
          }
        }
        return
      }
      
      if (data.session) {
        authTrace('✅ セッションリフレッシュ成功')
      }
    } catch (err) {
      logger.error('❌ セッションリフレッシュ例外:', err)
    }
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
          // ⚠️ 重要: setUserFromSessionの完了を待ってからisInitializedを設定
          // これにより、user情報が設定される前にリダイレクトが発生することを防ぐ
          setUserFromSession(session.user).then(async () => {
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
          }).catch(err => {
            logger.error('❌ setUserFromSession error:', err)
            setLoading(false)
            setIsInitialized(true)  // エラーでも完了とみなす
          })
        } else {
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
            setUser(null)
            userRef.current = null
            setStaffCache(new Map())  // キャッシュもクリア
            setIsInitialized(true)
            // ページをリロードしてクリーンな状態にする（現在の組織を維持）
            const slug = getOrganizationSlugFromUrl()
            window.location.href = `/${slug}`
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
              // リフレッシュ失敗でも、既存セッションがあれば続行
            } else if (refreshData.session) {
              session = refreshData.session
              authTrace('✅ セッションリフレッシュ成功')
            }
          } catch (refreshErr) {
            logger.warn('⚠️ リフレッシュ例外:', refreshErr)
          }
        }
        
        authTrace('👤 セッションユーザー発見:', maskEmail(session.user.email))
        await setUserFromSession(session.user)
      } else {
        // セッションがない場合、Refresh Tokenからの復元を試みる
        authTrace('🔄 セッションなし、リフレッシュで復元を試行')
        try {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
          if (!refreshError && refreshData.session?.user) {
            authTrace('✅ リフレッシュでセッション復元成功:', maskEmail(refreshData.session.user.email))
            await setUserFromSession(refreshData.session.user)
            return
          }
        } catch (refreshErr) {
          authTrace('⏭️ リフレッシュ復元失敗（未ログイン状態）')
        }
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

  async function setUserFromSession(supabaseUser: User) {
    // 既に処理中の場合はスキップ（重複呼び出し防止）
    // ただし、userがまだセットされていない場合は処理を続行する（初期化時の競合対策）
    if (isProcessingRef.current && userRef.current) {
      authTrace('⏭️ 処理中のためスキップ:', maskEmail(supabaseUser.email))
      return
    }
    
    const startTime = performance.now()
    isProcessingRef.current = true
    authTrace('🔐 ユーザーセッション設定開始:', maskEmail(supabaseUser.email))
    authTrace(`⏱️ setUserFromSession 開始: ${maskEmail(supabaseUser.email)} (${new Date().toISOString()})`)
    
    // 既存のユーザー情報を保持（エラー時のフォールバック用）
    // useStateのクロージャー問題を回避するため、refから取得
    const existingUser = userRef.current
    
    try {
      // データベースからユーザーのロールを取得
      let role: 'admin' | 'staff' | 'customer' | 'license_admin' = 'customer'
      
      authTrace('📊 usersテーブルからロール取得開始')
      try {
        // 遅い場合でも長く待つとログインが重いので短めに切る（成功時は通常数百ms）
        const timeoutMs = 2000
            
            const rolePromise = supabase
              .from('users')
              .select('role')
              .eq('id', supabaseUser.id)
              .maybeSingle()

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('ロール取得タイムアウト')), timeoutMs)
            )

            const result = await Promise.race([
              rolePromise,
              timeoutPromise
            ]) as { data: { role: string } | null; error: Error | null } | undefined
            
            // Supabaseのレスポンス形式を確認
            if (result && (result.data !== undefined || result.error !== undefined)) {
          const userData = result.data
          const roleError = result.error
              
              // エラーがある場合は詳細をログに記録
              if (result.error) {
                logger.warn('⚠️ ロール取得エラー:', result.error)
                // RLSポリシーエラーの場合は特別に処理
                if (result.error.message?.includes('permission') || result.error.message?.includes('RLS')) {
                  logger.warn('⚠️ RLSポリシーエラーの可能性があります。データベースのRLSポリシーを確認してください。')
                }
              }
              
          if (userData?.role) {
          role = userData.role as 'admin' | 'staff' | 'customer' | 'license_admin'
          authTrace('✅ データベースからロール取得:', role)
          } else if (roleError) {
            throw roleError
          }
        }
      } catch (error: any) {
        logger.warn('⚠️ ロール取得失敗（タイムアウト/エラー）:', error?.message || error)
        
        // レコードが存在しない場合のみ、作成する（既存のロールを上書きしない）
        if (error?.code === 'PGRST116') {
          authTrace('📝 usersテーブルにレコードが存在しないため、作成します')
          
          // 🔴 重要: スタッフテーブルにメールアドレスが存在するか確認
          // 招待済みスタッフが自己登録した場合も、スタッフとして紐付ける
          let newRole = determineUserRole(supabaseUser.email)
          
          try {
            // まずuser_idで検索（既に紐付けられている場合）
            const { data: staffByUserId } = await supabase
              .from('staff')
              .select('id')
              .eq('user_id', supabaseUser.id)
              .maybeSingle()
            
            if (staffByUserId) {
              newRole = 'staff'
              authTrace('✅ スタッフテーブルにuser_id紐付けあり: staffロールを設定')
            } else {
              // user_idで見つからない場合、メールアドレスで検索
              // （招待済みだが自己登録したケース、または招待期限切れ後の自己登録）
              const { data: staffByEmail } = await supabase
                .from('staff')
                .select('id, user_id, name')
                .eq('email', supabaseUser.email)
                .maybeSingle()
              
              if (staffByEmail) {
                authTrace('✅ スタッフテーブルにメールアドレス一致あり:', staffByEmail.name)
                
                // staffテーブルのuser_idを確認
                if (!staffByEmail.user_id) {
                  // user_idがnullの場合のみ紐付ける
                  newRole = 'staff'
                  const { error: updateError } = await supabase
                    .from('staff')
                    .update({ user_id: supabaseUser.id, updated_at: new Date().toISOString() })
                    .eq('id', staffByEmail.id)
                  
                  if (updateError) {
                    logger.warn('⚠️ スタッフテーブルのuser_id更新エラー:', updateError)
                  } else {
                    authTrace('✅ スタッフテーブルにuser_idを紐付けました:', supabaseUser.id)
                  }
                } else if (staffByEmail.user_id === supabaseUser.id) {
                  // 既に同じユーザーに紐付いている場合はstaffロールを維持
                  newRole = 'staff'
                  authTrace('✅ 既に同じユーザーに紐付け済み')
                } else {
                  // 既に別のユーザーに紐付いている場合は上書きしない（顧客として扱う）
                  logger.warn('⚠️ スタッフレコードは既に別のユーザーに紐付いています。上書きしません。user_id:', staffByEmail.user_id)
                }
              }
            }
          } catch (staffErr) {
            logger.warn('⚠️ スタッフテーブル確認エラー:', staffErr)
          }
          
          // usersテーブルにレコードを作成（insertで新規のみ、upsertしない）
          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: supabaseUser.id,
              email: supabaseUser.email!,
              role: newRole,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
          
          if (insertError) {
            // 重複エラーの場合は既存レコードがあるので、再取得を試みる
            if (insertError.code === '23505') {
              authTrace('📋 既存レコードあり、再取得を試みます')
              const { data: retryData } = await supabase
                .from('users')
                .select('role')
                .eq('id', supabaseUser.id)
                .single()
          
              if (retryData?.role) {
                role = retryData.role as 'admin' | 'staff' | 'customer' | 'license_admin'
                authTrace('✅ 既存ロールを取得:', role)
              } else {
                role = newRole
              }
            } else {
              logger.warn('⚠️ usersテーブルへのレコード作成に失敗しました:', insertError)
            role = newRole // フォールバックとして使用
            }
          } else {
            role = newRole
            authTrace('✅ usersテーブルにレコードを作成しました:', role)
          }
        } else if (error?.message?.includes('ロール取得タイムアウト')) {
          // タイムアウトの場合: 既存のロールを保持、なければスタッフチェック
          if (existingUser && existingUser.id === supabaseUser.id) {
            role = existingUser.role
            authTrace('🔄 タイムアウト: 既存のロールを保持:', role)
          } else {
            // スタッフテーブルをチェック（user_idとemailの両方で検索）
            try {
              const { data: staffByUserId } = await supabase
                .from('staff')
                .select('id')
                .eq('user_id', supabaseUser.id)
                .maybeSingle()
              
              if (staffByUserId) {
                role = 'staff'
                authTrace('✅ スタッフテーブルにuser_id紐付けあり: staffロールを使用')
              } else {
                // メールアドレスでも検索
                const { data: staffByEmail } = await supabase
                  .from('staff')
                  .select('id')
                  .eq('email', supabaseUser.email)
                  .maybeSingle()
                
                if (staffByEmail) {
                  role = 'staff'
                  authTrace('✅ スタッフテーブルにメールアドレス一致あり: staffロールを使用')
                } else {
                  role = determineUserRole(supabaseUser.email)
                  authTrace('🔄 タイムアウトフォールバック:', role)
                }
              }
            } catch {
              role = determineUserRole(supabaseUser.email)
              authTrace('🔄 タイムアウトフォールバック:', role)
            }
          }
        } else {
          // その他のエラー: 既存のユーザー情報があればそのロールを保持
          if (existingUser && existingUser.id === supabaseUser.id && existingUser.role !== 'customer') {
            role = existingUser.role
            authTrace('🔄 例外発生、既存のロールを保持:', role)
          } else {
            // スタッフテーブルをチェック（user_idとemailの両方で検索）
            try {
              const { data: staffByUserId } = await supabase
                .from('staff')
                .select('id')
                .eq('user_id', supabaseUser.id)
                .maybeSingle()
              
              if (staffByUserId) {
                role = 'staff'
                authTrace('✅ スタッフテーブルにuser_id紐付けあり: staffロールを使用')
              } else {
                // メールアドレスでも検索
                const { data: staffByEmail } = await supabase
                  .from('staff')
                  .select('id')
                  .eq('email', supabaseUser.email)
                  .maybeSingle()
                
                if (staffByEmail) {
                  role = 'staff'
                  authTrace('✅ スタッフテーブルにメールアドレス一致あり: staffロールを使用')
                } else {
                  role = determineUserRole(supabaseUser.email)
                  authTrace('🔄 例外フォールバック: メールアドレスからロール判定 ->', role)
                }
              }
            } catch {
              role = determineUserRole(supabaseUser.email)
              authTrace('🔄 例外フォールバック:', role)
            }
          }
        }
      }

      // ユーザー名を生成（メールアドレスから@より前の部分を使用、またはメタデータから取得）
      const displayName = supabaseUser.user_metadata?.full_name || 
                         supabaseUser.user_metadata?.name ||
                         supabaseUser.email?.split('@')[0] ||
                         'ユーザー'

      // スタッフ情報は遅延ロード（認証処理をブロックしない）
      let staffName: string | undefined
      let customerName: string | undefined
      
      // キャッシュから確認のみ（既に取得済みの場合のみ使用）
      const cachedName = staffCache.get(supabaseUser.id)
      if (cachedName) {
        staffName = cachedName
        authTrace('📋 ⚡ キャッシュからスタッフ名取得:', staffName)
      } else if (role === 'customer') {
        // 顧客の場合、customersテーブルから名前を取得（バックグラウンド）
        authTrace('📋 顧客情報をバックグラウンドで取得開始')
        ;(async () => {
          try {
            const { data } = await supabase
              .from('customers')
              .select('name, nickname')
              .eq('user_id', supabaseUser.id)
              .maybeSingle()
            
            if (data) {
              // ニックネーム優先、なければ名前
              const name = data.nickname || data.name
              if (name) {
                authTrace('📋 ✅ バックグラウンドで顧客名取得成功:', name)
                // ユーザー情報も更新してヘッダーに反映
                setUser(prev => prev ? { ...prev, customerName: name, name: name } : prev)
              }
            } else {
              // user_idで見つからない場合、メールアドレスで検索して自動紐付け
              // 🚨 重要: user_idがnullのレコードのみを対象にする（他ユーザーと紐付き済みのレコードは除外）
              const { data: customerByEmail } = await supabase
                .from('customers')
                .select('id, name, nickname, user_id')
                .eq('email', supabaseUser.email)
                .is('user_id', null)  // まだ紐付けされていないレコードのみ
                .maybeSingle()
              
              if (customerByEmail) {
                const name = customerByEmail.nickname || customerByEmail.name
                if (name) {
                  authTrace('📋 🔗 メールアドレスで顧客発見、自動紐付け:', name)
                  // user_idを設定して紐付け
                  const { error: updateError } = await supabase
                    .from('customers')
                    .update({ user_id: supabaseUser.id })
                    .eq('id', customerByEmail.id)
                  
                  if (!updateError) {
                    authTrace('📋 ✅ 顧客自動紐付け成功:', name)
                    setUser(prev => prev ? { ...prev, customerName: name, name: name } : prev)
                  } else {
                    logger.warn('📋 ⚠️ 顧客紐付けエラー:', updateError)
                    // エラーでも名前は表示する
                    setUser(prev => prev ? { ...prev, customerName: name, name: name } : prev)
                  }
                }
              }
            }
          } catch (error) {
            authTrace('📋 顧客情報の取得エラー（バックグラウンド）:', error)
          }
        })()
      } else {
        // バックグラウンドで非同期取得（認証完了を待たない）
        if (role === 'staff' || role === 'admin') {
          authTrace('📋 スタッフ情報をバックグラウンドで取得開始')
          // 非同期で取得（await しない）
          const staffPromise = supabase
            .from('staff')
            .select('id, name, user_id')
            .eq('user_id', supabaseUser.id)
            .maybeSingle()
          
          Promise.resolve(staffPromise).then(async ({ data }) => {
              if (data?.name) {
                setStaffCache(prev => new Map(prev.set(supabaseUser.id, data.name)))
                authTrace('📋 ✅ バックグラウンドでスタッフ名取得成功:', data.name)
                // ユーザー情報も更新してヘッダーに反映
                setUser(prev => prev ? { ...prev, staffName: data.name } : prev)
              } else {
                // user_idで見つからない場合、メールアドレスで検索して自動紐付け
                authTrace('📋 user_idで見つからないため、メールアドレスで検索:', maskEmail(supabaseUser.email))
                const { data: staffByEmail } = await supabase
                  .from('staff')
                  .select('id, name, user_id')
                  .eq('email', supabaseUser.email)
                  .is('user_id', null)
                  .maybeSingle()
                
                if (staffByEmail) {
                  authTrace('📋 🔗 メールアドレスでスタッフ発見、自動紐付け:', staffByEmail.name)
                  // user_idを設定して紐付け
                  const { error: updateError } = await supabase
                    .from('staff')
                    .update({ user_id: supabaseUser.id })
                    .eq('id', staffByEmail.id)
                  
                  if (!updateError) {
                    setStaffCache(prev => new Map(prev.set(supabaseUser.id, staffByEmail.name)))
                    authTrace('📋 ✅ スタッフ自動紐付け成功:', staffByEmail.name)
                    setUser(prev => prev ? { ...prev, staffName: staffByEmail.name } : prev)
                    
                    // usersテーブルのroleをstaffに更新（adminの場合は降格させない）
                    // 🚨 重要: usersテーブルの既存ロールを必ず確認する
                    const { data: existingUserData } = await supabase
                      .from('users')
                      .select('role')
                      .eq('id', supabaseUser.id)
                      .maybeSingle()
                    
                    if (existingUserData?.role === 'admin') {
                      authTrace('📋 ⏭️ 既存ロールがadminのため、降格をスキップ')
                    } else if (role !== 'admin') {
                      await supabase
                        .from('users')
                        .update({ role: 'staff' })
                        .eq('id', supabaseUser.id)
                      authTrace('📋 ✅ ユーザーロールをstaffに更新')
                    }
                  } else {
                    logger.warn('📋 ⚠️ スタッフ紐付けエラー:', updateError)
                  }
                }
              }
          }).catch((error) => {
              authTrace('📋 スタッフ情報の取得エラー（バックグラウンド）:', error)
            })
        }
      }

      // ロール変更を検出してログに記録
      if (existingUser && existingUser.role !== role) {
        authTrace('🔄 ロール変更検出:', { 
          old: existingUser.role, 
          new: role 
        })
        logAuthEvent('role_change', supabaseUser.id, {
          oldRole: existingUser.role,
          newRole: role,
          success: true,
        })
      }
      
      const userData = {
        id: supabaseUser.id,
        email: supabaseUser.email!,
        name: displayName,
        staffName: staffName,
        role: role
      }
      
      authTrace('✅ ユーザー情報設定完了:', { 
        email: userData.email, 
        name: userData.name, 
        staffName: userData.staffName, 
        role: userData.role 
      })
      
      setUser(userData)
      userRef.current = userData
      // ロール情報はusersテーブルから取得済み（上記のロジックで処理）
    } catch (error) {
      logger.error('❌ ユーザーセッション設定エラー:', error)
      // エラー時も既存のユーザー情報を保持（ロールを維持）
      if (existingUser && existingUser.id === supabaseUser.id) {
        authTrace('🔄 エラー発生、既存のユーザー情報を保持:', existingUser.role)
        setUser(existingUser)
        userRef.current = existingUser
      } else {
        // 既存情報がない場合のみデフォルトのcustomerロールを設定
        const displayName = supabaseUser.user_metadata?.full_name || 
                           supabaseUser.user_metadata?.name ||
                           supabaseUser.email?.split('@')[0] ||
                           'ユーザー'
        
        const fallbackUserData = {
          id: supabaseUser.id,
          email: supabaseUser.email!,
          name: displayName,
          staffName: undefined,
          role: 'customer' as const
        }
        
        authTrace('🔄 フォールバックユーザー情報設定:', fallbackUserData)
        setUser(fallbackUserData)
        userRef.current = fallbackUserData
      }
    } finally {
      const endTime = performance.now()
      isProcessingRef.current = false
      authTrace(`⏱️ setUserFromSession 完了: ${maskEmail(supabaseUser.email)} (${((endTime - startTime) / 1000).toFixed(2)}秒)`)
    }
  }

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
      const slug = getOrganizationSlugFromUrl()
      window.location.href = `/${slug}`
    } catch (error) {
      setLoading(false)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const value = {
    user,
    loading,
    isInitialized,
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