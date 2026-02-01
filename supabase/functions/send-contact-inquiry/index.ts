/**
 * お問い合わせメール送信用Edge Function
 * 認証なしで呼び出し可能（公開ページ用）
 * マルチテナント対応：組織ごとの問い合わせ先にメール送信
 * レート制限とバリデーションでスパム対策
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, maskEmail, maskName, sanitizeErrorMessage, checkRateLimit, getClientIP, rateLimitResponse, getServiceRoleKey } from '../_shared/security.ts'

interface ContactInquiryRequest {
  organizationId?: string
  organizationName?: string
  name: string
  email: string
  type: string
  subject?: string
  message: string
  // honeypot（人間は空、botは埋めがち）
  website?: string
}

// シンプルなメールバリデーション
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function escapeHtml(input: string): string {
  return (input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
      name, 
      email, 
      type, 
      subject, 
      message,
      website
    }: ContactInquiryRequest = await req.json()

    // 🔒 スパム対策: honeypot が埋まっている場合は成功扱いで終了（DB保存/送信しない）
    if (website && String(website).trim().length > 0) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const serviceRoleKey = getServiceRoleKey()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')

    // 🔒 レート制限（公開フォーム対策: 1分あたり10件）
    if (serviceRoleKey && supabaseUrl) {
      const serviceClient = createClient(supabaseUrl, serviceRoleKey)
      const clientIP = getClientIP(req)
      const rateLimit = await checkRateLimit(serviceClient, clientIP, 'send-contact-inquiry', 10, 60)
      if (!rateLimit.allowed) {
        console.warn('⚠️ レートリミット超過:', clientIP)
        return rateLimitResponse(rateLimit.retryAfter, corsHeaders)
      }
    }

    // 送信先の決定
    // ❌ リクエストから宛先(contactEmail)を受け取らない（メール中継/悪用防止）
    // organizationId が指定されている場合は organizations.contact_email を参照し、無ければデフォルトへフォールバック
    const DEFAULT_CONTACT_EMAIL = Deno.env.get('DEFAULT_CONTACT_EMAIL') || 'info@mmq-yoyaq.jp'
    let toEmail = DEFAULT_CONTACT_EMAIL
    let storedContactEmail: string | null = null

    if (organizationId && serviceRoleKey && supabaseUrl) {
      const serviceClient = createClient(supabaseUrl, serviceRoleKey)
      const { data: org } = await serviceClient
        .from('organizations')
        .select('contact_email')
        .eq('id', organizationId)
        .maybeSingle()

      if (org?.contact_email) {
        toEmail = org.contact_email
        storedContactEmail = org.contact_email
      }
    }
    
    // バリデーション - 送信先がない場合のみエラー
    if (!toEmail) {
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
    // 他のFunctionと統一：Resendで認証済みのmmq.gameドメインを使用
    const fromEmail = 'noreply@mmq.game'

    const requestUserAgent = req.headers.get('user-agent')
    let inquiryId: string | null = null

    if (serviceRoleKey && supabaseUrl) {
      const serviceClient = createClient(supabaseUrl, serviceRoleKey)
      const { data: inquiryData, error: inquiryError } = await serviceClient
        .from('contact_inquiries')
        .insert({
          organization_id: organizationId || null,
          organization_name: organizationName || null,
          contact_email: storedContactEmail,
          name,
          email,
          inquiry_type: type,
          subject: subject || null,
          message,
          source: organizationId ? 'organization' : 'platform',
          origin,
          user_agent: requestUserAgent || null,
        })
        .select('id')
        .single()

      if (inquiryError) {
        console.error('Failed to store contact inquiry:', inquiryError)
      } else {
        inquiryId = inquiryData?.id || null
      }
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

    const safeName = escapeHtml(name)
    const safeEmail = escapeHtml(email)
    const safeSubject = subject ? escapeHtml(subject) : ''
    const safeMessage = escapeHtml(message)

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
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${safeName}</td>
        </tr>
        <tr>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">メールアドレス</th>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
        </tr>
        <tr>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">種別</th>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${typeLabel}</td>
        </tr>
        ${subject ? `
        <tr>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">件名</th>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${safeSubject}</td>
        </tr>
        ` : ''}
        <tr>
          <th style="text-align: left; padding: 8px; vertical-align: top;">内容</th>
          <td style="padding: 8px; white-space: pre-wrap;">${safeMessage}</td>
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
        from: `MMQ予約システム <${fromEmail}>`,
        to: [toEmail],
        reply_to: email,
        subject: `【お問い合わせ】${typeLabel}${subject ? `: ${subject}` : ''}`,
        html: emailHtml,
        text: emailText,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error:', errorData)

      if (inquiryId && serviceRoleKey && supabaseUrl) {
        const serviceClient = createClient(supabaseUrl, serviceRoleKey)
        await serviceClient
          .from('contact_inquiries')
          .update({
            email_sent: false,
            email_error: JSON.stringify(errorData),
          })
          .eq('id', inquiryId)
      }

      throw new Error('メール送信に失敗しました')
    }

    const result = await resendResponse.json()
    console.log('✅ Contact inquiry sent to organization:', {
      messageId: result.id,
      from: maskEmail(email),
    })

    // ユーザー本人への確認メール送信
    const confirmationHtml = `
      <h2>お問い合わせを受け付けました</h2>
      <p>
        ${safeName} 様<br />
        この度は${orgName}へお問い合わせいただき、ありがとうございます。
      </p>
      <p>
        以下の内容でお問い合わせを受け付けました。<br />
        <strong>3営業日以内を目安</strong>にご返信いたしますので、しばらくお待ちください。
      </p>
      
      <div style="background-color: #f5f5f5; padding: 16px; margin: 20px 0; border-left: 4px solid #6366f1;">
        ${inquiryId ? `<p style="margin: 0 0 8px 0; font-size: 13px; color: #666;">お問い合わせ番号: <strong style="color: #333;">${inquiryId.substring(0, 8).toUpperCase()}</strong></p>` : ''}
        <p style="margin: 0 0 4px 0; font-size: 13px; color: #666;">種別: ${typeLabel}</p>
        ${subject ? `<p style="margin: 0 0 4px 0; font-size: 13px; color: #666;">件名: ${safeSubject}</p>` : ''}
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #666;">送信日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
        <p style="margin: 8px 0 0 0; font-size: 13px; color: #666;">お問い合わせ内容:</p>
        <p style="margin: 4px 0 0 0; padding: 12px; background-color: white; border-radius: 4px; white-space: pre-wrap; font-size: 14px; color: #333;">${safeMessage}</p>
      </div>

      <div style="background-color: #fef3c7; padding: 12px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-size: 13px; color: #92400e;">
          <strong>📧 迷惑メールフォルダをご確認ください</strong><br />
          返信メールが迷惑メールフォルダに振り分けられる場合があります。<br />
          ご返信が届かない場合は、迷惑メールフォルダもご確認ください。
        </p>
      </div>

      <p style="margin-top: 24px; font-size: 13px; color: #666;">
        ※このメールは送信専用です。このメールへの返信はできませんのでご了承ください。<br />
        ※本メールに心当たりがない場合は、破棄していただいて構いません。
      </p>

      <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
      
      <p style="font-size: 12px; color: #999; margin: 0;">
        ${orgName}<br />
        MMQ予約システム
      </p>
    `

    const confirmationText = `
${name} 様

この度は${orgName}へお問い合わせいただき、ありがとうございます。

以下の内容でお問い合わせを受け付けました。
3営業日以内を目安にご返信いたしますので、しばらくお待ちください。

━━━━━━━━━━━━━━━━━━━━━━━━
${inquiryId ? `お問い合わせ番号: ${inquiryId.substring(0, 8).toUpperCase()}\n` : ''}種別: ${typeLabel}
${subject ? `件名: ${subject}\n` : ''}送信日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}

お問い合わせ内容:
${message}
━━━━━━━━━━━━━━━━━━━━━━━━

📧 迷惑メールフォルダをご確認ください
返信メールが迷惑メールフォルダに振り分けられる場合があります。
ご返信が届かない場合は、迷惑メールフォルダもご確認ください。

※このメールは送信専用です。このメールへの返信はできませんのでご了承ください。
※本メールに心当たりがない場合は、破棄していただいて構いません。

---
${orgName}
MMQ予約システム
    `

    // ユーザー本人へ確認メール送信
    const confirmationResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `MMQ予約システム <${fromEmail}>`,
        to: [email],
        subject: `【お問い合わせを受け付けました】${typeLabel}${subject ? `: ${subject}` : ''}`,
        html: confirmationHtml,
        text: confirmationText,
      }),
    })

    if (confirmationResponse.ok) {
      const confirmationResult = await confirmationResponse.json()
      console.log('✅ Confirmation email sent to user:', {
        messageId: confirmationResult.id,
        to: maskEmail(email),
      })
    } else {
      const confirmationError = await confirmationResponse.json()
      console.error('⚠️ Failed to send confirmation email:', confirmationError)
      // ユーザー確認メールの失敗は致命的ではないので、処理は継続
    }

    if (inquiryId && serviceRoleKey && supabaseUrl) {
      const serviceClient = createClient(supabaseUrl, serviceRoleKey)
      await serviceClient
        .from('contact_inquiries')
        .update({
          email_sent: true,
          email_error: null,
        })
        .eq('id', inquiryId)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'お問い合わせを送信しました',
      }),
      { status: 200, headers: corsHeaders }
    )

  } catch (error: unknown) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: sanitizeErrorMessage(error, 'お問い合わせの送信に失敗しました'),
      }),
      { status: 500, headers: corsHeaders }
    )
  }
})

