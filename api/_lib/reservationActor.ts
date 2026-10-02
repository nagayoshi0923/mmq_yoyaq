import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError, type AuthUser } from './auth.js'

/** JWTの本人、または対象組織の既存業務権限を確認する。DBの再確認が最終境界。 */
export async function assertReservationActor(
  db: SupabaseClient,
  user: AuthUser,
  organizationId: string,
  customer: { user_id: string | null } | null,
): Promise<void> {
  if (customer?.user_id && customer.user_id === user.userId) return
  if (user.orgId !== organizationId || !organizationId) {
    throw new ApiError(403, 'この予約を操作する権限がありません')
  }
  // requireAuthで停止・退職を除外した管理者。招待中の既存管理者を維持する。
  if (user.role === 'admin') return
  if (user.role === 'staff' || user.role === 'license_admin') {
    const { data, error } = await db.from('staff').select('id')
      .eq('user_id', user.userId).eq('organization_id', organizationId).eq('status', 'active').limit(1)
    if (error) throw new ApiError(503, 'スタッフの利用状態を確認できませんでした')
    if (data?.length) return
  }
  throw new ApiError(403, 'この予約を操作する権限がありません')
}
