/**
 * ユーザーの役割の読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'

export const userRoleReadApi = {
  /** ユーザーの役割 */
  async findRoleById(userId: string) {
    return supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()
  },
}
