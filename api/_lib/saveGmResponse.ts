import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError, requireStaff, type AuthUser } from './auth.js'
export async function saveGmResponse(database: SupabaseClient, user: AuthUser, body: any) {
  requireStaff(user)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(body.staffId || '') || !uuid.test(body.reservationId || '') || !Array.isArray(body.candidates) || !Array.isArray(body.availableCandidates)) throw new ApiError(400, '回答する候補を確認してください')
  const { data: staff, error: staffError } = await database.from('staff').select('id,user_id')
    .eq('id',body.staffId).eq('organization_id',user.orgId).eq('status','active').maybeSingle()
  if (staffError) throw new ApiError(500,'スタッフ情報を確認できませんでした')
  if (!staff || (staff.user_id !== user.userId && !['admin','license_admin'].includes(user.role))) throw new ApiError(403,'このGMの回答を変更する権限がありません')
  const {data,error}=await database.rpc('save_gm_response_atomic',{
    p_org:user.orgId,p_reservation:body.reservationId,p_staff:staff.id,
    p_candidates:body.candidates,p_expected_response:body.expectedResponse,
    p_patch:{available_candidates:body.availableCandidates,response_status:body.responseStatus,notes:body.notes ?? null},
  })
  if(error?.code==='40001'||error?.code==='55P03') throw new ApiError(409,'候補日時またはGM回答が変更されました。画面を更新して、選び直してください。')
  if(error?.code==='42501') throw new ApiError(403,'予約またはスタッフ情報を確認できません')
  if(error?.code==='22023') throw new ApiError(400,'候補日時を確認して、選び直してください。')
  if(error) throw new ApiError(500,'回答を保存できませんでした。再度お試しください。')
  return {response:data}
}
