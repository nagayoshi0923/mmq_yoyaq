/**
 * Resend に残っているメール本文 + ステータスを email_logs に同期する
 *
 * 経緯:
 *   Resend はダッシュボード/API 上のメールログを送信から 1 ヶ月で削除する。
 *   送信時に email_logs.body_html / body_text を保存する経路は別途用意したが、
 *   過去送信分や送信時保存に失敗したケースを救うため、定期的に Resend から
 *   本文を取得して email_logs に backfill する。
 *
 *   さらに、 resend-webhook が機能していなかった時期 (2026-04〜06 初頭) の
 *   メールは status='sent' のまま delivered/opened が反映されていないので、
 *   Resend GET /emails/:id のレスポンスに含まれる last_event を見て status
 *   と関連タイムスタンプも update する。
 *
 * 動作:
 *   1. provider_message_id がある かつ
 *      (body 未取得 OR status が確定前 sent/queued) のレコードを取得
 *   2. 各レコードについて Resend GET /emails/:id を呼び出し
 *   3. レスポンスの html / text / last_event を email_logs に update
 *   4. Resend rate limit (10 req/s) を考慮し 100ms 間隔で実行
 *
 * 認証:
 *   pg_cron からの定期呼び出し (x-cron-secret) または service-role キーのみ許可
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getCorsHeaders,
  getServiceRoleKey,
  isCronOrServiceRoleCall,
} from '../_shared/security.ts'

const RESEND_API_BASE = 'https://api.resend.com'
const BATCH_SIZE = 200
const RATE_LIMIT_INTERVAL_MS = 100 // 10 req/s

interface EmailLogRow {
  id: string
  provider_message_id: string | null
  status: string | null
  body_html: string | null
  body_text: string | null
}

interface ResendEmailResponse {
  id?: string
  html?: string | null
  text?: string | null
  created_at?: string | null
  last_event?: string | null
}

type EmailLogStatusUpdate = {
  status?: string
  sent_at?: string | null
  delivered_at?: string | null
  opened_at?: string | null
  bounced_at?: string | null
  complained_at?: string | null
}

/**
 * Resend の last_event から email_logs の status と関連タイムスタンプを決定する。
 * Resend API は個別イベントの timestamp を返さないので created_at で代用する。
 * delivered/opened/clicked などは「先に sent/delivered している」前提で
 * その時刻も併せて埋める（顧客視点でステータスが正しく見えれば十分）。
 */
function statusFromLastEvent(lastEvent: string | null | undefined, ts: string): EmailLogStatusUpdate | null {
  switch (lastEvent) {
    case 'sent':
      return { status: 'sent', sent_at: ts }
    case 'delivered':
      return { status: 'delivered', sent_at: ts, delivered_at: ts }
    case 'opened':
      return { status: 'opened', sent_at: ts, delivered_at: ts, opened_at: ts }
    case 'clicked':
      return { status: 'clicked', sent_at: ts, delivered_at: ts, opened_at: ts }
    case 'bounced':
      return { status: 'bounced', sent_at: ts, bounced_at: ts }
    case 'complained':
      return { status: 'complained', sent_at: ts, complained_at: ts }
    case 'delivery_delayed':
      return { status: 'delivery_delayed', sent_at: ts }
    case 'failed':
      return { status: 'failed' }
    default:
      return null
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    })
  }

  if (!isCronOrServiceRoleCall(req)) {
    return new Response(JSON.stringify({ success: false, error: '認証が必要です' }), {
      status: 401,
      headers: corsHeaders,
    })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY が設定されていません' }), {
      status: 500,
      headers: corsHeaders,
    })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(SUPABASE_URL, getServiceRoleKey())

  // body 未取得 もしくは status が確定前 (queued/sent) のものを対象にする。
  const { data: rows, error: selectError } = await supabase
    .from('email_logs')
    .select('id, provider_message_id, status, body_html, body_text')
    .not('provider_message_id', 'is', null)
    .or('and(body_html.is.null,body_text.is.null),status.eq.queued,status.eq.sent')
    .order('created_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (selectError) {
    console.error('email_logs select failed:', selectError)
    return new Response(
      JSON.stringify({ success: false, error: 'email_logs クエリ失敗', detail: selectError.message }),
      { status: 500, headers: corsHeaders },
    )
  }

  const targets = (rows ?? []) as EmailLogRow[]
  let bodyUpdated = 0
  let statusUpdated = 0
  let notFound = 0
  let failed = 0
  let bodyPlaceholder = 0

  for (const row of targets) {
    if (!row.provider_message_id) continue
    try {
      const res = await fetch(`${RESEND_API_BASE}/emails/${row.provider_message_id}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${resendApiKey}` },
      })

      if (res.status === 404) {
        notFound++
      } else if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.warn('Resend GET failed', row.provider_message_id, res.status, text.slice(0, 200))
        failed++
      } else {
        const data = (await res.json()) as ResendEmailResponse
        const bodyHtml = data.html ?? null
        const bodyText = data.text ?? null
        const ts = data.created_at ?? new Date().toISOString()
        const statusPatch = statusFromLastEvent(data.last_event, ts)

        // 1) body 部分の patch を組み立て (まだ取得していない場合のみ)
        const bodyPatch: Record<string, string | null> = {}
        const needsBody = row.body_html === null && row.body_text === null
        if (needsBody) {
          if (!bodyHtml && !bodyText) {
            // 本文は Resend から消去済み → プレースホルダで sync 対象から外す
            bodyPatch.body_text = '(Resend のメール保持期間 (約1ヶ月) を過ぎたため本文を取得できませんでした)'
          } else {
            bodyPatch.body_html = bodyHtml
            bodyPatch.body_text = bodyText
          }
        }

        const combinedPatch = { ...bodyPatch, ...(statusPatch ?? {}) }
        if (Object.keys(combinedPatch).length === 0) continue

        const { error: updateError } = await supabase
          .from('email_logs')
          .update(combinedPatch)
          .eq('id', row.id)

        if (updateError) {
          console.warn('email_logs update failed:', row.id, updateError.message)
          failed++
        } else {
          if (needsBody) {
            if (bodyPatch.body_text && !bodyPatch.body_html) bodyPlaceholder++
            else bodyUpdated++
          }
          if (statusPatch && statusPatch.status !== row.status) statusUpdated++
        }
      }
    } catch (err: unknown) {
      console.error('sync exception:', (err as Error).message)
      failed++
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_INTERVAL_MS))
  }

  const summary = {
    success: true,
    fetched: targets.length,
    bodyUpdated,
    statusUpdated,
    bodyPlaceholder,
    notFound,
    failed,
  }
  console.log('📬 sync-resend-email-logs summary:', summary)

  return new Response(JSON.stringify(summary), { status: 200, headers: corsHeaders })
})
