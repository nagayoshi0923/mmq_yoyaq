import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { privateBookingMgmtRpcApi } from '@/lib/api/privateBookingMgmtReadApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { showToast } from '@/utils/toast'
interface DeliveryRow {
 id:string;delivery_kind:'approval'|'survey'|'rejection';channel:string;recipient_name:string|null
 status:string;created_at:string;last_error:string|null;can_retry:boolean;can_reconcile:boolean;can_resume_preparation:boolean
}
const labels:Record<string,string>={confirmation_email:'お客様への確定メール',gm_email:'GM確定メール',gm_discord:'GM確定Discord',survey_email:'アンケート案内メール',rejection_email:'却下メール'}
const statuses:Record<string,string>={pending:'送信待ち',sending:'送信処理中',sent:'送信受付済み',failed:'未送信',uncertain:'送信結果不明',superseded:'予約変更により停止',skipped:'設定により送信対象外'}
export function DeliveryHistoryDialog({reservationId}:{reservationId:string}) {
 const [open,setOpen]=useState(false),[selected,setSelected]=useState<string|null>(null),[providerId,setProviderId]=useState(''),[busy,setBusy]=useState(false)
 const [operationError,setOperationError]=useState<string|null>(null)
 const queryClient=useQueryClient()
 const query=useQuery({queryKey:['private-delivery-history',reservationId],enabled:open,
  queryFn:async()=>{
   const {data,error}=await privateBookingMgmtRpcApi.getDeliveryHistory(reservationId)
   if(error) throw error
   if(!data||!Array.isArray(data.deliveries)) throw new Error('通知履歴を取得できません')
   return data as {organization_id:string;deliveries:DeliveryRow[]}
  },staleTime:0,
  refetchInterval:q=>open&&q.state.data?.deliveries.some(d=>['pending','sending'].includes(d.status))?15_000:false,
 })
 async function run(row:DeliveryRow,action:'retry'|'reconcile'|'resume') {
  if(busy) return
  setBusy(true);setOperationError(null)
  try {
   if(action==='resume') {
    const {data,error}=await privateBookingMgmtRpcApi.resumeApprovalPreparation(row.id)
    if(error||data!==true) throw new Error('作成済みの案内先を確認できません。準備は再開していません。管理者がDiscordの作成状況を確認してください。')
    showToast.success('作成済みの案内先を確認し、メール準備を再開しました')
   } else if(action==='retry') {
    const {data,error}=await privateBookingMgmtRpcApi.retryUnsentDelivery(row.delivery_kind, row.id)
    if(error||data!==true) throw new Error('再試行できる状態ではないか、保存できませんでした。再読み込みしてください。')
    showToast.success('未送信の通知を再試行に登録しました')
   } else {
    const {data,error}=await supabase.functions.invoke('reconcile-private-delivery',{body:{kind:row.delivery_kind,deliveryId:row.id,organizationId:query.data?.organization_id,providerId:providerId.trim()}})
    if(error||data?.success!==true) {
     const body=await error?.context?.json?.().catch(()=>null)
     throw new Error(body?.error||data?.error||'送信記録との一致を確認できません。状態は確定していません。')
    }
    showToast.success('外部の受付記録と照合し、通知履歴を更新しました')
   }
   setSelected(null);setProviderId('')
   await queryClient.invalidateQueries({predicate:q=>typeof q.queryKey[0]==='string'&&q.queryKey[0].startsWith('private-')})
  } catch(error) {setOperationError(error instanceof Error?error.message:'操作を完了できませんでした')}
  finally {setBusy(false)}
 }
 return <>
  <Button variant="ghost" size="sm" onClick={()=>setOpen(true)}>通知履歴</Button>
  <Dialog open={open} onOpenChange={value=>{if(!busy){setOpen(value);setOperationError(null)}}}>
   <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
    <DialogHeader><DialogTitle>通知の送信履歴</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">送信受付済みは配信サービスが受け付けた状態です。相手の受信・既読とは異なります。</p>
    {query.isLoading&&<p>読み込み中…</p>}
    {query.isError&&<p role="alert" className="text-destructive">通知履歴を取得できません。<Button variant="link" onClick={()=>void query.refetch()}>再読み込み</Button></p>}
    {operationError&&<p role="alert" className="text-sm text-destructive">{operationError}</p>}
    {query.data?.deliveries.length===0&&<p>この形式で保存された通知履歴はありません。既存のメール履歴もご確認ください。</p>}
    <div className="space-y-4">
     {query.data?.deliveries.map(row=><section key={`${row.delivery_kind}:${row.id}`} className="rounded-lg border p-3 space-y-2">
      <p className="font-medium">{labels[row.channel]||row.channel}{row.channel.startsWith('gm_')&&row.recipient_name?`（${row.recipient_name}）`:''}</p>
      <p className={['failed','uncertain'].includes(row.status)?'text-destructive text-sm':'text-muted-foreground text-sm'}>{statuses[row.status]||row.status}</p>
      <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>
      {row.can_retry&&<><p className="text-sm">設定や連絡先を修正後、保存済みの連絡先で再試行できます。</p><Button size="sm" disabled={busy} onClick={()=>void run(row,'retry')}>未送信の通知を再試行</Button></>}
      {(row.status==='uncertain'||row.can_reconcile)&&<p className="text-sm">重複を防ぐため、自動再送を停止しています。外部の送信記録を確認してください。</p>}
      {row.can_reconcile&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>{setSelected(row.id);setProviderId('');setOperationError(null)}}>送信記録を照合</Button>}
      {row.can_resume_preparation&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void run(row,'resume')}>作成済みの案内先を確認して再開</Button>}
      {row.status==='uncertain'&&!row.can_reconcile&&<p className="text-sm">通知の準備中に処理結果が不明になりました。管理者による準備状況の確認が必要です。</p>}
      {selected===row.id&&<div className="space-y-2">
       <label className="text-sm" htmlFor={`receipt-${row.id}`}>{row.channel==='gm_discord'?'DiscordのチャンネルID/メッセージID':'メール配信サービスの受付ID'}</label>
       <Input id={`receipt-${row.id}`} value={providerId} onChange={event=>setProviderId(event.target.value)} disabled={busy} />
       <p className="text-xs text-muted-foreground">この操作は再送しません。宛先・内容・配送番号が一致する記録だけを送信受付済みにします。</p>
       <Button size="sm" disabled={busy||!providerId.trim()} onClick={()=>void run(row,'reconcile')}>照合して履歴を更新</Button>
      </div>}
     </section>)}
    </div>
   </DialogContent>
  </Dialog>
 </>
}
