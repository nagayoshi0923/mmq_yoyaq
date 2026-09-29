import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
export interface ApprovalDeliveryStatus {
 id: string
 kind: 'confirmation_email' | 'gm_email' | 'gm_discord'
 status: 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'superseded' | 'skipped'
 recipient_name: string
 last_error: string | null
}
export interface ApprovalDeliverySummary { reservation_id: string; deliveries: ApprovalDeliveryStatus[] }
export function useApprovalDeliveryStatus(organizationId: string | null, reservationIds: string[]) {
 const ids=[...new Set(reservationIds)].sort()
 return useQuery({
  queryKey:['private-approval-delivery-status',organizationId,ids],enabled:!!organizationId&&ids.length>0,
  queryFn:async():Promise<ApprovalDeliverySummary[]>=>{
   const rows:ApprovalDeliverySummary[]=[]
   for(let start=0;start<ids.length;start+=100){
    const {data,error}=await supabase.rpc('get_private_booking_approval_delivery_status',{p_reservation_ids:ids.slice(start,start+100)})
    if(error) throw error
    if(!Array.isArray(data)) throw new Error('通知状況の応答が不正です')
    rows.push(...data)
   }
   return rows
  },
  refetchInterval:q=>q.state.data?.some(row=>row.deliveries.some(d=>['pending','sending'].includes(d.status)))?15_000:false,
  staleTime:5_000,
 })
}
export function approvalDeliveryLabel(row:ApprovalDeliveryStatus):string {
 const channel=row.kind==='gm_discord'?'Discord':'メール'
 const target=row.kind==='confirmation_email'?'お客様':row.recipient_name
 const state={pending:'送信待ち（自動再試行あり）',sending:'送信処理中',sent:'送信受付済み',failed:'未送信・設定や宛先の確認が必要',
  uncertain:'結果不明・通知履歴を確認してください',superseded:'予約が変更されたため送信停止',skipped:'設定により送信対象外'}[row.status]
 return `${target}への${channel}：${state}`
}
