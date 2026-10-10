// 貸切グループのプッシュ通知（ウェブプッシュ、段階 3、2026-10-10）を送る。
// 送信待ち web_push_outbox は DB のトリガーが積み、積んだときに pg_net でこの関数を呼ぶ（毎分の定期実行は取りこぼし用）。
// 外部サービスは使わない（ブラウザの配信元へ VAPID で直接送る）。鍵は Supabase の secrets: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT。
// 呼び出しの確認は WEB_PUSH_CRON_SECRET（= app_config の trigger_secret。無ければ CRON_SECRET）。
//
// - チャットの発言・返信は、送る直前に「いま見ている人」を除く: 既読時刻（private_group_read_states）が発言より新しい人と、
//   チャットの Realtime presence で viewing=true の人。
// - 送信失敗が 404/410 の端末は購読を消す。429/5xx はあとでもう一度（5 回まで）。
// - まとめ待ち（30 秒以内の連続発言）が近いうちに来るときは、応答のあとに待って送る（EdgeRuntime.waitUntil）。
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, getServiceRoleKey, isCronOrServiceRoleCall, errorResponse, sanitizeErrorMessage, timingSafeEqualString } from '../_shared/security.ts'
import { PUSH_ENDPOINT_PATTERN, encryptWebPushPayload, groupChannelTopic, importVapidPrivateKey, vapidJwt } from '../_shared/web-push.ts'

type Row = {
  id: string; user_id: string; group_id: string | null; member_id: string | null; kind: 'chat' | 'reply' | 'notice'
  title: string; body: string; url: string; tag: string; last_message_at: string | null; invite_code: string | null; attempt_count: number
}
type Subscription = { id: string; endpoint: string; p256dh: string; auth: string }
type Vapid = { publicKey: string; key: CryptoKey; subject: string }

const PRESENCE_TIMEOUT_MS = 2500
/** この秒数以内に送る予定のまとめ待ちは、応答のあとに待って送る */
const WAIT_FOR_DUE_SECONDS = 40

/**
 * DB（トリガー・定期実行）からの呼び出しか。app_config の trigger_secret を x-cron-secret で受ける。
 * 環境によって CRON_SECRET と trigger_secret が違う（staging で確認）ため、専用の WEB_PUSH_CRON_SECRET を先に見る。
 */
function isDbCall(req: Request): boolean {
  const dedicated = (Deno.env.get('WEB_PUSH_CRON_SECRET') || '').trim()
  const received = (req.headers.get('x-cron-secret') || '').trim()
  if (dedicated && received && timingSafeEqualString(received, dedicated)) return true
  return isCronOrServiceRoleCall(req)
}

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

/** チャットをいま見ている参加者（presence の viewing=true）。つながらなければ空（＝既読時刻だけで判定） */
async function viewingMembers(db: SupabaseClient, inviteCode: string): Promise<Set<string>> {
  const topic = await groupChannelTopic(inviteCode)
  return await new Promise(resolve => {
    const channel = db.channel(topic, { config: { presence: { key: `push-worker-${crypto.randomUUID()}` } } })
    let done = false
    const finish = (found: Set<string>) => {
      if (done) return
      done = true
      clearTimeout(timer)
      void db.removeChannel(channel)
      resolve(found)
    }
    const timer = setTimeout(() => finish(new Set()), PRESENCE_TIMEOUT_MS)
    channel
      .on('presence', { event: 'sync' }, () => {
        const found = new Set<string>()
        for (const metas of Object.values(channel.presenceState() as Record<string, Array<{ member_id?: unknown; viewing?: unknown }>>)) {
          for (const meta of metas) if (meta.viewing === true && typeof meta.member_id === 'string') found.add(meta.member_id)
        }
        finish(found)
      })
      .subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') finish(new Set()) })
  })
}

async function loadVapid(): Promise<Vapid | null> {
  const publicKey = (Deno.env.get('VAPID_PUBLIC_KEY') || '').trim()
  const privateKey = (Deno.env.get('VAPID_PRIVATE_KEY') || '').trim()
  if (!publicKey || !privateKey) return null
  const subject = (Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@mmq.game').trim()
  return { publicKey, key: await importVapidPrivateKey(publicKey, privateKey), subject }
}

async function sendOne(sub: Subscription, payload: Uint8Array, vapid: Vapid, jwtCache: Map<string, string>, urgency: string): Promise<number> {
  const origin = new URL(sub.endpoint).origin
  let jwt = jwtCache.get(origin)
  if (!jwt) { jwt = await vapidJwt(sub.endpoint, vapid.subject, vapid.key); jwtCache.set(origin, jwt) }
  const body = await encryptWebPushPayload(payload, sub.p256dh, sub.auth)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400', Urgency: urgency, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body,
  })
  await res.body?.cancel()
  return res.status
}

