// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings, getStoreEmailSettings, replaceTemplateVariables } from '../_shared/organization-settings.ts'
import { getAnonKey, getServiceRoleKey, getCorsHeaders, maskEmail, maskName, sanitizeErrorMessage, verifyAuth, errorResponse } from '../_shared/security.ts'

interface PrivateBookingRequestConfirmationRequest {
  organizationId?: string  // マルチテナント対応
  reservationId: string
  customerEmail: string
  customerName: string
  scenarioTitle: string
  reservationNumber: string
  candidateDates: Array<{
    date: string
    timeSlot: string
    startTime: string
    endTime: string
  }>
  requestedStores: Array<{
    storeName: string
  }>
  participantCount: number
  estimatedPrice: number
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
    // 認証は緩和（予約IDとメールアドレスで正当性を検証するため）
    const authResult = await verifyAuth(req, undefined, { allowAnonymous: true })
    if (!authResult.success) {
      return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
    }

    // Service Role Key を使用（Publishable Key 対応）
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    // リクエストボディを取得
    const requestData: PrivateBookingRequestConfirmationRequest = await req.json()

    // 🔒 予約の正当性を検証（存在確認 + メールアドレス照合）
    const { data: reservation, error: reservationError } = await supabaseClient
      .from('reservations')
      .select('id, customer_email, organization_id')
      .eq('id', requestData.reservationId)
      .single()

    if (reservationError || !reservation) {
      return errorResponse('予約が見つかりません', 404, corsHeaders)
    }

    if (!reservation.customer_email || reservation.customer_email !== requestData.customerEmail) {
      return errorResponse('メールアドレスが一致しません', 403, corsHeaders)
    }

    if (requestData.organizationId && reservation.organization_id && requestData.organizationId !== reservation.organization_id) {
      return errorResponse('組織が一致しません', 403, corsHeaders)
    }

    // ログにはマスキングした情報のみ出力
    console.log('📧 Sending private booking request confirmation:', {
      reservationId: requestData.reservationId,
      reservationNumber: requestData.reservationNumber,
      customerEmail: maskEmail(requestData.customerEmail),
      customerName: maskName(requestData.customerName),
    })

