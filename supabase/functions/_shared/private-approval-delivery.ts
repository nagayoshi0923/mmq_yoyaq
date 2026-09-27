export interface ApprovalDelivery {
 id: string; request_id: string | null; organization_id: string; reservation_id: string; schedule_event_id: string
 kind: 'confirmation_email' | 'gm_email' | 'gm_discord'; recipient_key: string; snapshot: Record<string, any>
 status: string; attempt_count: number; next_attempt_at: string; first_attempt_at: string | null
 preparation_attempted_at?: string | null; provider_payload: Record<string, unknown> | null; provider_target: string | null
 provider_account_hash: string | null; provider_message_id: string | null; email_log_id?: string | null
}
export interface ApprovalDeliveryStore {
 recoverExpired(now: string): Promise<void>
 due(now: string): Promise<ApprovalDelivery[]>
 claim(row: ApprovalDelivery, token: string, now: string, until: string): Promise<ApprovalDelivery | null>
 save(row: ApprovalDelivery, token: string, patch: Record<string, unknown>): Promise<void>
 isCurrent(row: ApprovalDelivery): Promise<boolean>
 ensureLog(row: ApprovalDelivery, payload: Record<string, unknown>): Promise<void>
 complete(row: ApprovalDelivery, token: string, providerId: string, now: string): Promise<void>
}
export class ApprovalDeliveryError extends Error {
 constructor(readonly code: string, readonly retryable = false, readonly outcome: 'not_sent' | 'unknown' = 'not_sent') { super(code) }
}
export interface ApprovalDeliveryTransport {
 credentials(row: ApprovalDelivery): Promise<{ key: string; config: Record<string, any> }>
 prepare(row: ApprovalDelivery, config: Record<string, any>, checkpoint: (patch: Record<string, unknown>) => Promise<void>): Promise<{ payload: Record<string, unknown>; target: string } | { skip: string }>
 send(row: ApprovalDelivery, payload: Record<string, unknown>, target: string, key: string): Promise<string>
}
// Resendの冪等キーの保持期限より余裕を取る。Discordは応答不明後の自動再送を行わない。
const EMAIL_RETRY_WINDOW = 23 * 60 * 60 * 1000
export async function deliverPrivateApprovals(store: ApprovalDeliveryStore, transport: ApprovalDeliveryTransport, now = Date.now) {
 const stamp = () => new Date(now()).toISOString()
 await store.recoverExpired(stamp())
 const rows = await store.due(stamp()), started = now()
 const result = { sent: 0, pending: 0, stopped: 0 }
 for (const candidate of rows) {
  if (now() - started > 40_000) break
  const token = crypto.randomUUID()
  const row = await store.claim(candidate, token, stamp(), new Date(now() + 120_000).toISOString())
  if (!row) continue
  let first = row.first_attempt_at
  let receipt = row.provider_message_id
  let attempted = Boolean(first)
  const save = (patch: Record<string, unknown>) => store.save(row, token, patch)
  const stop = async (status: string, code: string) => {
   await save({status,last_error:code,lease_token:null,lease_until:null}); result.stopped++
  }
  try {
   // 受付IDが保存済みなら外部送信を繰り返さず、記録の確定だけを再実行する。
   if (row.provider_message_id) {
    await store.complete(row, token, row.provider_message_id, stamp()); result.sent++; continue
   }
   if (first && (row.kind === 'gm_discord' || now() - Date.parse(first) >= EMAIL_RETRY_WINDOW)) {
    await stop('uncertain', 'provider_receipt_unconfirmed'); continue
   }
   if (!await store.isCurrent(row)) { await stop('superseded', 'approval_changed'); continue }
   const {key, config} = await transport.credentials(row)
   if(config.disabledReason) { await stop(first?'uncertain':'skipped',config.disabledReason); continue }
   let payload = row.provider_payload, target = row.provider_target
   if (!payload || !target) {
    const prepared = await transport.prepare(row, config, save)
    if ('skip' in prepared) { await stop('skipped', prepared.skip); continue }
    payload = prepared.payload; target = prepared.target
   }
   if (!key) throw new ApprovalDeliveryError('sender_not_configured')
   const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
   const hash = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2,'0')).join('')
   if (row.provider_account_hash && row.provider_account_hash !== hash) throw new ApprovalDeliveryError('provider_account_changed')
   await save({provider_payload:payload,provider_target:target,provider_account_hash:hash})
   await store.ensureLog(row,payload)
   if (!await store.isCurrent(row)) { await stop('superseded', 'approval_changed'); continue }
   first ||= stamp()
   await save({first_attempt_at:first,attempt_count:row.attempt_count+1})
   attempted = true
   const providerId = await transport.send(row,payload,target,key)
   if (!providerId) throw new ApprovalDeliveryError('provider_receipt_missing',true,'unknown')
   receipt = providerId
   await save({provider_message_id:providerId})
   await store.complete(row,token,providerId,stamp()); result.sent++
  } catch (error) {
   if (receipt) {
    await save({status:'pending',provider_message_id:receipt,last_error:'receipt_completion_pending',lease_token:null,lease_until:null})
    result.pending++; continue
   }
   const known = error instanceof ApprovalDeliveryError ? error : null
   const code = known?.code ?? 'delivery_interrupted'
   const unknown = known?.outcome === 'unknown' || (attempted && !known)
   // 明示的拒否だけは未送信と確定できる。通信例外や5xxを未送信に見せない。
   if (attempted && known?.outcome === 'not_sent' && !row.first_attempt_at) first = null
   const uncertain = unknown && (!attempted || row.kind === 'gm_discord' || row.attempt_count >= 4 || (first && now()-Date.parse(first)>=EMAIL_RETRY_WINDOW))
   const retryable = !known || known.retryable
   const status = uncertain ? 'uncertain' : retryable && row.attempt_count < 4 ? 'pending' : first ? 'uncertain' : 'failed'
   await save({status,first_attempt_at:first,attempt_count:row.attempt_count+1,last_error:code,
    next_attempt_at:new Date(now()+Math.min(60,5*2**row.attempt_count)*60_000).toISOString(),lease_token:null,lease_until:null})
   if (status === 'pending') result.pending++; else result.stopped++
  }
 }
 return result
}
