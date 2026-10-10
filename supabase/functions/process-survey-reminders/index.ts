// 事前配役アンケートの未回答者へのリマインドメールを送る（5 分ごとに定期実行から呼ばれる。2026-10-06）。
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, getServiceRoleKey, isCronOrServiceRoleCall, errorResponse, maskEmail, sanitizeErrorMessage } from '../_shared/security.ts'
import { insertEmailLog, updateEmailLog } from '../_shared/email-logs.ts'
import { buildSurveyReminderEmail } from '../_shared/survey-reminder-email.ts'

type Row = { id: string; organization_id: string; kind: string; to_email: string | null; to_name: string; scenario_title: string | null; performance_date: string | null; start_time: string | null; venue: string | null; deadline_at: string; invite_code: string; company_name: string; reply_to: string | null }

serve(async req => {
  const headers = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return errorResponse('POSTが必要です', 405, headers)
  if (!isCronOrServiceRoleCall(req)) return errorResponse('サーバーからの実行が必要です', 401, headers)
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey())
  const senderEmail = Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
  const result = { sent: 0, failed: 0 }
  try {
    const { data, error } = await db.rpc('claim_private_group_survey_reminders', { p_limit: 20 })
    if (error) throw error
    const keys = new Map<string, string>()
    for (const row of (data ?? []) as Row[]) {
      const finish = (ok: boolean, extra: { provider?: string | null; error?: string | null; log?: string | null; retry?: boolean } = {}) =>
        db.rpc('finish_private_group_survey_reminder', { p_id: row.id, p_ok: ok, p_provider_message_id: extra.provider ?? null, p_error: extra.error ?? null, p_email_log_id: extra.log ?? null, p_retry: extra.retry ?? true })
      if (!row.to_email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(row.to_email) || !row.scenario_title || !row.performance_date) {
        await finish(false, { error: 'recipient_or_event_missing', retry: false }); result.failed++; continue
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
      const mail = buildSurveyReminderEmail({
        toName: row.to_name, scenarioTitle: row.scenario_title, performanceDate: row.performance_date, startTime: row.start_time,
        venue: row.venue, deadlineAt: row.deadline_at, inviteCode: row.invite_code, companyName: row.company_name, siteUrl: Deno.env.get('SITE_URL') || undefined,
      })
      const logId = await insertEmailLog(db, { organization_id: row.organization_id, email_type: 'reminder', to_email: row.to_email, to_name: row.to_name, subject: mail.subject, body_text: mail.text, status: 'queued' })
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `survey-reminder-${row.id}` },
        body: JSON.stringify({ from: `${row.company_name} <${senderEmail}>`, to: [row.to_email], subject: mail.subject, text: mail.text, html: mail.html, ...((row.reply_to || Deno.env.get('REPLY_TO_EMAIL')) ? { reply_to: row.reply_to || Deno.env.get('REPLY_TO_EMAIL') } : {}) }),
      })
      if (!response.ok) {
        const message = sanitizeErrorMessage(await response.text())
        await updateEmailLog(db, logId, { status: 'failed', error_message: message })
        await finish(false, { error: message, log: logId, retry: response.status >= 500 || response.status === 429 }); result.failed++; continue
      }
      const sent = await response.json()
      await updateEmailLog(db, logId, { status: 'sent', provider_message_id: sent.id, sent_at: new Date().toISOString() })
      await finish(true, { provider: sent.id, log: logId }); result.sent++
      console.log('survey_reminder_sent', { kind: row.kind, recipient: maskEmail(row.to_email) })
    }
    return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('survey_reminder_worker_failed', sanitizeErrorMessage(error instanceof Error ? error.message : String(error)))
    return errorResponse('リマインドの送信処理を完了できませんでした', 503, headers)
  }
})
