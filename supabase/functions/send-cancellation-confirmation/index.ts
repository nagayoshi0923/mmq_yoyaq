// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings, getStoreEmailSettings, replaceTemplateVariables } from '../_shared/organization-settings.ts'
import { getAnonKey, getServiceRoleKey, getCorsHeaders, maskEmail, maskName, verifyAuth, errorResponse, sanitizeErrorMessage } from '../_shared/security.ts'

interface CancellationRequest {
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
  participantCount: number
  totalPrice: number
  reservationNumber: string
  cancellationReason?: string
  cancelledBy: 'customer' | 'store' // 顧客都合 or 店舗都合
  cancellationFee?: number
  customEmailBody?: string  // カスタムメール本文（指定された場合はこれを使用）
  organizationName?: string // 組織名（件名・署名に使用）
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
    const cancellationData: CancellationRequest = await req.json()

    // 予約の正当性を検証
    const { data: reservation, error: reservationError } = await supabaseClient
      .from('reservations')
      .select('id, customer_email, organization_id')
      .eq('id', cancellationData.reservationId)
      .single()

    if (reservationError || !reservation) {
      return errorResponse('予約が見つかりません', 404, corsHeaders)
    }

    // スタッフ予約の場合、customer_emailがnullでも送信可能
    // customer_emailがある場合は一致チェックを行う
    if (reservation.customer_email && reservation.customer_email !== cancellationData.customerEmail) {
      return errorResponse('メールアドレスが一致しません', 403, corsHeaders)
    }
    
    // 送信先メールアドレスがない場合はエラー
    if (!cancellationData.customerEmail) {
      return errorResponse('送信先メールアドレスが指定されていません', 400, corsHeaders)
    }

    if (cancellationData.organizationId && reservation.organization_id && cancellationData.organizationId !== reservation.organization_id) {
      return errorResponse('組織が一致しません', 403, corsHeaders)
    }

    // 組織設定からメール設定を取得
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )
    
    const resolvedOrganizationId = cancellationData.organizationId || reservation.organization_id
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
      storeId: cancellationData.storeId,
      organizationId: resolvedOrganizationId,
      reservationId: cancellationData.reservationId
    })
    
    // 会社情報（デフォルト値付き）
    const companyName = storeEmailSettings?.company_name || cancellationData.organizationName || senderName
    const companyEmail = storeEmailSettings?.company_email || replyToEmail || ''
    const companyPhone = storeEmailSettings?.company_phone || ''
    
    // カスタムテンプレートの取得（店舗都合中止の場合は別テンプレート）
    const isStoreCancellation = cancellationData.cancelledBy === 'store'
    const customTemplate = isStoreCancellation 
      ? storeEmailSettings?.event_cancellation_template 
      : storeEmailSettings?.cancellation_template

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
    <p style="margin: 5px 0; font-weight: bold;">${companyName}</p>
    ${companyPhone ? `<p style="margin: 5px 0;">TEL: ${companyPhone}</p>` : ''}
    ${companyEmail ? `<p style="margin: 5px 0;">Email: ${companyEmail}</p>` : ''}
    <p style="margin: 10px 0 5px 0; font-size: 11px;">このメールは自動送信されています</p>
    <p style="margin: 5px 0; font-size: 11px;">ご不明な点がございましたら、お気軽にお問い合わせください</p>
  </div>
</body>
</html>
    `

    // カスタム本文が指定されていればそれを使用、なければ自動生成
    const emailText = cancellationData.customEmailBody || `
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

${companyName}
${companyPhone ? `TEL: ${companyPhone}` : ''}
${companyEmail ? `Email: ${companyEmail}` : ''}
このメールは自動送信されています
ご不明な点がございましたら、お気軽にお問い合わせください
    `

    // テンプレートの変数置換用関数（基本変数セット対応）
    const applyTemplate = (template: string) => {
      return template
        // 顧客情報
        .replace(/{customer_name}/g, cancellationData.customerName || 'お客様')
        .replace(/{customer_email}/g, cancellationData.customerEmail || '')
        // 予約情報
        .replace(/{reservation_number}/g, cancellationData.reservationNumber || '')
        .replace(/{scenario_title}/g, cancellationData.scenarioTitle || '')
        .replace(/{date}/g, formatDate(cancellationData.eventDate))
        .replace(/{time}/g, formatTime(cancellationData.startTime))
        .replace(/{end_time}/g, cancellationData.endTime ? formatTime(cancellationData.endTime) : '')
        .replace(/{venue}/g, cancellationData.storeName || '')
        .replace(/{participants}/g, String(cancellationData.participantCount || ''))
        .replace(/{participant_count}/g, String(cancellationData.participantCount || ''))
        .replace(/{total_price}/g, (cancellationData.totalPrice || 0).toLocaleString())
        // キャンセル関連
        .replace(/{cancellation_fee}/g, (cancellationData.cancellationFee || 0).toLocaleString())
        .replace(/{cancellation_reason}/g, cancellationData.cancellationReason || '')
        // 会社情報
        .replace(/{company_name}/g, companyName)
        .replace(/{company_phone}/g, companyPhone || '')
        .replace(/{company_email}/g, companyEmail || '')
    }

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

    // 最終的なHTMLとテキストを決定
    let finalHtml: string
    let finalText: string

    if (cancellationData.customEmailBody) {
      // API呼び出し時にカスタム本文が指定されている場合（最優先）
      finalHtml = templateToHtml(cancellationData.customEmailBody)
      finalText = cancellationData.customEmailBody
    } else if (customTemplate && customTemplate.trim()) {
      // email_settingsにテンプレートが設定されている場合
      const appliedTemplate = applyTemplate(customTemplate)
      finalHtml = templateToHtml(appliedTemplate)
      finalText = appliedTemplate
      console.log('📧 Using custom cancellation template from email_settings')
    } else {
      // デフォルトのハードコードテンプレートを使用
      finalHtml = emailHtml
      finalText = emailText
    }

    // Resend APIを使ってメール送信
    const emailPayload: Record<string, unknown> = {
      from: `${companyName} <${senderEmail}>`,
      to: [cancellationData.customerEmail],
      subject: isStoreCancellation 
        ? `【公演中止】${cancellationData.scenarioTitle} - ${formatDate(cancellationData.eventDate)}${companyName ? ` | ${companyName}` : ''}`
        : `【予約キャンセル】${cancellationData.scenarioTitle} - ${formatDate(cancellationData.eventDate)}${companyName ? ` | ${companyName}` : ''}`,
      html: finalHtml,
      text: finalText,
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

