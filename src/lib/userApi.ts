import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

export interface User {
  id: string
  email: string
  role: 'admin' | 'staff' | 'customer' | 'license_admin'
  created_at: string
  updated_at: string
}

/**
 * メールアドレスでユーザーを検索
 */
export async function searchUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // ユーザーが見つからない
      return null
    }
    throw error
  }

  return data as User
}

/**
 * 全ユーザーを取得（管理者のみ）
 */
export async function getAllUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data as User[]
}

/**
 * ユーザーのロールを更新
 */
export async function updateUserRole(userId: string, role: 'admin' | 'staff' | 'customer' | 'license_admin'): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) {
    throw error
  }
}

/**
 * auth.usersテーブルから全ユーザーを取得（Supabase Admin API使用）
 * 注: この機能はSupabase Admin APIが必要です
 */
export async function getAllAuthUsers() {
  // これはクライアント側では実装できません
  // サーバーサイド関数（Supabase Edge Function）が必要です
  throw new Error('この機能は未実装です。Supabase Edge Functionが必要です。')
}

/**
 * usersテーブルにユーザーを作成または更新（upsert）
 */
export async function upsertUser(authUserId: string, email: string, role: 'admin' | 'staff' | 'customer' | 'license_admin' = 'customer'): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .upsert({ 
      id: authUserId, 
      email, 
      role,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'id'
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as User
}

/**
 * 現在のユーザー自身のアカウントを削除
 * Edge Functionを使用して auth.users から削除します
 * 外部キー制約により、public.users も自動的に削除されます（CASCADE）
 */
export async function deleteMyAccount(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    throw new Error('認証が必要です')
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ userId: session.user.id })
  })

  const result = await response.json()

  if (!response.ok || !result.success) {
    const error = new Error(result.error || 'アカウントの削除に失敗しました')
    // @ts-ignore
    error.code = result.code || response.status
    throw error
  }
}

