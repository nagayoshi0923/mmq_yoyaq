import { createClient } from '@supabase/supabase-js'

// 環境変数のバリデーション
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '⚠️ Supabase環境変数が設定されていません。\n' +
    'VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を .env.local ファイルに設定してください。\n' +
    '詳細は env.example を参照してください。'
  )
}

// 環境変数をエクスポート（他のモジュールでAPI呼び出しに使用）
export const SUPABASE_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // セッションをlocalStorageに保存（デフォルトはtrue）
    persistSession: true,
    // トークンの自動リフレッシュを有効化
    autoRefreshToken: true,
    // 非同期でセッションを検出（パフォーマンス向上）
    detectSessionInUrl: true,
    // ストレージキーを明示的に設定
    storageKey: 'mmq-supabase-auth',
    // タブ間でのセッション同期を有効化
    flowType: 'pkce',
  },
})

// 認証状態の型定義
export type AuthUser = {
  id: string
  email: string
  name?: string
  staffName?: string
  customerName?: string  // 顧客テーブルから取得した名前（顧客ロール用）
  role: 'admin' | 'staff' | 'customer' | 'license_admin'
  created_at?: string  // ユーザー登録日
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
