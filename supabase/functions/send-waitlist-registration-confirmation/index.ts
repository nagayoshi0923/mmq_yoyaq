/**
 * キャンセル待ち登録完了メール送信 Edge Function
 * 
 * キャンセル待ちに登録した際に、登録完了の確認メールを送信する。
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings, getEmailTemplates, getStoreEmailSettings } from '../_shared/organization-settings.ts'
import { getCorsHeaders, errorResponse, sanitizeErrorMessage, getServiceRoleKey } from '../_shared/security.ts'

interface WaitlistRegistrationRequest {
  organizationId: string
  storeId?: string
  customerName: string
  customerEmail: string
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  participantCount: number
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const data: WaitlistRegistrationRequest = await req.json()

    console.log('📧 Sending waitlist registration confirmation:', {
      customerEmail: data.customerEmail?.substring(0, 3) + '***',
      scenarioTitle: data.scenarioTitle,
      eventDate: data.eventDate,
    })

    // Supabase クライアント作成
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    // メール設定を取得
    const emailSettings = data.organizationId 
      ? await getEmailSettings(serviceClient, data.organizationId)
      : null
    
    const resendApiKey = emailSettings?.resendApiKey || Deno.env.get('RESEND_API_KEY')
    const senderEmail = emailSettings?.senderEmail || Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
    const senderName = emailSettings?.senderName || Deno.env.get('SENDER_NAME') || 'MMQ予約システム'
    const replyToEmail = emailSettings?.replyToEmail || null

    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }

    // 店舗のメール設定（テンプレート・会社情報）を取得
    const storeEmailSettings = await getStoreEmailSettings(serviceClient, {
      storeId: data.storeId,
      organizationId: data.organizationId
    })
    
    // 会社情報（デフォルト値付き）
    const companyName = storeEmailSettings?.company_name || senderName
    const companyEmail = storeEmailSettings?.company_email || replyToEmail || ''
    const companyPhone = storeEmailSettings?.company_phone || ''

    // メールテンプレート取得
    const emailTemplates = await getEmailTemplates(serviceClient, data.organizationId)

    // 日付フォーマット関数
    const formatDate = (dateStr: string): string => {
      const date = new Date(dateStr)
      const weekdays = ['日', '月', '火', '水', '木', '金', '土']
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
    }

    const formatTime = (timeStr: string): string => {
      return timeStr.slice(0, 5)
    }

    // HTMLメール
    const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>キャンセル待ち登録完了</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dbeafe; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #1e40af; margin-top: 0; font-size: 24px;">
      🔔 キャンセル待ち登録完了
    </h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${data.customerName} 様
    </p>
    <p style="font-size: 14px; color: #1e3a8a;">
      キャンセル待ちへのご登録ありがとうございます。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
      登録内容
    </h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${data.scenarioTitle}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(data.eventDate)}<br>
          ${formatTime(data.startTime)} - ${formatTime(data.endTime)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${data.storeName}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">ご希望人数</td>
        <td style="padding: 12px 0; color: #1f2937;">${data.participantCount}名</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #92400e; margin-top: 0; font-size: 16px;">📢 今後の流れ</h3>
    <p style="margin: 0; color: #92400e;">
      空きが出た場合、ご登録いただいたメールアドレスに<strong>空席のお知らせ</strong>をお送りします。<br>
      通知を受け取りましたら、お早めにご予約ください（先着順）。
    </p>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      ※ キャンセル待ちは、空きが出ることを保証するものではございません。<br>
      ※ 複数の公演にキャンセル待ちを登録することも可能です。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0; white-space: pre-line;">${companyName}${companyPhone ? `\nTEL: ${companyPhone}` : ''}${companyEmail ? `\nEmail: ${companyEmail}` : ''}</p>
    <p style="margin: 5px 0; white-space: pre-line;">${emailTemplates.signature}</p>
    <p style="margin: 10px 0; font-size: 11px;">${emailTemplates.footer}</p>
  </div>
</body>
</html>
    `

    // テキストメール
    const emailText = `
${data.customerName} 様

🔔 キャンセル待ち登録完了

キャンセル待ちへのご登録ありがとうございます。

━━━━━━━━━━━━━━━━━━━━
登録内容
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${data.scenarioTitle}
日時: ${formatDate(data.eventDate)} ${formatTime(data.startTime)} - ${formatTime(data.endTime)}
会場: ${data.storeName}
ご希望人数: ${data.participantCount}名

━━━━━━━━━━━━━━━━━━━━
📢 今後の流れ
━━━━━━━━━━━━━━━━━━━━

空きが出た場合、ご登録いただいたメールアドレスに「空席のお知らせ」をお送りします。
通知を受け取りましたら、お早めにご予約ください（先着順）。

※ キャンセル待ちは、空きが出ることを保証するものではございません。
※ 複数の公演にキャンセル待ちを登録することも可能です。

━━━━━━━━━━━━━━━━━━━━

${companyName}
${companyPhone ? `TEL: ${companyPhone}` : ''}
${companyEmail ? `Email: ${companyEmail}` : ''}

${emailTemplates.signature}

${emailTemplates.footer}
    `

    // Resend APIでメール送信
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${companyName} <${senderEmail}>`,
        to: [data.customerEmail],
        subject: `【キャンセル待ち登録完了】${data.scenarioTitle} - ${formatDate(data.eventDate)}`,
        html: emailHtml,
        text: emailText,
        reply_to: companyEmail || replyToEmail || undefined,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error:', errorData)
      throw new Error(`メール送信に失敗しました: ${JSON.stringify(errorData)}`)
    }

    const result = await resendResponse.json()
    console.log('✅ Waitlist registration email sent:', result.id)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'キャンセル待ち登録完了メールを送信しました',
        emailId: result.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: sanitizeErrorMessage(error, 'キャンセル待ち登録完了メールの送信に失敗しました')
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
