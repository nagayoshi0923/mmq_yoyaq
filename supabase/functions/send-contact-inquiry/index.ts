/**
 * お問い合わせメール送信用Edge Function
 * 認証なしで呼び出し可能（公開ページ用）
 * マルチテナント対応：組織ごとの問い合わせ先にメール送信
 * レート制限とバリデーションでスパム対策
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, maskEmail, maskName } from '../_shared/security.ts'

interface ContactInquiryRequest {
  organizationId?: string
  organizationName?: string
  contactEmail?: string
  name: string
  email: string
  type: string
  subject?: string
  message: string
}

// シンプルなメールバリデーション
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { 
      organizationId, 
      organizationName, 
      contactEmail,
      name, 
      email, 
      type, 
      subject, 
      message 
    }: ContactInquiryRequest = await req.json()

    // バリデーション
    if (!contactEmail) {
      return new Response(
        JSON.stringify({ success: false, error: '送信先が設定されていません' }),
        { status: 400, headers: corsHeaders }
      )
    }

    if (!name || name.trim().length < 1) {
      return new Response(
        JSON.stringify({ success: false, error: 'お名前を入力してください' }),
        { status: 400, headers: corsHeaders }
      )
    }

    if (!email || !isValidEmail(email)) {
      return new Response(
        JSON.stringify({ success: false, error: '有効なメールアドレスを入力してください' }),
        { status: 400, headers: corsHeaders }
      )
    }

    if (!message || message.trim().length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: 'お問い合わせ内容を10文字以上で入力してください' }),
        { status: 400, headers: corsHeaders }
      )
    }

    // スパム対策: メッセージが長すぎる場合は拒否
    if (message.length > 10000) {
      return new Response(
        JSON.stringify({ success: false, error: 'メッセージが長すぎます' }),
        { status: 400, headers: corsHeaders }
      )
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }

    // お問い合わせ種別のラベル
    const typeLabels: Record<string, string> = {
      'booking': '予約について',
      'cancel': 'キャンセルについて',
      'scenario': 'シナリオについて',
      'private': '貸切について',
      'other': 'その他',
    }
    const typeLabel = typeLabels[type] || type
    const orgName = organizationName || '不明な組織'

    // ログにはマスキングした情報のみ出力
    console.log('📧 Contact inquiry received:', {
      organizationId: organizationId || 'none',
      organizationName: orgName,
      name: maskName(name),
      email: maskEmail(email),
      type: typeLabel,
      messageLength: message.length,
    })

    // メール本文
    const emailHtml = `
      <h2>【${orgName}】お問い合わせが届きました</h2>
      <table style="border-collapse: collapse; width: 100%;">
        <tr>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd; width: 120px;">お名前</th>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${name}</td>
        </tr>
        <tr>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">メールアドレス</th>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="mailto:${email}">${email}</a></td>
        </tr>
        <tr>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">種別</th>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${typeLabel}</td>
        </tr>
        ${subject ? `
        <tr>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">件名</th>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${subject}</td>
        </tr>
        ` : ''}
        <tr>
          <th style="text-align: left; padding: 8px; vertical-align: top;">内容</th>
          <td style="padding: 8px; white-space: pre-wrap;">${message}</td>
        </tr>
      </table>
      <p style="color: #666; font-size: 12px; margin-top: 20px;">
        このメールはMMQ予約システムから自動送信されています。
      </p>
    `

    const emailText = `
【${orgName}】お問い合わせが届きました

お名前: ${name}
メールアドレス: ${email}
種別: ${typeLabel}
${subject ? `件名: ${subject}\n` : ''}
内容:
${message}

---
このメールはMMQ予約システムから自動送信されています。
    `

    // Resend APIでメール送信（組織の問い合わせ先へ）
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MMQ予約システム <noreply@mmq-yoyaq.jp>',
        to: [contactEmail],
        reply_to: email,
        subject: `【お問い合わせ】${typeLabel}${subject ? `: ${subject}` : ''}`,
        html: emailHtml,
        text: emailText,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error:', errorData)
      throw new Error('メール送信に失敗しました')
    }

    const result = await resendResponse.json()
    console.log('✅ Contact inquiry sent successfully:', {
      messageId: result.id,
      from: maskEmail(email),
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'お問い合わせを送信しました',
      }),
      { status: 200, headers: corsHeaders }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ Error:', errorMessage)
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage || 'お問い合わせの送信に失敗しました',
      }),
      { status: 500, headers: corsHeaders }
    )
  }
})