    // 組織設定からメール設定を取得
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )
    
    const emailSettings = requestData.organizationId 
      ? await getEmailSettings(serviceClient, requestData.organizationId)
      : null
    
    const resendApiKey = emailSettings?.resendApiKey || Deno.env.get('RESEND_API_KEY')
    const senderEmail = emailSettings?.senderEmail || Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
    const senderName = emailSettings?.senderName || Deno.env.get('SENDER_NAME') || 'MMQ予約システム'
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }
    
    // カスタムテンプレート取得
    const storeEmailSettings = requestData.organizationId 
      ? await getStoreEmailSettings(serviceClient, { organizationId: requestData.organizationId })
      : null
    const customTemplate = storeEmailSettings?.private_request_template

    // 日付フォーマット関数
    const formatDate = (dateStr: string): string => {
      const date = new Date(dateStr)
      const weekdays = ['日', '月', '火', '水', '木', '金', '土']
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
    }

    const formatTime = (timeStr: string): string => {
      return timeStr.slice(0, 5)
    }

    // 候補日時のリスト
    const candidatesHtml = requestData.candidateDates.map((candidate, index) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: bold;">
          候補${index + 1}
        </td>
        <td style="padding: 8px; border: 1px solid #e5e7eb;">
          ${formatDate(candidate.date)}<br>
          ${candidate.timeSlot} ${formatTime(candidate.startTime)} - ${formatTime(candidate.endTime)}
        </td>
      </tr>
    `).join('')

    const candidatesText = requestData.candidateDates.map((candidate, index) => 
      `候補${index + 1}: ${formatDate(candidate.date)} ${candidate.timeSlot} ${formatTime(candidate.startTime)} - ${formatTime(candidate.endTime)}`
    ).join('\n')

    // 希望店舗のリスト
    const storesText = requestData.requestedStores.length > 0
      ? requestData.requestedStores.map(s => s.storeName).join('、')
      : '全ての店舗'

    // メール本文を作成
    const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>貸切予約リクエスト受付完了</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
  <p style="margin: 0 0 20px 0; font-size: 16px;">
    ${requestData.customerName} 様
  </p>

  <p style="margin: 0 0 30px 0; font-size: 15px;">
    この度は、貸切予約のリクエストをお申し込みいただき、誠にありがとうございます。<br>
    リクエストを受け付けましたので、ご確認ください。
  </p>

  <div style="margin: 0 0 30px 0; padding: 0; border-top: 2px solid #e5e7eb; border-bottom: 2px solid #e5e7eb; padding: 20px 0;">
    <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold;">【リクエスト内容】</p>
    
    <p style="margin: 0 0 10px 0; font-size: 15px;">
      <strong>予約番号:</strong> ${requestData.reservationNumber}
    </p>
    
    <p style="margin: 0 0 10px 0; font-size: 15px;">
      <strong>シナリオ:</strong> ${requestData.scenarioTitle}
    </p>
    
    <p style="margin: 0 0 10px 0; font-size: 15px;">
      <strong>参加人数:</strong> ${requestData.participantCount}名
    </p>
    
    <p style="margin: 0 0 10px 0; font-size: 15px;">
      <strong>希望店舗:</strong> ${storesText}
    </p>
    
    <p style="margin: 0 0 15px 0; font-size: 15px;">
      <strong>料金目安:</strong> ¥${requestData.estimatedPrice.toLocaleString()}
    </p>

    <p style="margin: 15px 0 10px 0; font-size: 15px; font-weight: bold;">候補日時:</p>
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
      ${candidatesHtml}
    </table>
  </div>

  ${requestData.notes ? `
  <div style="margin: 0 0 30px 0; padding: 15px; background-color: #f9fafb; border-left: 3px solid #6b7280;">
    <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">【ご要望・メモ】</p>
    <p style="margin: 0; font-size: 14px; white-space: pre-line;">${requestData.notes}</p>
  </div>
  ` : ''}

  <div style="margin: 0 0 30px 0; padding: 15px; background-color: #dbeafe; border-left: 3px solid #2563eb;">
    <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">【今後の流れ】</p>
    <p style="margin: 0 0 8px 0; font-size: 14px;">1. このリクエストを確認し、店舗とGMの調整を行います</p>
    <p style="margin: 0 0 8px 0; font-size: 14px;">2. 調整が完了次第、承認メールをお送りします</p>
    <p style="margin: 0; font-size: 14px;">3. 承認後、確定日時・店舗・料金をご連絡いたします</p>
  </div>

  <div style="margin: 0 0 30px 0; padding: 15px; background-color: #f9fafb; border-left: 3px solid #6b7280;">
    <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">【ご注意】</p>
    <p style="margin: 0 0 8px 0; font-size: 14px;">・料金は目安です。実際の料金は店舗との調整により変動する場合があります</p>
    <p style="margin: 0 0 8px 0; font-size: 14px;">・候補日時の中から、店舗の都合に合わせて1つを確定させていただきます</p>
    <p style="margin: 0; font-size: 14px;">・ご希望に沿えない場合もございます。その場合は別途ご連絡いたします</p>
  </div>

  <p style="margin: 0 0 30px 0; font-size: 15px;">
    担当者より折り返しご連絡させていただきます。<br>
    少々お時間をいただく場合がございますが、何卒よろしくお願いいたします。
  </p>

  <div style="margin: 30px 0 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
    <p style="margin: 0;">Murder Mystery Queue (MMQ)</p>
    <p style="margin: 5px 0 0 0;">このメールは貸切予約リクエスト受付時に自動送信されています</p>
    <p style="margin: 5px 0 0 0;">ご不明な点がございましたら、お気軽にお問い合わせください</p>
  </div>
</body>
</html>
    `

    const emailText = `
${requestData.customerName} 様

この度は、貸切予約のリクエストをお申し込みいただき、誠にありがとうございます。
リクエストを受け付けましたので、ご確認ください。

━━━━━━━━━━━━━━━━━━━━
リクエスト内容
━━━━━━━━━━━━━━━━━━━━

予約番号: ${requestData.reservationNumber}
シナリオ: ${requestData.scenarioTitle}
参加人数: ${requestData.participantCount}名
希望店舗: ${storesText}
料金目安: ¥${requestData.estimatedPrice.toLocaleString()}

候補日時:
${candidatesText}

${requestData.notes ? `━━━━━━━━━━━━━━━━━━━━
ご要望・メモ
━━━━━━━━━━━━━━━━━━━━

${requestData.notes}

` : ''}━━━━━━━━━━━━━━━━━━━━
今後の流れ
━━━━━━━━━━━━━━━━━━━━

1. このリクエストを確認し、店舗とGMの調整を行います
2. 調整が完了次第、承認メールをお送りします
3. 承認後、確定日時・店舗・料金をご連絡いたします

━━━━━━━━━━━━━━━━━━━━
ご注意
━━━━━━━━━━━━━━━━━━━━

・料金は目安です。実際の料金は店舗との調整により変動する場合があります
・候補日時の中から、店舗の都合に合わせて1つを確定させていただきます
・ご希望に沿えない場合もございます。その場合は別途ご連絡いたします

━━━━━━━━━━━━━━━━━━━━

担当者より折り返しご連絡させていただきます。
少々お時間をいただく場合がございますが、何卒よろしくお願いいたします。

Murder Mystery Queue (MMQ)
このメールは貸切予約リクエスト受付時に自動送信されています
ご不明な点がございましたら、お気軽にお問い合わせください
    `

    // カスタムテンプレート対応
    let finalHtml = emailHtml
    let finalText = emailText
    
    if (customTemplate && customTemplate.trim()) {
      // テンプレート変数
      const templateVariables = {
        customer_name: requestData.customerName,
        reservation_number: requestData.reservationNumber,
        scenario_title: requestData.scenarioTitle,
        participant_count: String(requestData.participantCount),
        estimated_price: requestData.estimatedPrice.toLocaleString(),
        stores: storesText,
        candidate_dates: candidatesText,
        notes: requestData.notes || '',
        company_name: senderName
      }
      
      const appliedTemplate = replaceTemplateVariables(customTemplate, templateVariables)
      
      // テキストをHTMLに変換
      const htmlContent = appliedTemplate
        .split('\n')
        .map(line => `<p style="margin: 0.5em 0;">${line || '&nbsp;'}</p>`)
        .join('\n')
      
      finalHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${htmlContent}
</body>
</html>`
      finalText = appliedTemplate
      console.log('📧 Using custom private_request_template')
    }

    // Resend APIを使ってメール送信
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [requestData.customerEmail],
        subject: `【貸切予約リクエスト受付】${requestData.scenarioTitle}`,
        html: finalHtml,
        text: finalText,
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
        message: '貸切予約リクエスト受付確認メールを送信しました',
        emailId: result.id 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error:', sanitizeErrorMessage(msg))
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: sanitizeErrorMessage(msg || 'メール送信に失敗しました') 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

