import { supabase } from '@/lib/supabase'
import { pendingOperation } from '@/lib/pendingOperation'
export interface SurveyDeliveryHistory {
  reservation_id: string | null
  has_unresolved: boolean
  deliveries: Array<{id: string;status: string;source: string;created_at: string;last_error: string | null}>
}
export const surveyDeliveryLabels: Record<string,string> = {
  pending:'メール送信待ち',sending:'メール送信処理中',sent:'メール送信受付済み',
  failed:'メール未送信・要確認',uncertain:'送信結果不明・要確認',superseded:'公演変更により送信停止',
}
export async function readSurveyDeliveries(groupId:string):Promise<SurveyDeliveryHistory> {
 const {data,error}=await supabase.rpc('get_private_group_survey_deliveries',{p_group_id:groupId})
 if(error) throw error
 if(!data || !Array.isArray(data.deliveries) || typeof data.has_unresolved!=='boolean') throw new Error('通知履歴を確認できませんでした')
 return data
}
export async function sendSurveyNotice(groupId:string,reservationId:string,actorId:string) {
 const args={p_group_id:groupId,p_expected_reservation_id:reservationId}
 const operation=await pendingOperation(`survey-notice:${actorId}`,args)
 const {data,error}=await supabase.rpc('send_private_group_survey_notice',{...args,p_request_id:operation.id})
 if(error) throw error
 if(data?.success!==true || !data.delivery_id) throw new Error('案内の保存結果を確認できませんでした。同じ内容で再試行してください。')
 operation.complete()
 return data as {success:true;delivery_id:string;status:string;replayed:boolean}
}
