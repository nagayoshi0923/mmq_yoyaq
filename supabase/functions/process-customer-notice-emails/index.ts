// お客様への知らせのメール（マイページ改修 段階 4）を送る。5 分ごとに定期実行から呼ばれる（2026-10-09）。
// 送信待ちは DB のトリガー・関数が customer_notice_emails に積む。app_config の customer_notice_email が 'on' の環境だけ取り出される。
// 形は事前配役アンケートのリマインド（process-survey-reminders）と同じ。
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, getServiceRoleKey, isCronOrServiceRoleCall, errorResponse, maskEmail, sanitizeErrorMessage } from '../_shared/security.ts'
import { insertEmailLog, updateEmailLog, type EmailLogType } from '../_shared/email-logs.ts'
import { buildCustomerNoticeEmail } from '../_shared/customer-notice-email.ts'

type Row = { id: string; organization_id: string; kind: string; email_type: string; to_email: string; to_name: string | null; subject: string; body_text: string; reply_to: string | null; sender_name: string | null }
const LOG_TYPES = new Set(['reservation_confirmed', 'reservation_cancelled', 'reservation_changed', 'other'])

serve(async req => {
  const headers = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return errorResponse('POSTが必要です', 405, headers)
  if (!isCronOrServiceRoleCall(req)) return errorResponse('サーバーからの実行が必要です', 401, headers)
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey())
  const senderEmail = Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
  const result = { sent: 0, failed: 0 }
  try {
    const { data, error } = await db.rpc('claim_customer_notice_emails', { p_limit: 20 })
    if (error) throw error
    const keys = new Map<string, string>()
    for (const row of (data ?? []) as Row[]) {
      const finish = (ok: boolean, extra: { provider?: string | null; error?: string | null; log?: string | null; retry?: boolean } = {}) =>
        db.rpc('finish_customer_notice_email', { p_id: row.id, p_ok: ok, p_provider_message_id: extra.provider ?? null, p_error: extra.error ?? null, p_email_log_id: extra.log ?? null, p_retry: extra.retry ?? true })
      if (!row.to_email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(row.to_email)) {
        await finish(false, { error: 'recipient_missing', retry: false }); result.failed++; continue
      }
      let apiKey = keys.get(row.organization_id)
      if (apiKey === undefined) {
        const { data: settings, error: settingsError } = await db.from('organization_settings').select('resend_api_key').eq('organization_id', row.organization_id).maybeSingle()
        if (settingsError) throw settingsError
        const resolved: string = settings?.resend_api_key || Deno.env.get('RESEND_API_KEY') || ''
        keys.set(row.organization_id, resolved)
        apiKey = resolved
      }
      if (!apiKey) { await finish(false, { error: 'mail_service_missing' }); result.failed++; continue }
      const mail = buildCustomerNoticeEmail(row, Deno.env.get('SITE_URL') || undefined)
      const emailType = (LOG_TYPES.has(row.email_type) ? row.email_type : 'other') as EmailLogType
      const logId = await insertEmailLog(db, { organization_id: row.organization_id, email_type: emailType, to_email: row.to_email, to_name: row.to_name, subject: mail.subject, body_text: mail.text, status: 'queued' })
      const replyTo = row.reply_to || Deno.env.get('REPLY_TO_EMAIL')
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `customer-notice-${row.id}` },
        body: JSON.stringify({ from: `${row.sender_name || 'クインズワルツ'} <${senderEmail}>`, to: [row.to_email], subject: mail.subject, text: mail.text, html: mail.html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      })
      if (!response.ok) {
        const message = sanitizeErrorMessage(await response.text())
        await updateEmailLog(db, logId, { status: 'failed', error_message: message })
        await finish(false, { error: message, log: logId, retry: response.status >= 500 || response.status === 429 }); result.failed++; continue
      }
      const sent = await response.json()
      await updateEmailLog(db, logId, { status: 'sent', provider_message_id: sent.id, sent_at: new Date().toISOString() })
      await finish(true, { provider: sent.id, log: logId }); result.sent++
      console.log('customer_notice_sent', { kind: row.kind, recipient: maskEmail(row.to_email) })
    }
    return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('customer_notice_worker_failed', sanitizeErrorMessage(error instanceof Error ? error.message : String(error)))
    return errorResponse('お知らせメールの送信処理を完了できませんでした', 503, headers)
  }
})
