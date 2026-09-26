// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, errorResponse, maskEmail, sanitizeErrorMessage, getServiceRoleKey } from '../_shared/security.ts'
import { insertEmailLog, updateEmailLog } from '../_shared/email-logs.ts'

interface SendPinRequest {
  groupId: string
  memberId: string
  email: string
  pin: string
  scenarioName: string
  inviteUrl: string
  guestName?: string
  guestToken: string
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, corsHeaders)

  try {
    const { groupId, memberId, email, pin, guestToken }: SendPinRequest = await req.json()

    // 必須パラメータのバリデーション
    if (!groupId || !memberId || !email || !pin || !guestToken) {
      return errorResponse('必須パラメータが不足しています', 400, corsHeaders)
    }

    // メールアドレス形式検証
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      console.warn('⚠️ 無効なメールアドレス:', maskEmail(email))
      return errorResponse('無効なメールアドレスです', 400, corsHeaders)
    }

    // PIN形式検証（4桁の数字）
    if (!/^\d{4}$/.test(pin)) {
      return errorResponse('無効なPIN形式です', 400, corsHeaders)
    }

    // サービスロールクライアントでDBを検証
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    // Validate the same short-lived member credential used by guest actions.
    const { error: sessionError } = await serviceClient.rpc('private_group_member_action', {
      p_group_id: groupId, p_member_id: memberId, p_action: 'validate', p_payload: {}, p_guest_token: guestToken,
    })
    if (sessionError) return errorResponse('本人確認が必要です', 403, corsHeaders)
    const { data: authRows, error: authError } = await serviceClient.rpc('authenticate_guest_by_pin', {
      p_group_id: groupId, p_email: email, p_pin: pin,
    })
    const authenticated = Array.isArray(authRows) ? authRows[0] : authRows
    if (authError || !authenticated || authenticated.member_id !== memberId) {
      return errorResponse('認証情報が一致しません', 403, corsHeaders)
    }
    const { data: group, error: groupError } = await serviceClient.from('private_groups')
      .select('invite_code, scenario_masters:scenario_master_id(title)').eq('id', groupId).single()
    if (groupError || !group) return errorResponse('グループ情報を確認できません', 400, corsHeaders)
    const scenarioName = group.scenario_masters?.title || 'グループ'
    const guestName = authenticated.guest_name || 'ゲスト'
    const inviteUrl = `https://mmq.game/group/invite/${encodeURIComponent(group.invite_code)}`

    // Resend APIでメール送信
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const senderEmail = Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
    const senderName = Deno.env.get('SENDER_NAME') || 'MMQ予約システム'

    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }

    const displayName = guestName || 'ゲスト'
    const emailBody = `${displayName} 様

「${scenarioName}」のグループに参加登録いただきありがとうございます。

■ アクセスPIN
${pin}

このPINとメールアドレス（${email}）を使って、
いつでもグループの状況確認・回答変更ができます。

■ グループURL
${inviteUrl}

※このメールは自動送信されています。
`

    console.log('📧 Sending PIN email:', {
      recipient: maskEmail(email),
      scenarioName: scenarioName?.substring(0, 30),
    })

    const emailSubject = `【${scenarioName}】グループ参加のアクセスPINのご案内`

    const emailLogId = await insertEmailLog(serviceClient, {
      email_type: 'guest_pin',
      to_email:   email,
      to_name:    guestName ?? null,
      subject:    emailSubject,
      body_text:  emailBody.replace(`■ アクセスPIN\n${pin}`, '■ アクセスPIN\n[認証情報のため非記録]'),
      status:     'queued',
    })

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [email],
        subject: emailSubject,
        text: emailBody,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error:', errorData)
      await updateEmailLog(serviceClient, emailLogId, {
        status: 'failed',
        error_message: sanitizeErrorMessage(JSON.stringify(errorData)),
      })
      throw new Error(`メール送信に失敗しました`)
    }

    const result = await resendResponse.json()
    console.log('✅ PIN email sent successfully:', {
      messageId: result.id,
      recipient: maskEmail(email),
    })
    await updateEmailLog(serviceClient, emailLogId, {
      status: 'sent',
      provider_message_id: result.id,
      sent_at: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'PINメールを送信しました',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error sending PIN email:', sanitizeErrorMessage(msg))

    return new Response(
      JSON.stringify({
        success: false,
        error: sanitizeErrorMessage(msg || 'メール送信に失敗しました'),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
