import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, type AuthUser } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
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
  const [staffCache, setStaffCache] = useState<Map<string, string>>(new Map())
  const [isProcessing, setIsProcessing] = useState(false)
  // 最新のユーザー情報を保持するためのref（クロージャー問題を回避）
  const userRef = React.useRef<AuthUser | null>(null)
  
  // userが変更されたらrefも更新
  React.useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    // 初期認証状態の確認
    getInitialSession()

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.log('🔄 認証状態変更:', event, session?.user?.email)
        // TOKEN_REFRESHEDイベントの場合は、既存のユーザー情報を保持（ロールを維持）
        if (event === 'TOKEN_REFRESHED' && session?.user && userRef.current) {
          // トークンリフレッシュ時は、既存のユーザー情報があればロールを維持
          logger.log('🔄 トークンリフレッシュ検出、既存ロールを維持:', userRef.current.role)
          setLoading(false)
          return
        }
        
        if (session?.user) {
          await setUserFromSession(session.user)
        } else {
          setUser(null)
          userRef.current = null
        }
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function getInitialSession() {
    logger.log('🚀 初期セッション取得開始')
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
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
      logger.log('✅ 初期セッション処理完了')
      setLoading(false)
    }
  }

  async function setUserFromSession(supabaseUser: User) {
    // 既に処理中の場合はスキップ（重複呼び出し防止）
    if (isProcessing) {
      logger.log('⏭️ 処理中のためスキップ:', supabaseUser.email)
      return
    }
    
    setIsProcessing(true)
    logger.log('🔐 ユーザーセッション設定開始:', supabaseUser.email)
    
    // 既存のユーザー情報を保持（エラー時のフォールバック用）
    // useStateのクロージャー問題を回避するため、refから取得
    const existingUser = userRef.current
    
    try {
      // データベースからユーザーのロールを取得
      let role: 'admin' | 'staff' | 'customer' = 'customer'
      
      logger.log('📊 usersテーブルからロール取得開始')
      try {
        // タイムアウトを10秒に延長し、リトライロジックを追加
        let userData: any = null
        let roleError: any = null
        const maxRetries = 2
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const rolePromise = supabase
              .from('users')
              .select('role')
              .eq('id', supabaseUser.id)
              .maybeSingle()

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('ロール取得タイムアウト')), 10000)
            )

            const result = await Promise.race([
              rolePromise,
              timeoutPromise
            ]) as any
            
            // Supabaseのレスポンス形式を確認
            if (result && (result.data !== undefined || result.error !== undefined)) {
              userData = result.data
              roleError = result.error
              break // 成功したらループを抜ける
            }
          } catch (error: any) {
            if (attempt === maxRetries) {
              roleError = error
              logger.warn(`⚠️ ロール取得リトライ${attempt + 1}回目で失敗:`, error?.message)
            } else {
              logger.log(`🔄 ロール取得リトライ${attempt + 1}回目...`)
              // リトライ前に少し待機
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          }
        }

        if (roleError) {
          logger.warn('⚠️ usersテーブルからのロール取得エラー:', roleError)
          // 既存のユーザー情報がある場合は、そのロールを保持（エラー時もロールを維持）
          if (existingUser && existingUser.id === supabaseUser.id && existingUser.role !== 'customer') {
            role = existingUser.role
            logger.log('🔄 既存のロールを保持:', role)
          } else {
            // フォールバック: メールアドレスで判定（開発用）
            const adminEmails = ['mai.nagayoshi@gmail.com', 'queens.waltz@gmail.com']
            if (adminEmails.includes(supabaseUser.email!) || supabaseUser.email?.includes('admin')) {
              role = 'admin'
            } else if (supabaseUser.email?.includes('staff')) {
              role = 'staff'
            }
            logger.log('🔄 フォールバック: メールアドレスからロール判定 ->', role)
          }
        } else if (userData?.role) {
          role = userData.role as 'admin' | 'staff' | 'customer'
          logger.log('✅ データベースからロール取得:', role)
        } else {
          // userDataがnullの場合（usersテーブルにレコードがない）
          // 既存のユーザー情報がある場合は、そのロールを保持
          if (existingUser && existingUser.id === supabaseUser.id && existingUser.role !== 'customer') {
            role = existingUser.role
            logger.log('🔄 レコードなし、既存のロールを保持:', role)
          }
        }
      } catch (error: any) {
        logger.warn('⚠️ ロール取得失敗（タイムアウト/エラー）:', error?.message || error)
        // 既存のユーザー情報がある場合は、そのロールを保持（エラー時もロールを維持）
        if (existingUser && existingUser.id === supabaseUser.id && existingUser.role !== 'customer') {
          role = existingUser.role
          logger.log('🔄 例外発生、既存のロールを保持:', role)
        } else {
          // フォールバック: メールアドレスで判定
          const adminEmails = ['mai.nagayoshi@gmail.com', 'queens.waltz@gmail.com']
          if (adminEmails.includes(supabaseUser.email!) || supabaseUser.email?.includes('admin')) {
            role = 'admin'
          } else if (supabaseUser.email?.includes('staff')) {
            role = 'staff'
          }
          logger.log('🔄 例外フォールバック: メールアドレスからロール判定 ->', role)
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
          supabase
            .from('staff')
            .select('name')
            .eq('user_id', supabaseUser.id)
            .maybeSingle()
            .then(({ data }) => {
              if (data?.name) {
                setStaffCache(prev => new Map(prev.set(supabaseUser.id, data.name)))
                logger.log('📋 ✅ バックグラウンドでスタッフ名取得成功:', data.name)
              }
            })
            .catch((error) => {
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
      setIsProcessing(false)
    }
  }

  async function signIn(email: string, password: string) {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
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
    signIn,
    signOut,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
