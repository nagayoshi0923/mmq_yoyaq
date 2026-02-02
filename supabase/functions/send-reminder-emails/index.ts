import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings } from '../_shared/organization-settings.ts'
import { getAnonKey, getServiceRoleKey, getCorsHeaders, maskEmail, maskName, verifyAuth, errorResponse, sanitizeErrorMessage } from '../_shared/security.ts'

interface ReminderEmailRequest {
  organizationId?: string  // マルチテナント対応
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
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORSプリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 P0-4修正: 認証チェック追加（管理者またはスタッフのみ許可）
    const authResult = await verifyAuth(req, ['admin', 'staff', 'owner', 'license_admin'])
    if (!authResult.success) {
      return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getAnonKey(),
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // リクエストボディを取得
    const reminderData: ReminderEmailRequest = await req.json()

    // 🔒 予約の正当性を検証
    const { data: reservation, error: reservationError } = await supabaseClient
      .from('reservations')
      .select('id, customer_email, organization_id')
      .eq('id', reminderData.reservationId)
      .single()

    if (reservationError || !reservation) {
      return errorResponse('予約が見つかりません', 404, corsHeaders)
    }

    if (!reservation.customer_email || reservation.customer_email !== reminderData.customerEmail) {
      return errorResponse('メールアドレスが一致しません', 403, corsHeaders)
    }

    if (reminderData.organizationId && reservation.organization_id && reminderData.organizationId !== reservation.organization_id) {
      return errorResponse('組織が一致しません', 403, corsHeaders)
    }

    // ログにはマスキングした情報のみ出力
    console.log('📧 Sending reminder email:', {
      reservationId: reminderData.reservationId,
      reservationNumber: reminderData.reservationNumber,
      customerEmail: maskEmail(reminderData.customerEmail),
      customerName: maskName(reminderData.customerName),
      daysBefore: reminderData.daysBefore,
    })

    // 組織設定からメール設定を取得
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )
    
    let resendApiKey = Deno.env.get('RESEND_API_KEY')
    let senderEmail = 'noreply@example.com'
    let senderName = 'MMQ予約システム'
    
    if (reminderData.organizationId) {
      const emailSettings = await getEmailSettings(serviceClient, reminderData.organizationId)
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

    // メールテンプレートを取得またはデフォルトを使用
    let emailTemplate = reminderData.template
    if (!emailTemplate) {
      // デフォルトテンプレートを生成
      const dayMessage = getDayMessage(reminderData.daysBefore)
      emailTemplate = getDefaultReminderTemplate(dayMessage)
    }

    // テンプレートの変数を置換
    const emailHtml = emailTemplate
      .replace(/{customer_name}/g, reminderData.customerName || 'お客様')
      .replace(/{scenario_title}/g, reminderData.scenarioTitle || '')
      .replace(/{date}/g, formatDate(reminderData.eventDate))
      .replace(/{time}/g, formatTime(reminderData.startTime))
      .replace(/{venue}/g, reminderData.storeName || '')
      .replace(/{reservation_number}/g, reminderData.reservationNumber || '')

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

// デフォルトリマインドテンプレート（シンプルで重要情報を最初に）
function getDefaultReminderTemplate(dayMessage: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>リマインド</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
  <p style="margin: 0 0 20px 0; font-size: 16px;">
    {customer_name} 様
  </p>

  <p style="margin: 0 0 30px 0; font-size: 15px;">
    ${dayMessage}
  </p>

  <div style="margin: 0 0 30px 0; padding: 0; border-top: 2px solid #e5e7eb; border-bottom: 2px solid #e5e7eb; padding: 20px 0;">
    <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold;">【予約内容】</p>
    
    <p style="margin: 0 0 10px 0; font-size: 15px;">
      <strong>シナリオ:</strong> {scenario_title}
    </p>
    
    <p style="margin: 0 0 10px 0; font-size: 15px;">
      <strong>日時:</strong> {date} {time}開演
    </p>
    
    <p style="margin: 0 0 10px 0; font-size: 15px;">
      <strong>会場:</strong> {venue}
    </p>
    
    <p style="margin: 0; font-size: 15px;">
      <strong>予約番号:</strong> {reservation_number}
    </p>
  </div>

  <div style="margin: 0 0 30px 0; padding: 15px; background-color: #f9fafb; border-left: 3px solid #6b7280;">
    <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">【当日のお願い】</p>
    <p style="margin: 0 0 8px 0; font-size: 14px;">・開演15分前までにご来場ください</p>
    <p style="margin: 0 0 8px 0; font-size: 14px;">・お時間に余裕を持ってご来店ください</p>
    <p style="margin: 0; font-size: 14px;">・当日連絡先: 03-XXXX-XXXX</p>
  </div>

  <p style="margin: 0 0 30px 0; font-size: 15px;">
    お気をつけてお越しください。<br>
    スタッフ一同、お待ちしております。
  </p>

  <div style="margin: 30px 0 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
    <p style="margin: 0;">クイーンズワルツ</p>
    <p style="margin: 5px 0 0 0;">TEL: 03-XXXX-XXXX | Email: info@queens-waltz.jp</p>
  </div>
</body>
</html>`
}
