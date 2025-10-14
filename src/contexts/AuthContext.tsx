import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, type AuthUser } from '@/lib/supabase'
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
    console.log('🚀 初期セッション取得開始')
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('❌ セッション取得エラー:', error)
        return
      }
      
      if (session?.user) {
        console.log('👤 セッションユーザー発見:', session.user.email)
        await setUserFromSession(session.user)
      } else {
        console.log('👤 セッションユーザーなし')
      }
    } catch (error) {
      console.error('❌ 初期セッション取得エラー:', error)
    } finally {
      console.log('✅ 初期セッション処理完了')
      setLoading(false)
    }
  }

  async function setUserFromSession(supabaseUser: User) {
    console.log('🔐 ユーザーセッション設定開始:', supabaseUser.email)
    try {
      // メールアドレスに基づいてロールを決定（開発用）
      let role: 'admin' | 'staff' | 'customer' = 'customer'
      
      // 開発者・管理者のメールアドレスリスト
      const adminEmails = [
        'mai.nagayoshi@gmail.com',
        'admin@example.com',
        'admin.test@example.com'
      ]
      
      const staffEmails = [
        'staff@example.com',
        'staff.test@example.com'
      ]
      
      if (adminEmails.includes(supabaseUser.email!) || supabaseUser.email?.includes('admin')) {
        role = 'admin'
      } else if (staffEmails.includes(supabaseUser.email!) || supabaseUser.email?.includes('staff')) {
        role = 'staff'
      }

      // ユーザー名を生成（メールアドレスから@より前の部分を使用、またはメタデータから取得）
      const displayName = supabaseUser.user_metadata?.full_name || 
                         supabaseUser.user_metadata?.name ||
                         supabaseUser.email?.split('@')[0] ||
                         'ユーザー'

      // スタッフの場合、スタッフテーブルから名前を取得（エラーが発生しても認証処理は継続）
      let staffName: string | undefined
      
      // 開発環境でスタッフ情報取得をスキップするフラグ
      const skipStaffLookup = import.meta.env.DEV && import.meta.env.VITE_SKIP_STAFF_LOOKUP === 'true'
      
      if ((role === 'staff' || role === 'admin') && !skipStaffLookup) {
        console.log('📋 スタッフ情報取得開始:', supabaseUser.id)
        try {
          // タイムアウト付きでスタッフ情報を取得（3秒でタイムアウト）
          const staffPromise = supabase
            .from('staff')
            .select('name')
            .eq('user_id', supabaseUser.id)
            .single()
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('スタッフ情報取得タイムアウト')), 3000)
          )
          
          const { data: staffData, error: staffError } = await Promise.race([
            staffPromise,
            timeoutPromise
          ]) as any
          
          if (staffError) {
            console.log('📋 スタッフ情報の取得エラー:', staffError.message)
          } else {
            staffName = staffData?.name
            console.log('📋 スタッフ名取得成功:', staffName)
          }
        } catch (error) {
          console.log('📋 スタッフ情報の取得に失敗:', error)
          // エラーが発生してもstaffNameはundefinedのまま継続
        }
      } else if (skipStaffLookup) {
        console.log('📋 スタッフ情報取得をスキップ（開発モード）')
      }

      const userData = {
        id: supabaseUser.id,
        email: supabaseUser.email!,
        name: displayName,
        staffName: staffName,
        role: role
      }
      
      console.log('✅ ユーザー情報設定完了:', { 
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
      console.error('❌ ユーザーセッション設定エラー:', error)
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
      
      console.log('🔄 フォールバックユーザー情報設定:', fallbackUserData)
      setUser(fallbackUserData)
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
    } catch (error) {
      setLoading(false)
      throw error
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
