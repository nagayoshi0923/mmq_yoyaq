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
    // 既に処理中の場合はスキップ（重複呼び出し防止）
    if (isProcessing) {
      console.log('⏭️ 処理中のためスキップ:', supabaseUser.email)
      return
    }
    
    setIsProcessing(true)
    console.log('🔐 ユーザーセッション設定開始:', supabaseUser.email)
    try {
      // データベースからユーザーのロールを取得
      let role: 'admin' | 'staff' | 'customer' = 'customer'
      
      console.log('📊 usersテーブルからロール取得開始')
      try {
        // タイムアウト付きでロールを取得（5秒でフォールバック）
        const rolePromise = supabase
          .from('users')
          .select('role')
          .eq('id', supabaseUser.id)
          .maybeSingle()

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ロール取得タイムアウト')), 5000)
        )

        const { data: userData, error: roleError } = await Promise.race([
          rolePromise,
          timeoutPromise
        ]) as any

        if (roleError) {
          console.warn('⚠️ usersテーブルからのロール取得エラー:', roleError)
          // フォールバック: メールアドレスで判定（開発用）
          const adminEmails = ['mai.nagayoshi@gmail.com', 'queens.waltz@gmail.com']
          if (adminEmails.includes(supabaseUser.email!) || supabaseUser.email?.includes('admin')) {
            role = 'admin'
          } else if (supabaseUser.email?.includes('staff')) {
            role = 'staff'
          }
          console.log('🔄 フォールバック: メールアドレスからロール判定 ->', role)
        } else if (userData?.role) {
          role = userData.role as 'admin' | 'staff' | 'customer'
          console.log('✅ データベースからロール取得:', role)
        }
      } catch (error: any) {
        console.warn('⚠️ ロール取得失敗（タイムアウト/エラー）:', error?.message || error)
        // フォールバック: メールアドレスで判定
        const adminEmails = ['mai.nagayoshi@gmail.com', 'queens.waltz@gmail.com']
        if (adminEmails.includes(supabaseUser.email!) || supabaseUser.email?.includes('admin')) {
          role = 'admin'
        } else if (supabaseUser.email?.includes('staff')) {
          role = 'staff'
        }
        console.log('🔄 例外フォールバック: メールアドレスからロール判定 ->', role)
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
        // キャッシュから確認
        const cachedName = staffCache.get(supabaseUser.id)
        if (cachedName) {
          staffName = cachedName
          console.log('📋 ⚡ キャッシュからスタッフ名取得:', staffName)
        } else {
          console.log('📋 スタッフ情報取得開始 - ユーザーID:', supabaseUser.id)
          try {
            // タイムアウト付きでスタッフ情報を取得（3秒でタイムアウト）
            const staffPromise = supabase
              .from('staff')
              .select('name, email, user_id, discord_id, discord_channel_id')
              .eq('user_id', supabaseUser.id)
              .maybeSingle() // single()の代わりにmaybeSingle()を使用
            
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('スタッフ情報取得タイムアウト（3000ms）')), 3000)
            )
            
            const { data: staffData, error: staffError } = await Promise.race([
              staffPromise,
              timeoutPromise
            ]) as any
            
            if (staffError) {
              console.log('📋 スタッフ情報の取得エラー:', {
                code: staffError.code,
                message: staffError.message,
                details: staffError.details,
                hint: staffError.hint
              })
              
              // テーブルが存在しない場合の詳細ログ
              if (staffError.code === 'PGRST116' || staffError.message.includes('relation') || staffError.message.includes('does not exist')) {
                console.log('📋 ❌ staffテーブルが存在しません')
                console.log('📋 💡 解決方法: Supabaseダッシュボードで database/setup_staff_with_user_id.sql を実行してください')
              } else if (staffError.code === 'PGRST118') {
                console.log('📋 ❌ 該当するスタッフデータが見つかりません')
                console.log('📋 💡 解決方法: スタッフデータを作成するか、user_idを設定してください')
              }
            } else {
              staffName = staffData?.name
              // キャッシュに保存
              if (staffName) {
                setStaffCache(prev => new Map(prev.set(supabaseUser.id, staffName)))
              }
              console.log('📋 ✅ スタッフ名取得成功:', {
                name: staffName,
                email: staffData?.email,
                user_id: staffData?.user_id
              })
            }
          } catch (error) {
            console.log('📋 ❌ スタッフ情報の取得に失敗:', error)
            // エラーが発生してもstaffNameはundefinedのまま継続
          }
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
