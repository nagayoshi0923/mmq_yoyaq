import { supabase } from './supabase'

export interface User {
  id: string
  email: string
  role: 'admin' | 'staff' | 'customer'
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
export async function updateUserRole(userId: string, role: 'admin' | 'staff' | 'customer'): Promise<void> {
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
export async function upsertUser(authUserId: string, email: string, role: 'admin' | 'staff' | 'customer' = 'customer'): Promise<User> {
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

