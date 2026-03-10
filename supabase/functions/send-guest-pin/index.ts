// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, errorResponse, maskEmail, sanitizeErrorMessage, getServiceRoleKey } from '../_shared/security.ts'

interface SendPinRequest {
  groupId: string
  memberId: string
  email: string
  pin: string
  scenarioName: string
  inviteUrl: string
  guestName?: string
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { groupId, memberId, email, pin, scenarioName, inviteUrl, guestName }: SendPinRequest = await req.json()

    // 必須パラメータのバリデーション
    if (!groupId || !memberId || !email || !pin) {
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

    // メンバーが実際に存在し、メールアドレスとPINが一致するか検証
    const { data: member, error: memberError } = await serviceClient
      .from('private_group_members')
      .select('id, group_id, guest_email, access_pin')
      .eq('id', memberId)
      .eq('group_id', groupId)
      .single()

    if (memberError || !member) {
      console.warn('⚠️ メンバーが見つかりません:', { memberId, groupId })
      return errorResponse('メンバーが見つかりません', 404, corsHeaders)
    }

    // メールアドレスとPINが一致するか確認
    if (member.guest_email?.toLowerCase() !== email.toLowerCase() || member.access_pin !== pin) {
      console.warn('⚠️ メールアドレスまたはPINが一致しません')
      return errorResponse('認証情報が一致しません', 403, corsHeaders)
    }

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

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [email],
        subject: `【${scenarioName}】グループ参加のアクセスPINのご案内`,
        text: emailBody,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error:', errorData)
      throw new Error(`メール送信に失敗しました`)
    }

    const result = await resendResponse.json()
    console.log('✅ PIN email sent successfully:', {
      messageId: result.id,
      recipient: maskEmail(email),
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
