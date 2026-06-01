/**
 * Resend に残っている過去のメール本文を email_logs に同期する
 *
 * 経緯:
 *   Resend はダッシュボード/API 上のメールログを送信から 1 ヶ月で削除する。
 *   送信時に email_logs.body_html / body_text を保存する経路は別途用意したが、
 *   過去送信分や送信時保存に失敗したケースを救うため、定期的に Resend から
 *   本文を取得して email_logs に backfill する。
 *
 * 動作:
 *   1. email_logs から provider_message_id がある かつ
 *      body_html / body_text が両方 NULL のレコードを最大 BATCH_SIZE 件取得
 *   2. 各レコードについて Resend GET /emails/:id を呼び出して本文取得
 *   3. レスポンスの html / text を email_logs に update
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
}

interface ResendEmailResponse {
  id?: string
  html?: string | null
  text?: string | null
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

  const { data: rows, error: selectError } = await supabase
    .from('email_logs')
    .select('id, provider_message_id')
    .not('provider_message_id', 'is', null)
    .is('body_html', null)
    .is('body_text', null)
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
  let updated = 0
  let notFound = 0
  let failed = 0
  let skipped = 0

  for (const row of targets) {
    if (!row.provider_message_id) {
      skipped++
      continue
    }
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

        if (!bodyHtml && !bodyText) {
          skipped++
        } else {
          const { error: updateError } = await supabase
            .from('email_logs')
            .update({ body_html: bodyHtml, body_text: bodyText })
            .eq('id', row.id)

          if (updateError) {
            console.warn('email_logs update failed:', row.id, updateError.message)
            failed++
          } else {
            updated++
          }
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
    updated,
    notFound,
    failed,
    skipped,
  }
  console.log('📬 sync-resend-email-logs summary:', summary)

  return new Response(JSON.stringify(summary), { status: 200, headers: corsHeaders })
})
