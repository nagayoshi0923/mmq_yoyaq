// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings } from '../_shared/organization-settings.ts'
import { getCorsHeaders, verifyAuth, errorResponse, maskEmail, sanitizeErrorMessage, getServiceRoleKey } from '../_shared/security.ts'

interface EmailRequest {
  organizationId?: string  // マルチテナント対応
  to: string | string[]
  subject: string
  body: string
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 認証チェック: admin / license_admin / staff（invite-staff と同等の管理者系）
    const authResult = await verifyAuth(req, ['admin', 'license_admin', 'staff'])
    if (!authResult.success) {
      console.warn('⚠️ send-email 認証失敗:', authResult.error)
      return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
    }

    console.log('✅ 認証成功:', maskEmail(authResult.user?.email || ''))

    const { organizationId, to, subject, body }: EmailRequest = await req.json()

    // 🔒 メールアドレス形式検証
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const recipients = Array.isArray(to) ? to : [to]
    
    for (const email of recipients) {
      if (!email || !emailRegex.test(email)) {
        console.warn('⚠️ 無効なメールアドレス:', maskEmail(email || ''))
        return errorResponse('無効なメールアドレスが含まれています', 400, corsHeaders)
      }
    }

    // 🔒 必須フィールドの検証
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return errorResponse('件名は必須です', 400, corsHeaders)
    }
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return errorResponse('本文は必須です', 400, corsHeaders)
    }

    // 組織設定からメール設定を取得
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    // 🔒 組織ID検証: 呼び出し元ユーザーの組織と一致するか確認
    if (organizationId) {
      const { data: callerStaff } = await serviceClient
        .from('staff')
        .select('organization_id')
        .eq('user_id', authResult.user?.id)
        .maybeSingle()

      let callerOrgId = callerStaff?.organization_id || null

      // staffテーブルにない場合はusersテーブルから取得
      if (!callerOrgId) {
        const { data: callerUser } = await serviceClient
          .from('users')
          .select('organization_id')
          .eq('id', authResult.user?.id)
          .single()
        callerOrgId = callerUser?.organization_id || null
      }

      if (callerOrgId && callerOrgId !== organizationId) {
        console.warn('⚠️ 組織ID不一致: 呼び出し元=%s, リクエスト=%s', callerOrgId, organizationId)
        return errorResponse('他組織のメール設定は使用できません', 403, corsHeaders)
      }
    }
    
    const emailSettings = organizationId 
      ? await getEmailSettings(serviceClient, organizationId)
      : null
    
    const resendApiKey = emailSettings?.resendApiKey || Deno.env.get('RESEND_API_KEY')
    const senderEmail = emailSettings?.senderEmail || Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
    const senderName = emailSettings?.senderName || Deno.env.get('SENDER_NAME') || 'MMQ予約システム'
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }

    // ログにはマスキングした情報のみ出力
    console.log('📧 Sending email:', {
      recipientCount: recipients.length,
      recipients: recipients.map(r => maskEmail(r)),
      subject: subject.substring(0, 50) + (subject.length > 50 ? '...' : ''),
      requestedBy: maskEmail(authResult.user?.email || ''),
    })

    // Resend APIを使ってメール送信
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: recipients,
        subject: subject,
        text: body,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error:', errorData)
      throw new Error(`メール送信に失敗しました: ${JSON.stringify(errorData)}`)
    }

    const result = await resendResponse.json()
    console.log('✅ Email sent successfully via Resend:', {
      messageId: result.id,
      recipients: recipients.length,
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'メールを送信しました',
        messageId: result.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error sending email:', sanitizeErrorMessage(msg))

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
