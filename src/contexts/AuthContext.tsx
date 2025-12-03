import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, type AuthUser } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { User } from '@supabase/supabase-js'
import { determineUserRole } from '@/utils/authUtils'

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
    console.log('🚀 AuthContext 初期化開始:', new Date().toISOString())
    
    // パフォーマンス最適化: 認証処理を非ブロッキング化
    // 0.3秒後にloadingをfalseにして、ページを表示開始
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        console.log('⏱️ 認証処理タイムアウト（0.3秒）、ページ表示を開始')
        setLoading(false)
      }
    }, 300)
    
    // 初期認証状態の確認（バックグラウンドで実行）
    getInitialSession().then(() => {
      clearTimeout(loadingTimeout)
      const authEndTime = performance.now()
      console.log(`⏱️ AuthContext 初期認証完了: ${((authEndTime - authStartTime) / 1000).toFixed(2)}秒`)
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
        logger.log('🔄 認証状態変更:', event, session?.user?.email, `(経過時間: ${((eventStartTime - authStartTime) / 1000).toFixed(2)}秒)`)
        
        // 処理中の場合はスキップ（重複実行防止）
        if (isProcessingRef.current) {
          logger.log('⏭️ 認証処理中のためスキップ:', event)
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

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [refreshSession])

  async function getInitialSession() {
    const startTime = performance.now()
    logger.log('🚀 初期セッション取得開始')
    try {
      const sessionStartTime = performance.now()
      const { data: { session }, error } = await supabase.auth.getSession()
      const sessionEndTime = performance.now()
      console.log(`⏱️ getSession 完了: ${((sessionEndTime - sessionStartTime) / 1000).toFixed(2)}秒`)
      
      if (error) {
        logger.error('❌ セッション取得エラー:', error)
        return
      }
      
      if (session?.user) {
        logger.log('👤 セッションユーザー発見:', session.user.email)
        await setUserFromSession(session.user)
      } else {
        logger.log('👤 セッションユーザーなし')
      }
    } catch (error) {
      logger.error('❌ 初期セッション取得エラー:', error)
    } finally {
      const endTime = performance.now()
      logger.log('✅ 初期セッション処理完了')
      console.log(`⏱️ getInitialSession 総時間: ${((endTime - startTime) / 1000).toFixed(2)}秒`)
      setLoading(false)
    }
  }

  async function setUserFromSession(supabaseUser: User) {
    // 既に処理中の場合はスキップ（重複呼び出し防止）
    // ただし、userがまだセットされていない場合は処理を続行する（初期化時の競合対策）
    if (isProcessingRef.current && userRef.current) {
      logger.log('⏭️ 処理中のためスキップ:', supabaseUser.email)
      return
    }
    
    const startTime = performance.now()
    isProcessingRef.current = true
    logger.log('🔐 ユーザーセッション設定開始:', supabaseUser.email)
    console.log(`⏱️ setUserFromSession 開始: ${supabaseUser.email} (${new Date().toISOString()})`)
    
    // 既存のユーザー情報を保持（エラー時のフォールバック用）
    // useStateのクロージャー問題を回避するため、refから取得
    const existingUser = userRef.current
    
    try {
      // データベースからユーザーのロールを取得
      let role: 'admin' | 'staff' | 'customer' = 'customer'
      
      logger.log('📊 usersテーブルからロール取得開始')
      try {
        // パフォーマンス最適化: リトライなし、タイムアウト1秒で早期フォールバック
        // RLS有効化後はクエリが少し遅くなるため、タイムアウトを延長
        const timeoutMs = 1000
            
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
            ]) as any
            
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
          role = userData.role as 'admin' | 'staff' | 'customer'
          logger.log('✅ データベースからロール取得:', role)
          } else if (roleError) {
            throw roleError
          }
        }
      } catch (error: any) {
        logger.warn('⚠️ ロール取得失敗（タイムアウト/エラー）:', error?.message || error)
        
        // レコードが存在しない場合、作成する（トリガーに依存しない）
        if (error?.code === 'PGRST116' || error?.message?.includes('ロール取得タイムアウト')) {
          logger.log('📝 usersテーブルにレコードが存在しないため、作成します')
          
          // ロールを決定（メールアドレスから判定）
          let newRole = determineUserRole(supabaseUser.email)
          
          // usersテーブルにレコードを作成
          const { error: upsertError } = await supabase
            .from('users')
            .upsert({
              id: supabaseUser.id,
              email: supabaseUser.email!,
              role: newRole,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'id'
            })
          
          if (upsertError) {
            logger.warn('⚠️ usersテーブルへのレコード作成に失敗しました:', upsertError)
            role = newRole // フォールバックとして使用
          } else {
            role = newRole
            logger.log('✅ usersテーブルにレコードを作成しました:', role)
          }
        } else {
          // 既存のユーザー情報がある場合は、そのロールを保持（エラー時もロールを維持）
          if (existingUser && existingUser.id === supabaseUser.id && existingUser.role !== 'customer') {
            role = existingUser.role
            logger.log('🔄 例外発生、既存のロールを保持:', role)
          } else {
            // フォールバック: メールアドレスで判定
            role = determineUserRole(supabaseUser.email)
            logger.log('🔄 例外フォールバック: メールアドレスからロール判定 ->', role)
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
      
      // キャッシュから確認のみ（既に取得済みの場合のみ使用）
      const cachedName = staffCache.get(supabaseUser.id)
      if (cachedName) {
        staffName = cachedName
        logger.log('📋 ⚡ キャッシュからスタッフ名取得:', staffName)
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
                logger.log('📋 user_idで見つからないため、メールアドレスで検索:', supabaseUser.email)
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
                    
                    // usersテーブルのroleもstaffに更新（adminでなければ）
                    if (role !== 'admin') {
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

      // TODO: 将来的には実際のSupabaseテーブルからロール情報を取得
      // const { data: profile } = await supabase
      //   .from('users')
      //   .select('role')
      //   .eq('id', supabaseUser.id)
      //   .single()
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
      console.log(`⏱️ setUserFromSession 完了: ${supabaseUser.email} (${((endTime - startTime) / 1000).toFixed(2)}秒)`)
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
        throw error
      }
      
      logger.log('✅ ログイン成功:', data.user?.email)
    } catch (error) {
      setLoading(false)
      throw error
    }
  }

  async function signOut() {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      
      // ユーザー情報をクリア
      setUser(null)
      
      // 予約サイトにリダイレクト（ログインなしでも閲覧可能）
      window.location.href = '/#customer-booking'
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
