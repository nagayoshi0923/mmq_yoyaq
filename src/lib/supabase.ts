import { createClient } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cznpcewciwywcqcxktba.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6bnBjZXdjaXd5d2NxY3hrdGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzMyMjAsImV4cCI6MjA3NDIwOTIyMH0.GBR1kO877s6iy1WmVXL4xY8wpsyAdmgsXKEQbm0MNLo'

// 開発環境では警告のみ表示
if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  logger.warn('⚠️ Supabase環境変数が設定されていません。デモモードで動作します。')
  logger.warn('実際のSupabaseを使用する場合は、.env.localファイルを作成してください。')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 認証状態の型定義
export type AuthUser = {
  id: string
  email: string
  name?: string
  staffName?: string
  role: 'admin' | 'staff' | 'customer'
}

// ログイン関数
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  
  if (error) throw error
  return data
}

// ログアウト関数
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// 現在のユーザー情報を取得
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null
  
  // ユーザーのロール情報を取得（実際のテーブル構造に応じて調整）
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  
  return {
    id: user.id,
    email: user.email!,
    role: profile?.role || 'customer'
  }
}
