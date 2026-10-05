// ゲストが PIN を忘れたとき、参加時のメールアドレスへ新しい PIN を送る（2026-10-06）。
// 参加の有無を漏らさないため、登録が無い・回数制限に当たった場合も同じ応答を返す。
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, errorResponse, maskEmail, sanitizeErrorMessage, getServiceRoleKey } from '../_shared/security.ts'
import { insertEmailLog, updateEmailLog } from '../_shared/email-logs.ts'
import { buildGuestPinResetEmail } from '../_shared/guest-pin-reset-email.ts'

const SAME_ANSWER = { success: true, message: 'ご登録があれば、新しいPINをメールでお送りしました。' }

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, corsHeaders)
  const reply = () => new Response(JSON.stringify(SAME_ANSWER), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  let body: { inviteCode?: unknown; email?: unknown }
  try { body = await req.json() } catch { return errorResponse('入力が正しくありません', 400, corsHeaders) }
  const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!inviteCode || inviteCode.length > 64 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return errorResponse('メールアドレスを確認してください', 400, corsHeaders)
  }

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey())
  try {
    const { data, error } = await db.rpc('reset_private_group_guest_pin', { p_invite_code: inviteCode, p_email: email })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.pin || !row?.guest_email) return reply()

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) throw new Error('メール送信サービスが設定されていません')
    const senderEmail = Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
    const senderName = Deno.env.get('SENDER_NAME') || 'MMQ予約システム'
    const mail = buildGuestPinResetEmail({ guestName: row.guest_name, email: row.guest_email, pin: row.pin, scenarioTitle: row.scenario_title, inviteCode: row.invite_code })

    const emailLogId = await insertEmailLog(db, {
      email_type: 'guest_pin', to_email: row.guest_email, to_name: row.guest_name ?? null,
      subject: mail.subject, body_text: mail.text.replace(row.pin, '[認証情報のため非記録]'), status: 'queued',
    })
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${senderName} <${senderEmail}>`, to: [row.guest_email], subject: mail.subject, text: mail.text }),
    })
    if (!response.ok) {
      await updateEmailLog(db, emailLogId, { status: 'failed', error_message: sanitizeErrorMessage(await response.text()) })
      throw new Error('メール送信に失敗しました')
    }
    const sent = await response.json()
    await updateEmailLog(db, emailLogId, { status: 'sent', provider_message_id: sent.id, sent_at: new Date().toISOString() })
    console.log('guest_pin_reset_sent', { recipient: maskEmail(row.guest_email) })
    return reply()
  } catch (error) {
    console.error('guest_pin_reset_failed', sanitizeErrorMessage(error instanceof Error ? error.message : String(error)))
    return errorResponse('ただいま送信できません。時間をおいてお試しください', 503, corsHeaders)
  }
})
