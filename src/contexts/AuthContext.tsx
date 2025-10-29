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

  useEffect(() => {
    // 初期認証状態の確認
    getInitialSession()

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          await setUserFromSession(session.user)
        } else {
          setUser(null)
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
    try {
      // データベースからユーザーのロールを取得
      let role: 'admin' | 'staff' | 'customer' = 'customer'
      
      logger.log('📊 usersテーブルからロール取得開始')
      try {
        // タイムアウトを1.5秒に短縮（早期フォールバック）
        const rolePromise = supabase
          .from('users')
          .select('role')
          .eq('id', supabaseUser.id)
          .maybeSingle()

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ロール取得タイムアウト')), 1500)
        )

        const { data: userData, error: roleError } = await Promise.race([
          rolePromise,
          timeoutPromise
        ]) as any

        if (roleError) {
          logger.warn('⚠️ usersテーブルからのロール取得エラー:', roleError)
          // フォールバック: メールアドレスで判定（開発用）
          const adminEmails = ['mai.nagayoshi@gmail.com', 'queens.waltz@gmail.com']
          if (adminEmails.includes(supabaseUser.email!) || supabaseUser.email?.includes('admin')) {
            role = 'admin'
          } else if (supabaseUser.email?.includes('staff')) {
            role = 'staff'
          }
          logger.log('🔄 フォールバック: メールアドレスからロール判定 ->', role)
        } else if (userData?.role) {
          role = userData.role as 'admin' | 'staff' | 'customer'
          logger.log('✅ データベースからロール取得:', role)
        }
      } catch (error: any) {
        logger.warn('⚠️ ロール取得失敗（タイムアウト/エラー）:', error?.message || error)
        // フォールバック: メールアドレスで判定
        const adminEmails = ['mai.nagayoshi@gmail.com', 'queens.waltz@gmail.com']
        if (adminEmails.includes(supabaseUser.email!) || supabaseUser.email?.includes('admin')) {
          role = 'admin'
        } else if (supabaseUser.email?.includes('staff')) {
          role = 'staff'
        }
        logger.log('🔄 例外フォールバック: メールアドレスからロール判定 ->', role)
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

      // TODO: 将来的には実際のSupabaseテーブルからロール情報を取得
      // const { data: profile } = await supabase
      //   .from('users')
      //   .select('role')
      //   .eq('id', supabaseUser.id)
      //   .single()
    } catch (error) {
      logger.error('❌ ユーザーセッション設定エラー:', error)
      // エラーの場合はデフォルトのcustomerロールを設定
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
      
      // ログイン画面にリダイレクト
      window.location.href = '/#login'
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
