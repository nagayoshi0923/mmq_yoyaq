import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings } from '../_shared/organization-settings.ts'
import { getCorsHeaders, maskEmail, maskName } from '../_shared/security.ts'

interface PrivateBookingConfirmationRequest {
  reservationId: string
  organizationId?: string  // マルチテナント対応
  customerEmail: string
  customerName: string
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  storeAddress?: string
  participantCount: number
  totalPrice: number
  reservationNumber: string
  gmName?: string
  notes?: string
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORSプリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // リクエストボディを取得
    const bookingData: PrivateBookingConfirmationRequest = await req.json()

    // 組織設定からメール設定を取得
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    let resendApiKey = Deno.env.get('RESEND_API_KEY')
    let senderEmail = 'noreply@example.com'
    let senderName = 'MMQ予約システム'
    
    if (bookingData.organizationId) {
      const emailSettings = await getEmailSettings(serviceClient, bookingData.organizationId)
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

    // 日付フォーマット関数
    const formatDate = (dateStr: string): string => {
      const date = new Date(dateStr)
      const weekdays = ['日', '月', '火', '水', '木', '金', '土']
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
    }

    const formatTime = (timeStr: string): string => {
      return timeStr.slice(0, 5)
    }

    // メール本文を作成
    const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>貸切予約確定</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dcfce7; border-radius: 8px; padding: 30px; margin-bottom: 20px; border: 2px solid #10b981;">
    <h1 style="color: #065f46; margin-top: 0; font-size: 24px;">貸切予約が確定しました</h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${bookingData.customerName} 様
    </p>
    <p style="font-size: 14px; color: #065f46;">
      貸切リクエストを承りました。以下の日程で予約が確定いたしましたので、ご確認ください。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #10b981; padding-bottom: 10px;">確定内容</h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">予約番号</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${bookingData.reservationNumber}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${bookingData.scenarioTitle}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(bookingData.eventDate)}<br>
          ${formatTime(bookingData.startTime)} - ${formatTime(bookingData.endTime)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${bookingData.storeName}
          ${bookingData.storeAddress ? `<br><span style="font-size: 13px; color: #6b7280;">${bookingData.storeAddress}</span>` : ''}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">参加人数</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${bookingData.participantCount}名</td>
      </tr>
      ${bookingData.gmName ? `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">担当GM</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${bookingData.gmName}</td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">お支払い金額</td>
        <td style="padding: 12px 0; color: #10b981; font-size: 18px; font-weight: bold;">¥${bookingData.totalPrice.toLocaleString()}</td>
      </tr>
    </table>
  </div>

  ${bookingData.notes ? `
  <div style="background-color: #f3f4f6; border-left: 4px solid #6b7280; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #374151; margin-top: 0; font-size: 16px;">特記事項</h3>
    <p style="margin: 0; color: #4b5563; white-space: pre-line;">${bookingData.notes}</p>
  </div>
  ` : ''}

  <div style="background-color: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #1e40af; margin-top: 0; font-size: 16px;">貸切予約について</h3>
    <ul style="margin: 0; padding-left: 20px; color: #1e40af;">
      <li style="margin-bottom: 8px;">この公演は貸切となります</li>
      <li style="margin-bottom: 8px;">参加者の人数変更がある場合は、事前にご連絡ください</li>
      <li style="margin-bottom: 8px;">公演内容について詳細を確認したい場合は、お気軽にお問い合わせください</li>
    </ul>
  </div>

  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #92400e; margin-top: 0; font-size: 16px;">重要事項</h3>
    <ul style="margin: 0; padding-left: 20px; color: #92400e;">
      <li style="margin-bottom: 8px;">当日は開始時刻の<strong>15分前</strong>までにご来場ください</li>
      <li style="margin-bottom: 8px;">お支払いは<strong>現地決済</strong>となります（現金・カード可）</li>
      <li style="margin-bottom: 8px;">キャンセルは公演開始の<strong>48時間前</strong>まで無料です</li>
      <li style="margin-bottom: 8px;">遅刻された場合、ご入場いただけない可能性があります</li>
    </ul>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      貸切予約を承り、誠にありがとうございます。<br>
      当日のご来店を心よりお待ちしております。<br>
      <br>
      ご不明な点がございましたら、お気軽にお問い合わせください。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">Murder Mystery Queue (MMQ)</p>
    <p style="margin: 5px 0;">このメールは貸切予約確定時に自動送信されています</p>
  </div>
</body>
</html>
    `

    const emailText = `
${bookingData.customerName} 様

貸切リクエストを承りました。
以下の日程で予約が確定いたしましたので、ご確認ください。

━━━━━━━━━━━━━━━━━━━━
確定内容
━━━━━━━━━━━━━━━━━━━━

予約番号: ${bookingData.reservationNumber}
シナリオ: ${bookingData.scenarioTitle}
日時: ${formatDate(bookingData.eventDate)} ${formatTime(bookingData.startTime)} - ${formatTime(bookingData.endTime)}
会場: ${bookingData.storeName}${bookingData.storeAddress ? '\n' + bookingData.storeAddress : ''}
参加人数: ${bookingData.participantCount}名${bookingData.gmName ? '\n担当GM: ' + bookingData.gmName : ''}
お支払い金額: ¥${bookingData.totalPrice.toLocaleString()}

${bookingData.notes ? `━━━━━━━━━━━━━━━━━━━━
特記事項
━━━━━━━━━━━━━━━━━━━━

${bookingData.notes}

` : ''}━━━━━━━━━━━━━━━━━━━━
貸切予約について
━━━━━━━━━━━━━━━━━━━━

• この公演は貸切となります
• 参加者の人数変更がある場合は、事前にご連絡ください
• 公演内容について詳細を確認したい場合は、お気軽にお問い合わせください

━━━━━━━━━━━━━━━━━━━━
重要事項
━━━━━━━━━━━━━━━━━━━━

• 当日は開始時刻の15分前までにご来場ください
• お支払いは現地決済となります（現金・カード可）
• キャンセルは公演開始の48時間前まで無料です
• 遅刻された場合、ご入場いただけない可能性があります

━━━━━━━━━━━━━━━━━━━━

貸切予約を承り、誠にありがとうございます。
当日のご来店を心よりお待ちしております。

ご不明な点がございましたら、お気軽にお問い合わせください。

Murder Mystery Queue (MMQ)
このメールは貸切予約確定時に自動送信されています
    `

    // Resend APIを使ってメール送信
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MMQ予約システム <noreply@mmq.game>',
        to: [bookingData.customerEmail],
        subject: `【貸切予約確定】${bookingData.scenarioTitle} - ${formatDate(bookingData.eventDate)}`,
        html: emailHtml,
        text: emailText,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error:', errorData)
      throw new Error(`メール送信に失敗しました: ${JSON.stringify(errorData)}`)
    }

    const result = await resendResponse.json()
    console.log('Email sent successfully:', result)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: '貸切予約確定メールを送信しました',
        emailId: result.id 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'メール送信に失敗しました' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

