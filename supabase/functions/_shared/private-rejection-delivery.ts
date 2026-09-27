// 配送ワーカーはDB保存済みスナップショットだけを扱う。プロバイダー送信はテストで差し替える。
export interface RejectionDelivery {
  id: string; organization_id: string; reservation_id: string; cancelled_at: string
  customer_email: string | null; customer_name: string; scenario_title: string; message_body: string
  status: string; attempt_count: number; first_attempt_at: string | null
  provider_payload: Record<string, unknown> | null; provider_account_hash: string | null
  email_log_id?: string | null; provider_message_id?: string | null; lease_token?: string | null; next_attempt_at: string
}
export interface RejectionDeliveryStore {
  recoverExpired(now: string): Promise<void>
  due(now: string, id?: string): Promise<RejectionDelivery[]>
  claim(row: RejectionDelivery, token: string, now: string, lease: string): Promise<RejectionDelivery | null>
  save(row: RejectionDelivery, token: string, values: Record<string, unknown>): Promise<void>
  isCurrent(row: RejectionDelivery): Promise<boolean>
  ensureLog(row: RejectionDelivery, payload: Record<string, unknown>): Promise<void>
  complete(row: RejectionDelivery, token: string, providerId: string, now: string): Promise<void>
}
export interface RejectionSenderSettings { apiKey: string; from: string; replyTo?: string }
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!)
const WINDOW_MS = 23 * 60 * 60 * 1000 // Resendの24時間より余裕を取り、境界を越えた曖昧な再送を止める。
class DeliveryError extends Error {
  constructor(readonly code: string, readonly terminal = false) { super(code) }
}
export async function deliverPrivateRejections(
  store: RejectionDeliveryStore,
  settings: (org: string) => Promise<RejectionSenderSettings>,
  options: { send?: typeof fetch; now?: () => number; id?: string } = {},
) {
  const send = options.send ?? fetch, now = options.now ?? Date.now
  await store.recoverExpired(new Date(now()).toISOString())
  const rows = await store.due(new Date(now()).toISOString(), options.id)
  const result = { sent: 0, retrying: 0, stopped: 0 }
  const startedAt=now()
  for (const candidate of rows) {
    if(now()-startedAt>45_000) break // 次の定期実行に残りを渡し、ランタイム終了前に状態を保存する。
    const token = crypto.randomUUID(), stamp = new Date(now()).toISOString()
    const row = await store.claim(candidate, token, stamp, new Date(now()+120_000).toISOString())
    if (!row) continue
    let firstAttempt = row.first_attempt_at
    try {
      if (!await store.isCurrent(row)) {
        await store.save(row,token,{status:'superseded',last_error:'reservation_generation_changed',lease_token:null,lease_until:null})
        result.stopped++; continue
      }
      if (firstAttempt && now()-Date.parse(firstAttempt) >= WINDOW_MS) {
        await store.save(row,token,{status:'uncertain',last_error:'idempotency_window_expired',lease_token:null,lease_until:null})
        result.stopped++; continue
      }
      if (!row.customer_email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(row.customer_email)) throw new DeliveryError('recipient_missing_or_invalid',true)
      const config = await settings(row.organization_id)
      if (!config.apiKey || !config.from) throw new DeliveryError('sender_not_configured',true)
      const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(config.apiKey))
      const keyHash = Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')
      if (row.provider_account_hash && row.provider_account_hash !== keyHash) throw new DeliveryError('provider_account_changed',true)
      const payload = row.provider_payload ?? {
        from: config.from, to: [row.customer_email],
        subject: `【貸切リクエスト】${row.scenario_title}のお申し込みについて`,
        html: `<div style="font-family:sans-serif;line-height:1.8">${row.message_body.split('\n').map(line=>`<p>${line ? escapeHtml(line) : '&nbsp;'}</p>`).join('')}</div>`,
        text: row.message_body, tags:[{name:'mmq_delivery',value:row.id}], ...(config.replyTo ? {reply_to:config.replyTo} : {}),
      }
      // 内容と送信アカウントを先に固定。同じキーの再送で現在の設定を適用し直さない。
      await store.save(row,token,{provider_payload:payload,provider_account_hash:keyHash})
      await store.ensureLog(row,payload) // 保存失敗時にメールだけ送らない。
      // 設定/履歴の保存中に再承認された場合も、外部要求を出す直前に止める。
      if (!await store.isCurrent(row)) {
        await store.save(row,token,{status:'superseded',last_error:'reservation_generation_changed',lease_token:null,lease_until:null})
        result.stopped++; continue
      }
      firstAttempt ||= new Date(now()).toISOString()
      await store.save(row,token,{first_attempt_at:firstAttempt,attempt_count:row.attempt_count+1})
      const response = await send('https://api.resend.com/emails',{
        method:'POST', headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`private-rejection/${row.id}`},
        body:JSON.stringify(payload),signal:AbortSignal.timeout(15_000),
      })
      const body = await response.json().catch(()=>null)
      if (!response.ok) {
        const retryable = response.status===429 || response.status>=500 || (response.status===409 && body?.name==='concurrent_idempotent_requests')
        throw new DeliveryError(`provider_http_${response.status}`,!retryable)
      }
      if (typeof body?.id !== 'string' || !body.id) throw new DeliveryError('provider_response_unconfirmed')
      await store.complete(row,token,body.id,new Date(now()).toISOString())
      result.sent++
    } catch (error) {
      const code = error instanceof DeliveryError ? error.code : 'delivery_interrupted'
      const terminal = error instanceof DeliveryError && error.terminal
      const attempts = row.attempt_count+1
      const exhausted = attempts>=5
      const expired = firstAttempt && now()-Date.parse(firstAttempt)>=WINDOW_MS
      const status = terminal ? (firstAttempt ? 'uncertain' : 'failed') : exhausted || expired ? (firstAttempt ? 'uncertain' : 'failed') : 'pending'
      await store.save(row,token,{status,attempt_count:attempts,first_attempt_at:firstAttempt,last_error:code,
        next_attempt_at:new Date(now()+Math.min(60,5*Math.pow(2,attempts-1))*60_000).toISOString(),lease_token:null,lease_until:null})
      if(status==='pending') result.retrying++; else result.stopped++
    }
  }
  return result
}
