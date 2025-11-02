import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BookingChangeRequest {
  reservationId: string
  customerEmail: string
  customerName: string
  scenarioTitle: string
  reservationNumber: string
  changes: {
    field: string
    label: string
    oldValue: string
    newValue: string
  }[]
  newEventDate?: string
  newStartTime?: string
  newEndTime?: string
  newStoreName?: string
  newParticipantCount?: number
  newTotalPrice?: number
  priceDifference?: number
}

serve(async (req) => {
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
    const changeData: BookingChangeRequest = await req.json()

    // Resend APIキーを取得
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    
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

    const hasPriceDifference = changeData.priceDifference && changeData.priceDifference !== 0

    // 変更内容のHTML表示
    const changesHtml = changeData.changes.map(change => `
      <tr>
        <td style="padding: 12px 10px; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%; background-color: #f9fafb;">${change.label}</td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #f3f4f6; color: #dc2626; text-decoration: line-through;">${change.oldValue}</td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #f3f4f6; color: #059669; font-weight: bold;">→ ${change.newValue}</td>
      </tr>
    `).join('')

    const changesText = changeData.changes.map(change => 
      `${change.label}: ${change.oldValue} → ${change.newValue}`
    ).join('\n')

    // メール本文を作成
    const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>予約内容変更確認</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dbeafe; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #1e40af; margin-top: 0; font-size: 24px;">予約内容が変更されました</h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${changeData.customerName} 様
    </p>
    <p style="font-size: 14px; color: #1e3a8a;">
      ご予約内容に変更がございましたので、ご確認ください。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">予約番号</h2>
    <p style="font-size: 16px; font-weight: bold; color: #2563eb; margin: 10px 0;">${changeData.reservationNumber}</p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">変更内容</h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      ${changesHtml}
    </table>
  </div>

  ${hasPriceDifference ? `
  <div style="background-color: ${changeData.priceDifference! > 0 ? '#fef3c7' : '#d1fae5'}; border-left: 4px solid ${changeData.priceDifference! > 0 ? '#f59e0b' : '#10b981'}; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: ${changeData.priceDifference! > 0 ? '#92400e' : '#065f46'}; margin-top: 0; font-size: 16px;">料金の差額</h3>
    <p style="margin: 0; color: ${changeData.priceDifference! > 0 ? '#92400e' : '#065f46'}; font-size: 18px; font-weight: bold;">
      ${changeData.priceDifference! > 0 ? '+' : ''}¥${changeData.priceDifference!.toLocaleString()}
    </p>
    <p style="margin: 10px 0 0 0; color: ${changeData.priceDifference! > 0 ? '#92400e' : '#065f46'}; font-size: 14px;">
      ${changeData.priceDifference! > 0 
        ? '差額は当日にお支払いください（現金・カード可）' 
        : '差額は返金またはクレジットにて対応させていただきます'}
    </p>
  </div>
  ` : ''}

  ${changeData.newEventDate ? `
  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #059669; padding-bottom: 10px;">変更後の予約内容</h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${changeData.scenarioTitle}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(changeData.newEventDate)}<br>
          ${formatTime(changeData.newStartTime || '')} - ${formatTime(changeData.newEndTime || '')}
        </td>
      </tr>
      ${changeData.newStoreName ? `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${changeData.newStoreName}</td>
      </tr>
      ` : ''}
      ${changeData.newParticipantCount ? `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">参加人数</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${changeData.newParticipantCount}名</td>
      </tr>
      ` : ''}
      ${changeData.newTotalPrice ? `
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">お支払い金額</td>
        <td style="padding: 12px 0; color: #2563eb; font-size: 18px; font-weight: bold;">¥${changeData.newTotalPrice.toLocaleString()}</td>
      </tr>
      ` : ''}
    </table>
  </div>
  ` : ''}

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      この変更に心当たりがない場合は、お手数ですがすぐにご連絡ください。<br>
      <br>
      ご不明な点がございましたら、お気軽にお問い合わせください。<br>
      当日のご来店を心よりお待ちしております。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">Murder Mystery Queue (MMQ)</p>
    <p style="margin: 5px 0;">このメールは予約変更時に自動送信されています</p>
  </div>
</body>
</html>
    `

    const emailText = `
${changeData.customerName} 様

ご予約内容に変更がございましたので、ご確認ください。

━━━━━━━━━━━━━━━━━━━━
予約番号
━━━━━━━━━━━━━━━━━━━━

${changeData.reservationNumber}

━━━━━━━━━━━━━━━━━━━━
変更内容
━━━━━━━━━━━━━━━━━━━━

${changesText}

${hasPriceDifference ? `━━━━━━━━━━━━━━━━━━━━
料金の差額
━━━━━━━━━━━━━━━━━━━━

${changeData.priceDifference! > 0 ? '+' : ''}¥${changeData.priceDifference!.toLocaleString()}

${changeData.priceDifference! > 0 
  ? '差額は当日にお支払いください（現金・カード可）' 
  : '差額は返金またはクレジットにて対応させていただきます'}

` : ''}${changeData.newEventDate ? `━━━━━━━━━━━━━━━━━━━━
変更後の予約内容
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${changeData.scenarioTitle}
日時: ${formatDate(changeData.newEventDate)} ${formatTime(changeData.newStartTime || '')} - ${formatTime(changeData.newEndTime || '')}${changeData.newStoreName ? `\n会場: ${changeData.newStoreName}` : ''}${changeData.newParticipantCount ? `\n参加人数: ${changeData.newParticipantCount}名` : ''}${changeData.newTotalPrice ? `\nお支払い金額: ¥${changeData.newTotalPrice.toLocaleString()}` : ''}

` : ''}━━━━━━━━━━━━━━━━━━━━

この変更に心当たりがない場合は、お手数ですがすぐにご連絡ください。

ご不明な点がございましたら、お気軽にお問い合わせください。
当日のご来店を心よりお待ちしております。

Murder Mystery Queue (MMQ)
このメールは予約変更時に自動送信されています
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
        to: [changeData.customerEmail],
        subject: `【予約内容変更】${changeData.scenarioTitle} - ${changeData.reservationNumber}`,
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
        message: '予約変更確認メールを送信しました',
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

