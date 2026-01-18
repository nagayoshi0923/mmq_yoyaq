import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, type AuthUser } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { User } from '@supabase/supabase-js'
import { determineUserRole } from '@/utils/authUtils'
import { maskEmail } from '@/utils/security'

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
  signIn: (email: string, password: string) => Promise<void>
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
 * 認証イベントをログに記録
 */
async function logAuthEvent(
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
  try {
    // クライアント側でIPアドレスとUser-Agentを取得
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null
    
    const { error } = await supabase.from('auth_logs').insert({
      user_id: userId,
      event_type: eventType,
      old_role: options?.oldRole,
      new_role: options?.newRole,
      user_agent: userAgent,
      success: options?.success ?? true,
      error_message: options?.errorMessage,
      metadata: options?.metadata ?? {},
    })
    
    if (error) {
      logger.warn('⚠️ 認証ログ記録エラー:', error)
    }
  } catch (err) {
    // ログ記録の失敗は認証処理を阻害しない
    logger.warn('⚠️ 認証ログ記録例外:', err)
  }
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
  
  // 手動セッションリフレッシュ関数
  const refreshSession = useCallback(async () => {
    const now = Date.now()
    // 30秒以内に既にリフレッシュした場合はスキップ
    if (now - lastRefreshRef.current < 30000) {
      logger.log('⏭️ セッションリフレッシュ: 30秒以内に既に実行済み、スキップ')
      return
    }
    
    lastRefreshRef.current = now
    logger.log('🔄 セッションリフレッシュ開始')
    
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        logger.error('❌ セッションリフレッシュエラー:', error)
        // リフレッシュに失敗した場合、サインアウト状態にする
        if (error.message?.includes('Invalid Refresh Token') || 
            error.message?.includes('Refresh Token Not Found')) {
          setUser(null)
          userRef.current = null
        }
        return
      }
      
      if (data.session) {
        logger.log('✅ セッションリフレッシュ成功')
      }
    } catch (err) {
      logger.error('❌ セッションリフレッシュ例外:', err)
    }
  }, [])

  useEffect(() => {
    const authStartTime = performance.now()
    logger.log('🚀 AuthContext 初期化開始:', new Date().toISOString())
    
    // パフォーマンス最適化: 認証処理を非ブロッキング化
    // 2秒後にloadingをfalseにして、ページを表示開始（ロール取得に時間がかかる場合の保険）
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        logger.log('⏱️ 認証処理タイムアウト（2秒）、ページ表示を開始')
        setLoading(false)
      }
    }, 2000)
    
    // 初期認証状態の確認（バックグラウンドで実行）
    getInitialSession().then(() => {
      clearTimeout(loadingTimeout)
      const authEndTime = performance.now()
      logger.log(`⏱️ AuthContext 初期認証完了: ${((authEndTime - authStartTime) / 1000).toFixed(2)}秒`)
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
        logger.log('🔄 認証状態変更:', event, session?.user?.email ? maskEmail(session.user.email) : 'N/A', `(経過時間: ${((eventStartTime - authStartTime) / 1000).toFixed(2)}秒)`)
        
        // 処理中の場合はスキップ（重複実行防止）
        if (isProcessingRef.current) {
          logger.log('⏭️ 認証処理中のためスキップ:', event)
          return
        }
        
        // パスワードリセット中はロール更新をスキップ（一時セッションでロールが変わるのを防ぐ）
        if (sessionStorage.getItem(PASSWORD_RESET_FLAG_KEY)) {
          logger.log('⏭️ パスワードリセット中のためスキップ:', event)
          return
        }
        
        // 既に同じユーザーが設定されている場合はスキップ（重複実行防止）
        if (session?.user && userRef.current && userRef.current.id === session.user.id) {
          logger.log('⏭️ 既に同じユーザーが設定されているためスキップ:', event)
          setLoading(false)
          setIsInitialized(true)  // 認証完了をマーク
          return
        }
        
        // TOKEN_REFRESHEDイベントの場合は、既存のユーザー情報を保持（ロールを維持）
        if (event === 'TOKEN_REFRESHED' && session?.user && userRef.current) {
          // トークンリフレッシュ時は、既存のユーザー情報があればロールを維持
          logger.log('🔄 トークンリフレッシュ検出、既存ロールを維持:', userRef.current.role)
          setLoading(false)
          setIsInitialized(true)  // 認証完了をマーク
          return
        }
        
        // INITIAL_SESSIONイベントの場合は、getInitialSessionで処理済みの可能性があるためスキップ
        if (event === 'INITIAL_SESSION' && userRef.current) {
          logger.log('⏭️ 初期セッションは既に処理済みのためスキップ')
          setLoading(false)
          setIsInitialized(true)  // 認証完了をマーク
          return
        }
        
        if (session?.user) {
          // ⚠️ 重要: setUserFromSessionの完了を待ってからisInitializedを設定
          // これにより、user情報が設定される前にリダイレクトが発生することを防ぐ
          setUserFromSession(session.user).then(() => {
            setLoading(false)
            setIsInitialized(true)  // ユーザー情報設定完了後に認証完了をマーク
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
        logger.log('👁️ タブがアクティブになりました、セッションを確認')
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
        logger.log('🎯 ウィンドウにフォーカス、セッションを確認')
        setTimeout(() => {
          refreshSession()
        }, 100)
      }
    }
    
    window.addEventListener('focus', handleFocus)

    // 複数タブ間の認証状態同期（BroadcastChannel API）
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannelRef.current = new BroadcastChannel(AUTH_CHANNEL_NAME)
      broadcastChannelRef.current.onmessage = (event) => {
        const { type, payload } = event.data
        logger.log('📡 他タブからの認証イベント受信:', type)
        
        switch (type) {
          case 'SIGNED_OUT':
            // 他のタブでログアウトした場合、このタブもログアウト状態にする
            logger.log('🚪 他タブでログアウト検出、このタブもログアウト')
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
            logger.log('🔑 他タブでログイン検出、セッションをリフレッシュ')
            refreshSession()
            break
          case 'ROLE_CHANGED':
            // ロール変更があった場合、セッションをリフレッシュ
            logger.log('👤 他タブでロール変更検出:', payload?.role)
            refreshSession()
            break
        }
      }
      logger.log('📡 BroadcastChannel初期化完了:', AUTH_CHANNEL_NAME)
    }

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
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
    logger.log('🚀 初期セッション取得開始')
    try {
      const sessionStartTime = performance.now()
      const { data: { session }, error } = await supabase.auth.getSession()
      const sessionEndTime = performance.now()
      logger.log(`⏱️ getSession 完了: ${((sessionEndTime - sessionStartTime) / 1000).toFixed(2)}秒`)
      
      if (error) {
        logger.error('❌ セッション取得エラー:', error)
        return
      }
      
      if (session?.user) {
        logger.log('👤 セッションユーザー発見:', maskEmail(session.user.email))
        await setUserFromSession(session.user)
      } else {
        logger.log('👤 セッションユーザーなし')
      }
    } catch (error) {
      logger.error('❌ 初期セッション取得エラー:', error)
    } finally {
      const endTime = performance.now()
      logger.log('✅ 初期セッション処理完了')
      logger.log(`⏱️ getInitialSession 総時間: ${((endTime - startTime) / 1000).toFixed(2)}秒`)
      setLoading(false)
    }
  }

  async function setUserFromSession(supabaseUser: User) {
    // 既に処理中の場合はスキップ（重複呼び出し防止）
    // ただし、userがまだセットされていない場合は処理を続行する（初期化時の競合対策）
    if (isProcessingRef.current && userRef.current) {
      logger.log('⏭️ 処理中のためスキップ:', maskEmail(supabaseUser.email))
      return
    }
    
    const startTime = performance.now()
    isProcessingRef.current = true
    logger.log('🔐 ユーザーセッション設定開始:', maskEmail(supabaseUser.email))
    logger.log(`⏱️ setUserFromSession 開始: ${maskEmail(supabaseUser.email)} (${new Date().toISOString()})`)
    
    // 既存のユーザー情報を保持（エラー時のフォールバック用）
    // useStateのクロージャー問題を回避するため、refから取得
    const existingUser = userRef.current
    
    try {
      // データベースからユーザーのロールを取得
      let role: 'admin' | 'staff' | 'customer' | 'license_admin' = 'customer'
      
      logger.log('📊 usersテーブルからロール取得開始')
      try {
        // パフォーマンス最適化: リトライなし、タイムアウト3秒で早期フォールバック
        // RLS有効化後はクエリが少し遅くなるため、タイムアウトを延長
        const timeoutMs = 3000
            
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
          logger.log('✅ データベースからロール取得:', role)
          } else if (roleError) {
            throw roleError
          }
        }
      } catch (error: any) {
        logger.warn('⚠️ ロール取得失敗（タイムアウト/エラー）:', error?.message || error)
        
        // レコードが存在しない場合のみ、作成する（既存のロールを上書きしない）
        if (error?.code === 'PGRST116') {
          logger.log('📝 usersテーブルにレコードが存在しないため、作成します')
          
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
              logger.log('✅ スタッフテーブルにuser_id紐付けあり: staffロールを設定')
            } else {
              // user_idで見つからない場合、メールアドレスで検索
              // （招待済みだが自己登録したケース、または招待期限切れ後の自己登録）
              const { data: staffByEmail } = await supabase
                .from('staff')
                .select('id, user_id, name')
                .eq('email', supabaseUser.email)
                .maybeSingle()
              
              if (staffByEmail) {
                logger.log('✅ スタッフテーブルにメールアドレス一致あり:', staffByEmail.name)
                
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
                    logger.log('✅ スタッフテーブルにuser_idを紐付けました:', supabaseUser.id)
                  }
                } else if (staffByEmail.user_id === supabaseUser.id) {
                  // 既に同じユーザーに紐付いている場合はstaffロールを維持
                  newRole = 'staff'
                  logger.log('✅ 既に同じユーザーに紐付け済み')
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
              logger.log('📋 既存レコードあり、再取得を試みます')
              const { data: retryData } = await supabase
                .from('users')
                .select('role')
                .eq('id', supabaseUser.id)
                .single()
          
              if (retryData?.role) {
                role = retryData.role as 'admin' | 'staff' | 'customer' | 'license_admin'
                logger.log('✅ 既存ロールを取得:', role)
              } else {
                role = newRole
              }
            } else {
              logger.warn('⚠️ usersテーブルへのレコード作成に失敗しました:', insertError)
            role = newRole // フォールバックとして使用
            }
          } else {
            role = newRole
            logger.log('✅ usersテーブルにレコードを作成しました:', role)
          }
        } else if (error?.message?.includes('ロール取得タイムアウト')) {
          // タイムアウトの場合: 既存のロールを保持、なければスタッフチェック
          if (existingUser && existingUser.id === supabaseUser.id) {
            role = existingUser.role
            logger.log('🔄 タイムアウト: 既存のロールを保持:', role)
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
                logger.log('✅ スタッフテーブルにuser_id紐付けあり: staffロールを使用')
              } else {
                // メールアドレスでも検索
                const { data: staffByEmail } = await supabase
                  .from('staff')
                  .select('id')
                  .eq('email', supabaseUser.email)
                  .maybeSingle()
                
                if (staffByEmail) {
                  role = 'staff'
                  logger.log('✅ スタッフテーブルにメールアドレス一致あり: staffロールを使用')
                } else {
                  role = determineUserRole(supabaseUser.email)
                  logger.log('🔄 タイムアウトフォールバック:', role)
                }
              }
            } catch {
              role = determineUserRole(supabaseUser.email)
              logger.log('🔄 タイムアウトフォールバック:', role)
            }
          }
        } else {
          // その他のエラー: 既存のユーザー情報があればそのロールを保持
          if (existingUser && existingUser.id === supabaseUser.id && existingUser.role !== 'customer') {
            role = existingUser.role
            logger.log('🔄 例外発生、既存のロールを保持:', role)
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
                logger.log('✅ スタッフテーブルにuser_id紐付けあり: staffロールを使用')
              } else {
                // メールアドレスでも検索
                const { data: staffByEmail } = await supabase
                  .from('staff')
                  .select('id')
                  .eq('email', supabaseUser.email)
                  .maybeSingle()
                
                if (staffByEmail) {
                  role = 'staff'
                  logger.log('✅ スタッフテーブルにメールアドレス一致あり: staffロールを使用')
                } else {
                  role = determineUserRole(supabaseUser.email)
                  logger.log('🔄 例外フォールバック: メールアドレスからロール判定 ->', role)
                }
              }
            } catch {
              role = determineUserRole(supabaseUser.email)
              logger.log('🔄 例外フォールバック:', role)
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
        logger.log('📋 ⚡ キャッシュからスタッフ名取得:', staffName)
      } else if (role === 'customer') {
        // 顧客の場合、customersテーブルから名前を取得（バックグラウンド）
        logger.log('📋 顧客情報をバックグラウンドで取得開始')
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
                logger.log('📋 ✅ バックグラウンドで顧客名取得成功:', name)
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
                  logger.log('📋 🔗 メールアドレスで顧客発見、自動紐付け:', name)
                  // user_idを設定して紐付け
                  const { error: updateError } = await supabase
                    .from('customers')
                    .update({ user_id: supabaseUser.id })
                    .eq('id', customerByEmail.id)
                  
                  if (!updateError) {
                    logger.log('📋 ✅ 顧客自動紐付け成功:', name)
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
            logger.log('📋 顧客情報の取得エラー（バックグラウンド）:', error)
          }
        })()
      } else {
        // バックグラウンドで非同期取得（認証完了を待たない）
        if (role === 'staff' || role === 'admin') {
          logger.log('📋 スタッフ情報をバックグラウンドで取得開始')
          // 非同期で取得（await しない）
          const staffPromise = supabase
            .from('staff')
            .select('id, name, user_id')
            .eq('user_id', supabaseUser.id)
            .maybeSingle()
          
          Promise.resolve(staffPromise).then(async ({ data }) => {
              if (data?.name) {
                setStaffCache(prev => new Map(prev.set(supabaseUser.id, data.name)))
                logger.log('📋 ✅ バックグラウンドでスタッフ名取得成功:', data.name)
                // ユーザー情報も更新してヘッダーに反映
                setUser(prev => prev ? { ...prev, staffName: data.name } : prev)
              } else {
                // user_idで見つからない場合、メールアドレスで検索して自動紐付け
                logger.log('📋 user_idで見つからないため、メールアドレスで検索:', maskEmail(supabaseUser.email))
                const { data: staffByEmail } = await supabase
                  .from('staff')
                  .select('id, name, user_id')
                  .eq('email', supabaseUser.email)
                  .is('user_id', null)
                  .maybeSingle()
                
                if (staffByEmail) {
                  logger.log('📋 🔗 メールアドレスでスタッフ発見、自動紐付け:', staffByEmail.name)
                  // user_idを設定して紐付け
                  const { error: updateError } = await supabase
                    .from('staff')
                    .update({ user_id: supabaseUser.id })
                    .eq('id', staffByEmail.id)
                  
                  if (!updateError) {
                    setStaffCache(prev => new Map(prev.set(supabaseUser.id, staffByEmail.name)))
                    logger.log('📋 ✅ スタッフ自動紐付け成功:', staffByEmail.name)
                    setUser(prev => prev ? { ...prev, staffName: staffByEmail.name } : prev)
                    
                    // usersテーブルのroleをstaffに更新（adminの場合は降格させない）
                    // 🚨 重要: usersテーブルの既存ロールを必ず確認する
                    const { data: existingUserData } = await supabase
                      .from('users')
                      .select('role')
                      .eq('id', supabaseUser.id)
                      .maybeSingle()
                    
                    if (existingUserData?.role === 'admin') {
                      logger.log('📋 ⏭️ 既存ロールがadminのため、降格をスキップ')
                    } else if (role !== 'admin') {
                      await supabase
                        .from('users')
                        .update({ role: 'staff' })
                        .eq('id', supabaseUser.id)
                      logger.log('📋 ✅ ユーザーロールをstaffに更新')
                    }
                  } else {
                    logger.warn('📋 ⚠️ スタッフ紐付けエラー:', updateError)
                  }
                }
              }
          }).catch((error) => {
              logger.log('📋 スタッフ情報の取得エラー（バックグラウンド）:', error)
            })
        }
      }

      // ロール変更を検出してログに記録
      if (existingUser && existingUser.role !== role) {
        logger.log('🔄 ロール変更検出:', { 
          old: existingUser.role, 
          new: role 
        })
        await logAuthEvent('role_change', supabaseUser.id, {
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
      
      logger.log('✅ ユーザー情報設定完了:', { 
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
        logger.log('🔄 エラー発生、既存のユーザー情報を保持:', existingUser.role)
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
        
        logger.log('🔄 フォールバックユーザー情報設定:', fallbackUserData)
        setUser(fallbackUserData)
        userRef.current = fallbackUserData
      }
    } finally {
      const endTime = performance.now()
      isProcessingRef.current = false
      logger.log(`⏱️ setUserFromSession 完了: ${maskEmail(supabaseUser.email)} (${((endTime - startTime) / 1000).toFixed(2)}秒)`)
    }
  }

  async function signIn(email: string, password: string) {
    setLoading(true)
    try {
      // ログイン前に古いセッションをクリア（セッション切れ後のログイン問題対策）
      // これにより、期限切れセッションが干渉することを防ぐ
      const { data: currentSession } = await supabase.auth.getSession()
      if (currentSession.session) {
        logger.log('🔄 既存セッションを検出、クリアします')
        await supabase.auth.signOut({ scope: 'local' })
      }
      
      // 少し待機してからログイン（セッションクリアの完了を確実にする）
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (error) {
        logger.error('❌ ログインエラー:', error.message)
        // ログイン失敗をログに記録（エラー時は user は null）
        await logAuthEvent('login', null, {
          success: false,
          errorMessage: error.message,
        })
        throw error
      }
      
      logger.log('✅ ログイン成功:', data.user?.email ? maskEmail(data.user.email) : 'N/A')
      
      // ログイン成功をログに記録
      if (data.user) {
        const userData = userRef.current
        await logAuthEvent('login', data.user.id, {
          newRole: userData?.role,
          success: true,
        })
      }
      
      // 他のタブにログインを通知
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({ type: 'SIGNED_IN' })
        logger.log('📡 他タブにログインを通知')
      }
    } catch (error) {
      throw error
    } finally {
      setLoading(false)
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
        await logAuthEvent('logout', currentUserId, {
          success: false,
          errorMessage: error.message,
        })
        throw error
      }
      
      // ログアウト成功をログに記録
      await logAuthEvent('logout', currentUserId, {
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
        logger.log('📡 他タブにログアウトを通知')
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