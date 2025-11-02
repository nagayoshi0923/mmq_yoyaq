import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ReminderEmailRequest {
  reservationId: string
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
  daysBefore: number
  template?: string
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
    const reminderData: ReminderEmailRequest = await req.json()

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

    // メールテンプレートを取得またはデフォルトを使用
    let emailTemplate = reminderData.template
    if (!emailTemplate) {
      // デフォルトテンプレートを生成
      const dayMessage = getDayMessage(reminderData.daysBefore)
      emailTemplate = getDefaultReminderTemplate(dayMessage)
    }

    // テンプレートの変数を置換
    const emailHtml = emailTemplate
      .replace(/{customer_name}/g, reminderData.customerName)
      .replace(/{scenario_title}/g, reminderData.scenarioTitle)
      .replace(/{date}/g, formatDate(reminderData.eventDate))
      .replace(/{time}/g, formatTime(reminderData.startTime))
      .replace(/{venue}/g, reminderData.storeName)

    const emailText = emailHtml.replace(/<[^>]*>/g, '').replace(/\n\s*\n/g, '\n\n')

    // Resend APIを使ってメール送信
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MMQ予約システム <noreply@mmq.game>',
        to: [reminderData.customerEmail],
        subject: `【リマインド】${reminderData.scenarioTitle} - ${formatDate(reminderData.eventDate)}`,
        html: emailHtml,
        text: emailText,
      }),
    })

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text()
      console.error('Resend API error:', errorText)
      throw new Error(`メール送信に失敗しました: ${errorText}`)
    }

    const result = await resendResponse.json()
    console.log('リマインドメール送信成功:', result)

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.id,
        message: 'リマインドメールを送信しました' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('リマインドメール送信エラー:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

// 日数に応じたメッセージを生成
function getDayMessage(daysBefore: number): string {
  if (daysBefore === 1) {
    return '明日の公演についてリマインドいたします。'
  } else if (daysBefore === 2) {
    return '明後日の公演についてリマインドいたします。'
  } else if (daysBefore === 3) {
    return '3日後の公演についてリマインドいたします。'
  } else if (daysBefore === 7) {
    return '1週間後の公演についてリマインドいたします。'
  } else if (daysBefore === 14) {
    return '2週間後の公演についてリマインドいたします。'
  } else if (daysBefore === 30) {
    return '1ヶ月後の公演についてリマインドいたします。'
  } else {
    return `${daysBefore}日後の公演についてリマインドいたします。`
  }
}

// デフォルトリマインドテンプレート
function getDefaultReminderTemplate(dayMessage: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>リマインド</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #2563eb; margin-top: 0; font-size: 24px;">公演リマインド</h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      {customer_name} 様<br><br>
      ${dayMessage}
    </p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
    <h2 style="color: #374151; margin-top: 0; font-size: 18px;">ご予約内容</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; width: 120px;">シナリオ名:</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">{scenario_title}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold;">開催日時:</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">{date} {time}開演</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold;">会場:</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">{venue}</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #92400e; margin-top: 0; font-size: 16px;">当日のお願い</h3>
    <ul style="margin: 0; padding-left: 20px; color: #92400e;">
      <li style="margin-bottom: 8px;">開演15分前までにお越しください</li>
      <li style="margin-bottom: 8px;">お時間に余裕を持ってご来店ください</li>
      <li style="margin-bottom: 8px;">・当日連絡先: 03-XXXX-XXXX</li>
    </ul>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      お気をつけてお越しください。<br>
      スタッフ一同、お待ちしております。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">クイーンズワルツ</p>
    <p style="margin: 5px 0;">TEL: 03-XXXX-XXXX</p>
    <p style="margin: 5px 0;">Email: info@queens-waltz.jp</p>
  </div>
</body>
</html>`
}
