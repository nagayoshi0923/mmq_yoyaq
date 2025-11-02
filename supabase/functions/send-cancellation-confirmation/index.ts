import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CancellationRequest {
  reservationId: string
  customerEmail: string
  customerName: string
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  participantCount: number
  totalPrice: number
  reservationNumber: string
  cancellationReason?: string
  cancelledBy: 'customer' | 'store' // 顧客都合 or 店舗都合
  cancellationFee?: number
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
    const cancellationData: CancellationRequest = await req.json()

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

    const isStoreCancellation = cancellationData.cancelledBy === 'store'
    const hasCancellationFee = cancellationData.cancellationFee && cancellationData.cancellationFee > 0

    // メール本文を作成（顧客都合 or 店舗都合で分ける）
    const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>予約キャンセル確認</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${isStoreCancellation ? '#fee2e2' : '#f8f9fa'}; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: ${isStoreCancellation ? '#dc2626' : '#6b7280'}; margin-top: 0; font-size: 24px;">
      ${isStoreCancellation ? '公演中止のお知らせ' : '予約キャンセル確認'}
    </h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${cancellationData.customerName} 様
    </p>
    <p style="font-size: 14px; color: #666;">
      ${isStoreCancellation 
        ? '誠に申し訳ございませんが、以下の公演を中止させていただくこととなりました。'
        : 'ご予約のキャンセルを承りました。以下の内容をご確認ください。'}
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #6b7280; padding-bottom: 10px;">
      ${isStoreCancellation ? '中止された公演' : 'キャンセルされた予約'}
    </h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">予約番号</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${cancellationData.reservationNumber}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${cancellationData.scenarioTitle}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(cancellationData.eventDate)}<br>
          ${formatTime(cancellationData.startTime)} - ${formatTime(cancellationData.endTime)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${cancellationData.storeName}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">参加人数</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${cancellationData.participantCount}名</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; ${hasCancellationFee ? 'border-bottom: 1px solid #f3f4f6;' : ''} font-weight: bold; color: #6b7280;">予約金額</td>
        <td style="padding: 12px 0; ${hasCancellationFee ? 'border-bottom: 1px solid #f3f4f6;' : ''} color: #6b7280;">¥${cancellationData.totalPrice.toLocaleString()}</td>
      </tr>
      ${hasCancellationFee ? `
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #dc2626;">キャンセル料</td>
        <td style="padding: 12px 0; color: #dc2626; font-size: 18px; font-weight: bold;">¥${cancellationData.cancellationFee!.toLocaleString()}</td>
      </tr>
      ` : ''}
    </table>
  </div>

  ${cancellationData.cancellationReason ? `
  <div style="background-color: #f3f4f6; border-left: 4px solid #6b7280; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #374151; margin-top: 0; font-size: 16px;">${isStoreCancellation ? '中止理由' : 'キャンセル理由'}</h3>
    <p style="margin: 0; color: #4b5563; white-space: pre-line;">${cancellationData.cancellationReason}</p>
  </div>
  ` : ''}

  ${isStoreCancellation ? `
  <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #991b1b; margin-top: 0; font-size: 16px;">お詫び</h3>
    <p style="margin: 0; color: #991b1b;">
      この度は、ご予約いただいていたにもかかわらず、公演を中止せざるを得なくなり、誠に申し訳ございません。<br>
      お支払いいただいた料金は全額返金させていただきます。<br>
      またのご利用を心よりお待ちしております。
    </p>
  </div>
  ` : ''}

  ${!isStoreCancellation && !hasCancellationFee ? `
  <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #065f46; margin-top: 0; font-size: 16px;">キャンセル料</h3>
    <p style="margin: 0; color: #065f46;">
      期限内にキャンセルいただいたため、キャンセル料は発生いたしません。
    </p>
  </div>
  ` : ''}

  ${hasCancellationFee ? `
  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #92400e; margin-top: 0; font-size: 16px;">キャンセル料のお支払いについて</h3>
    <p style="margin: 0; color: #92400e;">
      キャンセル料のお支払い方法につきましては、別途ご連絡させていただきます。
    </p>
  </div>
  ` : ''}

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      ${isStoreCancellation 
        ? 'この度は大変ご迷惑をおかけし、誠に申し訳ございませんでした。<br>またのご利用を心よりお待ちしております。'
        : '別の日程でのご予約も承っております。<br>またのご利用をお待ちしております。'}
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">Murder Mystery Queue (MMQ)</p>
    <p style="margin: 5px 0;">このメールは自動送信されています</p>
    <p style="margin: 5px 0;">ご不明な点がございましたら、お気軽にお問い合わせください</p>
  </div>
</body>
</html>
    `

    const emailText = `
${cancellationData.customerName} 様

${isStoreCancellation 
  ? '誠に申し訳ございませんが、以下の公演を中止させていただくこととなりました。'
  : 'ご予約のキャンセルを承りました。以下の内容をご確認ください。'}

━━━━━━━━━━━━━━━━━━━━
${isStoreCancellation ? '中止された公演' : 'キャンセルされた予約'}
━━━━━━━━━━━━━━━━━━━━

予約番号: ${cancellationData.reservationNumber}
シナリオ: ${cancellationData.scenarioTitle}
日時: ${formatDate(cancellationData.eventDate)} ${formatTime(cancellationData.startTime)} - ${formatTime(cancellationData.endTime)}
会場: ${cancellationData.storeName}
参加人数: ${cancellationData.participantCount}名
予約金額: ¥${cancellationData.totalPrice.toLocaleString()}
${hasCancellationFee ? `キャンセル料: ¥${cancellationData.cancellationFee!.toLocaleString()}` : ''}

${cancellationData.cancellationReason ? `━━━━━━━━━━━━━━━━━━━━
${isStoreCancellation ? '中止理由' : 'キャンセル理由'}
━━━━━━━━━━━━━━━━━━━━

${cancellationData.cancellationReason}

` : ''}${isStoreCancellation ? `━━━━━━━━━━━━━━━━━━━━
お詫び
━━━━━━━━━━━━━━━━━━━━

この度は、ご予約いただいていたにもかかわらず、公演を中止せざるを得なくなり、誠に申し訳ございません。
お支払いいただいた料金は全額返金させていただきます。
またのご利用を心よりお待ちしております。

` : ''}${!isStoreCancellation && !hasCancellationFee ? `━━━━━━━━━━━━━━━━━━━━
キャンセル料
━━━━━━━━━━━━━━━━━━━━

期限内にキャンセルいただいたため、キャンセル料は発生いたしません。

` : ''}${hasCancellationFee ? `━━━━━━━━━━━━━━━━━━━━
キャンセル料のお支払いについて
━━━━━━━━━━━━━━━━━━━━

キャンセル料のお支払い方法につきましては、別途ご連絡させていただきます。

` : ''}━━━━━━━━━━━━━━━━━━━━

${isStoreCancellation 
  ? 'この度は大変ご迷惑をおかけし、誠に申し訳ございませんでした。\nまたのご利用を心よりお待ちしております。'
  : '別の日程でのご予約も承っております。\nまたのご利用をお待ちしております。'}

Murder Mystery Queue (MMQ)
このメールは自動送信されています
ご不明な点がございましたら、お気軽にお問い合わせください
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
        to: [cancellationData.customerEmail],
        subject: isStoreCancellation 
          ? `【公演中止】${cancellationData.scenarioTitle} - ${formatDate(cancellationData.eventDate)}`
          : `【予約キャンセル】${cancellationData.scenarioTitle} - ${formatDate(cancellationData.eventDate)}`,
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
        message: 'キャンセル確認メールを送信しました',
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

