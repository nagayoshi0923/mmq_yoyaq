import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAnonKey, verifyAuth, isCronOrServiceRoleCall } from './security.ts'
import { LegacyApprovalError } from './private-approval-legacy.ts'
export async function authorizePrivateApprovalNotification(req:Request,db:any,organizationId:string) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId||'')) throw new LegacyApprovalError('組織を指定してください',400)
 if(isCronOrServiceRoleCall(req)) return {service:true}
 const auth=await verifyAuth(req)
 if(!auth.success) throw new LegacyApprovalError('認証が必要です',401)
 const userDb=createClient(Deno.env.get('SUPABASE_URL')||'',getAnonKey(),{
  global:{headers:{Authorization:req.headers.get('Authorization')!}},auth:{persistSession:false,autoRefreshToken:false},
 })
 const [org,admin,staff]=await Promise.all([
  userDb.rpc('get_user_organization_id'),userDb.rpc('is_org_admin'),
  db.from('staff').select('id').eq('user_id',auth.user!.id).eq('organization_id',organizationId).eq('status','active').maybeSingle(),
 ])
 if(org.error||admin.error||staff.error) throw new LegacyApprovalError('操作権限を確認できません',503)
 if(org.data!==organizationId||(!admin.data&&!staff.data)) throw new LegacyApprovalError('この組織の通知を送信する権限がありません',403)
 return {service:false}
}
