/**
 * ログイン中の利用者の解決（src/contexts/auth）で使う読み書き（整備 4）。
 * 認証の処理から supabase を直接呼ばず、ここを通す。絞り込み・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 * 自組織・本人以外の行は RLS（閲覧・更新の決まり）が止める（他人の役割の変更・紐付け済みの行の付け替えは不可）。
 */
import { supabase } from '@/lib/supabase'

export interface AuthLogRow {
  user_id: string | null
  event_type: string
  old_role?: string
  new_role?: string
  ip_address: string | null
  user_agent: string | null
  success: boolean
  error_message?: string
  metadata: Record<string, unknown>
}

export const authSessionApi = {
  /** 利用者の役割と店舗代表の印 */
  getUserRole(userId: string) {
    return supabase
      .from('users')
      .select('role, is_store_representative')
      .eq('id', userId)
      .maybeSingle()
  },

  /** 利用者の役割（1行必須） */
  getUserRoleSingle(userId: string) {
    return supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()
  },

  /** 利用者の役割（無ければ null） */
  findUserRole(userId: string) {
    return supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
  },

  /** 利用者の行を新規作成する（既存は上書きしない） */
  insertUser(row: { id: string; email: string; role: string; created_at: string; updated_at: string }) {
    return supabase
      .from('users')
      .insert(row)
  },

  /** 利用者の役割をスタッフにする（自分の役割は RLS で変えられないため、管理者・サーバー以外では効かない） */
  setUserRoleStaff(userId: string) {
    return supabase
      .from('users')
      .update({ role: 'staff' })
      .eq('id', userId)
  },

  /** ログインユーザーに紐付いたスタッフ id */
  findStaffIdByUserId(userId: string) {
    return supabase
      .from('staff')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
  },

  /** メールアドレスが一致するスタッフ id */
  findStaffIdByEmail(email: string) {
    return supabase
      .from('staff')
      .select('id')
      .eq('email', email)
      .maybeSingle()
  },

  /** メールアドレスが一致するスタッフ（紐付け状況つき） */
  findStaffByEmailForLink(email: string | undefined) {
    return supabase
      .from('staff')
      .select('id, user_id, name')
      .eq('email', email)
      .maybeSingle()
  },

  /** ログインユーザーに紐付いたスタッフの名前 */
  findStaffNameByUserId(userId: string) {
    return supabase
      .from('staff')
      .select('id, name, user_id')
      .eq('user_id', userId)
      .maybeSingle()
  },

  /** メールアドレスが一致し、まだ誰にも紐付いていないスタッフ */
  findUnlinkedStaffByEmail(email: string | undefined) {
    return supabase
      .from('staff')
      .select('id, name, user_id')
      .eq('email', email)
      .is('user_id', null)
      .maybeSingle()
  },

  /** スタッフをログインユーザーに紐付ける（更新日時も入れる） */
  linkStaffToUserWithTimestamp(staffId: string, userId: string, updatedAt: string) {
    return supabase
      .from('staff')
      .update({ user_id: userId, updated_at: updatedAt })
      .eq('id', staffId)
  },

  /** スタッフをログインユーザーに紐付ける */
  linkStaffToUser(staffId: string, userId: string) {
    return supabase
      .from('staff')
      .update({ user_id: userId })
      .eq('id', staffId)
  },

  /** ログインユーザーの顧客名（新しい順の1件） */
  findCustomerNameByUserId(userId: string) {
    return supabase
      .from('customers')
      .select('name, nickname')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
  },

  /** メールアドレスが一致し、まだ誰にも紐付いていない顧客 */
  findUnlinkedCustomerByEmail(email: string | undefined) {
    return supabase
      .from('customers')
      .select('id, name, nickname, user_id')
      .eq('email', email)
      .is('user_id', null)
      .maybeSingle()
  },

  /** 顧客をログインユーザーに紐付ける */
  linkCustomerToUser(customerId: string, userId: string) {
    return supabase
      .from('customers')
      .update({ user_id: userId })
      .eq('id', customerId)
  },

  /** ログインユーザーの顧客の行があるか（最初の1件） */
  listCustomerIdsByUserId(userId: string) {
    return supabase
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
  },

  /** 認証の記録を残す */
  insertAuthLog(row: AuthLogRow) {
    return supabase.from('auth_logs').insert(row)
  },
}
