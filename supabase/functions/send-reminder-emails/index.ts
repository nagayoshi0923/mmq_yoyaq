import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings, getStoreEmailSettings } from '../_shared/organization-settings.ts'
import { getAnonKey, getServiceRoleKey, getCorsHeaders, maskEmail, maskName, verifyAuth, errorResponse, sanitizeErrorMessage, isCronOrServiceRoleCall } from '../_shared/security.ts'

interface ReminderEmailRequest {
  organizationId?: string  // マルチテナント対応
  storeId?: string  // 店舗ID（メール設定取得用）
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
    // 🔒 認証チェック（Service Role / cron / 管理者・スタッフ、または匿名許可）
    const isServiceCall = isCronOrServiceRoleCall(req)
    if (!isServiceCall) {
      const authResult = await verifyAuth(req, ['admin', 'staff', 'owner', 'license_admin'], { allowAnonymous: true })
      if (!authResult.success) {
        return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
      }
    }

    // Service Role Key を使用（Publishable Key 対応）
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
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
    
    const resolvedOrganizationId = reminderData.organizationId || reservation.organization_id
    const emailSettings = resolvedOrganizationId 
      ? await getEmailSettings(serviceClient, resolvedOrganizationId)
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
      storeId: reminderData.storeId,
      organizationId: resolvedOrganizationId,
      reservationId: reminderData.reservationId
    })
    
    // 会社情報（デフォルト値付き）
    const companyName = storeEmailSettings?.company_name || senderName
    const companyEmail = storeEmailSettings?.company_email || replyToEmail || ''
    const companyPhone = storeEmailSettings?.company_phone || ''
    
    // カスタムテンプレートの取得（email_settingsを優先）
    const customTemplate = storeEmailSettings?.reminder_template

    // 日付フォーマット関数（JST固定）
    const formatDate = (dateStr: string): string => {
      const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00+09:00`)
      const parts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'narrow',
      }).formatToParts(d)
      const year = parts.find(p => p.type === 'year')?.value ?? ''
      const month = parts.find(p => p.type === 'month')?.value ?? ''
      const day = parts.find(p => p.type === 'day')?.value ?? ''
      const wd = parts.find(p => p.type === 'weekday')?.value ?? ''
      return `${year}年${month}月${day}日(${wd})`
    }

    const formatTime = (timeStr: string): string => {
      return timeStr.slice(0, 5)
    }

    // メールテンプレートを取得（優先順位: email_settings > API引数 > デフォルト）
    let emailTemplate: string
    if (customTemplate && customTemplate.trim()) {
      emailTemplate = customTemplate
      console.log('📧 Using custom reminder template from email_settings')
    } else if (reminderData.template) {
      emailTemplate = reminderData.template
    } else {
      // デフォルトテンプレートを生成
      const dayMessage = getDayMessage(reminderData.daysBefore)
      emailTemplate = getDefaultReminderTemplate(dayMessage)
    }

    // テンプレートの変数を置換（基本変数セット対応）
    const appliedTemplate = emailTemplate
      // 顧客情報
      .replace(/{customer_name}/g, reminderData.customerName || 'お客様')
      .replace(/{customer_email}/g, reminderData.customerEmail || '')
      // 予約情報
      .replace(/{reservation_number}/g, reminderData.reservationNumber || '')
      .replace(/{scenario_title}/g, reminderData.scenarioTitle || '')
      .replace(/{date}/g, formatDate(reminderData.eventDate))
      .replace(/{time}/g, formatTime(reminderData.startTime))
      .replace(/{end_time}/g, reminderData.endTime ? formatTime(reminderData.endTime) : '')
      .replace(/{venue}/g, reminderData.storeName || '')
      .replace(/{venue_address}/g, reminderData.storeAddress || '')
      .replace(/{participants}/g, String(reminderData.participantCount || ''))
      .replace(/{participant_count}/g, String(reminderData.participantCount || ''))
      .replace(/{total_price}/g, (reminderData.totalPrice || 0).toLocaleString())
      // キャンセル関連
      .replace(/{cancellation_fee}/g, '')
      .replace(/{cancellation_reason}/g, '')
      // 会社情報
      .replace(/{company_name}/g, companyName)
      .replace(/{company_phone}/g, companyPhone || '')
      .replace(/{company_email}/g, companyEmail || '')

    // カスタムテンプレートをHTMLに変換
    const templateToHtml = (template: string) => {
      const htmlContent = template
        .split('\n')
        .map(line => `<p style="margin: 0.5em 0;">${line || '&nbsp;'}</p>`)
        .join('\n')
      
      return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
  <div style="padding: 20px 30px;">
    ${htmlContent}
  </div>
</body>
</html>`
    }

    const emailHtml = templateToHtml(appliedTemplate)
    const emailText = appliedTemplate

    // Resend APIを使ってメール送信
    const emailPayload: Record<string, unknown> = {
      from: `${companyName} <${senderEmail}>`,
      to: [reminderData.customerEmail],
      subject: `【リマインド】${reminderData.scenarioTitle} - ${formatDate(reminderData.eventDate)}${companyName ? ` | ${companyName}` : ''}`,
      html: emailHtml,
      text: emailText,
    }
    
    // 返信先メールアドレスが設定されている場合は追加
    if (companyEmail || replyToEmail) {
      emailPayload.reply_to = companyEmail || replyToEmail
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
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