async function processDue(db: SupabaseClient, vapid: Vapid): Promise<{ sent: number; skipped: number; failed: number }> {
  const result = { sent: 0, skipped: 0, failed: 0 }
  const { data, error } = await db.rpc('web_push_claim', { p_limit: 50 })
  if (error) throw error
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return result
  const finish = (row: Row, status: 'sent' | 'skipped' | 'failed' | 'retry', extra: { delivered?: number; reason?: string; retry?: number } = {}) =>
    db.rpc('web_push_finish', { p_id: row.id, p_status: status, p_delivered: extra.delivered ?? null, p_reason: extra.reason ?? null, p_retry_seconds: extra.retry ?? 60 })

  // いま見ている人: グループごとに 1 回だけ presence を見る。既読時刻はまとめて読む
  const chatRows = rows.filter(r => r.kind !== 'notice' && r.group_id && r.member_id)
  const viewing = new Map<string, Set<string>>()
  for (const groupId of new Set(chatRows.map(r => r.group_id as string))) {
    const code = chatRows.find(r => r.group_id === groupId)?.invite_code
    viewing.set(groupId, code ? await viewingMembers(db, code) : new Set())
  }
  const readAt = new Map<string, number>()
  if (chatRows.length > 0) {
    const { data: states } = await db.from('private_group_read_states').select('member_id,last_read_at').in('member_id', chatRows.map(r => r.member_id as string))
    for (const s of (states ?? []) as Array<{ member_id: string; last_read_at: string }>) readAt.set(s.member_id, new Date(s.last_read_at).getTime())
  }

  const { data: subsData, error: subsError } = await db.from('web_push_subscriptions').select('id,user_id,endpoint,p256dh,auth').in('user_id', [...new Set(rows.map(r => r.user_id))])
  if (subsError) throw subsError
  const subsByUser = new Map<string, Subscription[]>()
  for (const s of (subsData ?? []) as Array<Subscription & { user_id: string }>) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s])
  const jwtCache = new Map<string, string>()

  for (const row of rows) {
    if (row.kind !== 'notice' && row.group_id && row.member_id) {
      const lastAt = row.last_message_at ? new Date(row.last_message_at).getTime() : 0
      if (viewing.get(row.group_id)?.has(row.member_id)) { await finish(row, 'skipped', { reason: 'viewing' }); result.skipped++; continue }
      if ((readAt.get(row.member_id) ?? 0) >= lastAt) { await finish(row, 'skipped', { reason: 'already_read' }); result.skipped++; continue }
    }
    const subs = (subsByUser.get(row.user_id) ?? []).filter(s => PUSH_ENDPOINT_PATTERN.test(s.endpoint))
    if (subs.length === 0) { await finish(row, 'skipped', { reason: 'no_subscription' }); result.skipped++; continue }
    const payload = new TextEncoder().encode(JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.tag }))
    let delivered = 0
    let transient = false
    const errors: string[] = []
    for (const sub of subs) {
      try {
        const status = await sendOne(sub, payload, vapid, jwtCache, row.kind === 'notice' ? 'normal' : 'high')
        if (status >= 200 && status < 300) {
          delivered++
          await db.from('web_push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sub.id)
        } else if (status === 404 || status === 410) {
          // 端末側で購読が無くなった（アプリを消した・通知を切った など）
          await db.from('web_push_subscriptions').delete().eq('id', sub.id)
          errors.push(`gone:${status}`)
        } else {
          if (status === 429 || status >= 500) transient = true
          errors.push(`http:${status}`)
        }
      } catch (err) {
        transient = true
        errors.push(sanitizeErrorMessage(err instanceof Error ? err.message : String(err)).slice(0, 120))
      }
    }
    if (delivered > 0) { await finish(row, 'sent', { delivered }); result.sent++ }
    else if (transient) { await finish(row, 'retry', { reason: errors.join(','), retry: 60 * row.attempt_count }); result.failed++ }
    else { await finish(row, 'failed', { reason: errors.join(',') || 'not_delivered' }); result.failed++ }
    console.log('web_push_result', { kind: row.kind, devices: subs.length, delivered, errors })
  }
  return result
}

/** まとめ待ちが近いうちに来るなら、その時刻まで待って送る（何度か繰り返す） */
async function drainSoon(db: SupabaseClient, vapid: Vapid): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const { data } = await db.rpc('web_push_next_due')
    if (!data) return
    const wait = new Date(data as string).getTime() - Date.now()
    if (wait > WAIT_FOR_DUE_SECONDS * 1000) return
    if (wait > 0) await new Promise(r => setTimeout(r, wait + 300))
    await processDue(db, vapid)
  }
}

serve(async req => {
  const headers = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return errorResponse('POSTが必要です', 405, headers)
  if (!isDbCall(req)) return errorResponse('サーバーからの実行が必要です', 401, headers)
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey(), { auth: { persistSession: false } })
  try {
    const vapid = await loadVapid()
    if (!vapid) {
      console.error('web_push_vapid_missing')
      return errorResponse('通知の鍵が設定されていません', 503, headers)
    }
    const result = await processDue(db, vapid)
    const later = drainSoon(db, vapid).catch(err => console.error('web_push_drain_failed', sanitizeErrorMessage(err instanceof Error ? err.message : String(err))))
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(later)
    else await later
    return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('web_push_worker_failed', sanitizeErrorMessage(error instanceof Error ? error.message : String(error)))
    return errorResponse('通知の送信処理を完了できませんでした', 503, headers)
  }
})
