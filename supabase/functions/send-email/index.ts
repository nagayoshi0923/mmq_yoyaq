import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings } from '../_shared/organization-settings.ts'
import { getCorsHeaders, verifyAuth, errorResponse, maskEmail } from '../_shared/security.ts'

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
    // 🔒 認証チェック: admin または staff のみ許可
    const authResult = await verifyAuth(req, ['admin', 'staff'])
    if (!authResult.success) {
      console.warn('⚠️ 認証失敗: send-email への不正アクセス試行')
      return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
    }

    console.log('✅ 認証成功:', maskEmail(authResult.user?.email || ''))

    const { organizationId, to, subject, body }: EmailRequest = await req.json()

    // 組織設定からメール設定を取得
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    let resendApiKey = Deno.env.get('RESEND_API_KEY')
    let senderEmail = 'noreply@example.com'
    let senderName = 'MMQ予約システム'
    
    if (organizationId) {
      const emailSettings = await getEmailSettings(serviceClient, organizationId)
      if (emailSettings.resendApiKey) {
        resendApiKey = emailSettings.resendApiKey
        senderEmail = emailSettings.senderEmail
        senderName = emailSettings.senderName
      }
    }
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }

    // 送信先の配列化
    const recipients = Array.isArray(to) ? to : [to]

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
    console.error('Error sending email:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'メール送信に失敗しました',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
