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
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await setUserFromSession(session.user)
      }
    } catch (error) {
      console.error('Error getting initial session:', error)
    } finally {
      setLoading(false)
    }
  }

  async function setUserFromSession(supabaseUser: User) {
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

      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email!,
        role: role
      })

      // TODO: 将来的には実際のSupabaseテーブルからロール情報を取得
      // const { data: profile } = await supabase
      //   .from('users')
      //   .select('role')
      //   .eq('id', supabaseUser.id)
      //   .single()
    } catch (error) {
      console.error('Error setting user from session:', error)
      // エラーの場合はデフォルトのcustomerロールを設定
      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email!,
        role: 'customer'
      })
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
