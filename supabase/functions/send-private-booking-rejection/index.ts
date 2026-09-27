// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings, getStoreEmailSettings, replaceTemplateVariables } from '../_shared/organization-settings.ts'
import { getAnonKey, getServiceRoleKey, getCorsHeaders, maskEmail, maskName, verifyAuth, errorResponse, sanitizeErrorMessage } from '../_shared/security.ts'
import { insertEmailLog, updateEmailLog } from '../_shared/email-logs.ts'

interface PrivateBookingRejectionRequest {
  organizationId?: string  // マルチテナント対応
  reservationId: string
  customerEmail: string
  customerName: string
  scenarioTitle: string
  rejectionReason: string
  /** 却下ダイアログで全文編集された本文。指定時はテンプレ適用より優先し、そのまま送る */
  customEmailBody?: string
  candidateDates?: Array<{
    date: string
    startTime: string
    endTime: string
  }>
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORSプリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') return errorResponse('POSTのみ利用できます', 405, corsHeaders)

  try {
    const authResult = await verifyAuth(req)
    if (!authResult.success) {
      return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
    }

    const input: PrivateBookingRejectionRequest = await req.json()
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuid.test(input?.organizationId ?? '') || !uuid.test(input?.reservationId ?? '')) {
      return errorResponse('組織と予約を指定してください', 400, corsHeaders)
    }
    if (typeof input.rejectionReason !== 'string' || input.rejectionReason.length > 20000
      || (input.customEmailBody != null && (typeof input.customEmailBody !== 'string' || input.customEmailBody.length > 20000))) {
      return errorResponse('メール本文が不正です', 400, corsHeaders)
    }

    const serviceClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey())
    const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', getAnonKey(), {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
      auth: { persistSession: false, autoRefreshToken: false }
    })
    // 予約の個人情報・組織の送信設定を読む前に、DB440と同じ組織権限を確認する。
    const [org, admin, staff] = await Promise.all([
      userClient.rpc('get_user_organization_id'),
      userClient.rpc('is_org_admin'),
      serviceClient.from('staff').select('id').eq('user_id', authResult.user!.id)
        .eq('organization_id', input.organizationId).eq('status', 'active').maybeSingle()
    ])
    if (org.error || admin.error || staff.error) {
      return errorResponse('操作権限を確認できませんでした', 503, corsHeaders)
    }
    if (!(admin.data === true && org.data === input.organizationId) && !staff.data) {
      return errorResponse('この組織の却下通知を送信する権限がありません', 403, corsHeaders)
    }
    const { data: reservation, error: reservationError } = await serviceClient.from('reservations')
      .select('id,organization_id,status,cancelled_at,private_group_id,reservation_source,schedule_event_id,customer_email,customer_name,title,candidate_datetimes,customers(email,name)')
      .eq('id', input.reservationId).eq('organization_id', input.organizationId).maybeSingle()
    if (reservationError) return errorResponse('予約を確認できませんでした', 503, corsHeaders)
    if (!reservation) return errorResponse('予約が見つかりません', 404, corsHeaders)
    if (reservation.status !== 'cancelled') return errorResponse('却下処理が完了していません', 409, corsHeaders)

    let isPrivate = !!reservation.private_group_id || reservation.reservation_source === 'web_private'
    if (reservation.schedule_event_id) {
      const { data: event, error } = await serviceClient.from('schedule_events')
        .select('is_private_booking,category').eq('id', reservation.schedule_event_id)
        .eq('organization_id', reservation.organization_id).maybeSingle()
      if (error) return errorResponse('公演を確認できませんでした', 503, corsHeaders)
      if (!event) return errorResponse('予約と公演の対応を確認してください', 409, corsHeaders)
      isPrivate ||= event.is_private_booking === true || event.category === 'private'
    }
    if (!isPrivate) return errorResponse('貸切予約ではありません', 409, corsHeaders)
    if (reservation.private_group_id) {
      const { data: group, error } = await serviceClient.from('private_groups')
        .select('reservation_id,status').eq('id', reservation.private_group_id)
        .eq('organization_id', reservation.organization_id).maybeSingle()
      if (error) return errorResponse('貸切グループを確認できませんでした', 503, corsHeaders)
      if (!group || group.reservation_id !== reservation.id || group.status !== 'date_adjusting') {
        return errorResponse('貸切の状態が変わっています。再読込してください', 409, corsHeaders)
      }
    }
    // 新しい保存入口で作られた世代は永続ワーカーだけが送る。
    // 古い画面が送信APIを呼んでも、同じメールを直接送信しない。
    if (reservation.cancelled_at) {
      const { data: delivery, error: deliveryError } = await serviceClient.from('private_booking_rejection_deliveries')
        .select('status').eq('reservation_id', reservation.id).eq('organization_id', reservation.organization_id)
        .eq('cancelled_at', reservation.cancelled_at).maybeSingle()
      if (deliveryError) return errorResponse('送信記録を確認できませんでした', 503, corsHeaders)
      if (delivery) return new Response(JSON.stringify({
        success: delivery.status === 'sent', queued: ['pending', 'sending'].includes(delivery.status), deliveryStatus: delivery.status,
        message: '却下済み一覧の送信状況を確認してください',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const customer = Array.isArray(reservation.customers) ? reservation.customers[0] : reservation.customers
    const recipient = (reservation.customer_email || customer?.email || '').trim()
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)) {
      return errorResponse('予約のメールアドレスを確認してください', 409, corsHeaders)
    }
    if (input.customerEmail != null && (typeof input.customerEmail !== 'string'
      || input.customerEmail.trim().toLowerCase() !== recipient.toLowerCase())) {
      return errorResponse('予約のメールアドレスと宛先が一致しません', 409, corsHeaders)
    }
    const rejectionData: PrivateBookingRejectionRequest = {
      organizationId: reservation.organization_id,
      reservationId: reservation.id,
      customerEmail: recipient,
      customerName: reservation.customer_name || customer?.name || 'お客様',
      scenarioTitle: reservation.title || '',
      rejectionReason: input.rejectionReason,
      customEmailBody: input.customEmailBody,
      candidateDates: Array.isArray(reservation.candidate_datetimes?.candidates)
        ? reservation.candidate_datetimes.candidates : []
    }
    const escapeHtml = (value: string) => String(value).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]!)

    const emailSettings = rejectionData.organizationId 
      ? await getEmailSettings(serviceClient, rejectionData.organizationId)
      : null
    
    const resendApiKey = emailSettings?.resendApiKey || Deno.env.get('RESEND_API_KEY')
    const senderEmail = emailSettings?.senderEmail || Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
    const senderName = emailSettings?.senderName || Deno.env.get('SENDER_NAME') || 'MMQ予約システム'
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }
    
    // カスタムテンプレート取得
    const storeEmailSettings = await getStoreEmailSettings(serviceClient, { 
      organizationId: rejectionData.organizationId,
      reservationId: rejectionData.reservationId
    })
    const customTemplate = storeEmailSettings?.private_rejection_template

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

    // 候補日時のHTML表示
    const candidatesHtml = rejectionData.candidateDates && rejectionData.candidateDates.length > 0
      ? `
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
      ${rejectionData.candidateDates.map((candidate, index) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #e5e7eb; background-color: #f9fafb;">
          候補${index + 1}: ${formatDate(candidate.date)} ${escapeHtml(formatTime(candidate.startTime))} - ${escapeHtml(formatTime(candidate.endTime))}
        </td>
      </tr>
      `).join('')}
    </table>
      `
      : ''

    const candidatesText = rejectionData.candidateDates && rejectionData.candidateDates.length > 0
      ? '\n\nご希望いただいた日程:\n' + rejectionData.candidateDates.map((candidate, index) => 
          `候補${index + 1}: ${formatDate(candidate.date)} ${formatTime(candidate.startTime)} - ${formatTime(candidate.endTime)}`
        ).join('\n')
      : ''

    // メール本文を作成
    const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>貸切リクエストについて</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #6b7280; margin-top: 0; font-size: 24px;">貸切リクエストについて</h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${escapeHtml(rejectionData.customerName)} 様
    </p>
    <p style="font-size: 14px; color: #666;">
      この度は、貸切予約のリクエストをいただき、誠にありがとうございます。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #6b7280; padding-bottom: 10px;">リクエスト内容</h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${escapeHtml(rejectionData.scenarioTitle)}</td>
      </tr>
      ${rejectionData.candidateDates && rejectionData.candidateDates.length > 0 ? `
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280; vertical-align: top;">ご希望の日程</td>
        <td style="padding: 12px 0; color: #1f2937;">
          ${candidatesHtml}
        </td>
      </tr>
      ` : ''}
    </table>
  </div>

  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #92400e; margin-top: 0; font-size: 16px;">ご連絡</h3>
    <p style="margin: 0; color: #92400e; white-space: pre-line;">${escapeHtml(rejectionData.rejectionReason)}</p>
  </div>

  <div style="background-color: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #1e40af; margin-top: 0; font-size: 16px;">今後のご検討について</h3>
    <ul style="margin: 0; padding-left: 20px; color: #1e40af;">
      <li style="margin-bottom: 8px;">別の日程でのご検討も可能です</li>
      <li style="margin-bottom: 8px;">通常公演へのご参加も歓迎しております</li>
      <li style="margin-bottom: 8px;">ご不明点等ございましたら、お気軽にお問い合わせください</li>
    </ul>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      この度はご希望に沿えず、大変申し訳ございません。<br>
      引き続き、MMQをよろしくお願いいたします。<br>
      <br>
      お問い合わせは、このメールへの返信にてお願いいたします。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">MMQ</p>
    <p style="margin: 5px 0;">このメールは自動送信されています</p>
  </div>
</body>
</html>
    `

    const emailText = `
${rejectionData.customerName} 様

この度は、貸切予約のリクエストをいただき、誠にありがとうございます。

━━━━━━━━━━━━━━━━━━━━
リクエスト内容
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${rejectionData.scenarioTitle}${candidatesText}

━━━━━━━━━━━━━━━━━━━━
ご連絡
━━━━━━━━━━━━━━━━━━━━

${rejectionData.rejectionReason}

━━━━━━━━━━━━━━━━━━━━
今後のご検討について
━━━━━━━━━━━━━━━━━━━━

• 別の日程でのご検討も可能です
• 通常公演へのご参加も歓迎しております
• ご不明点等ございましたら、お気軽にお問い合わせください

━━━━━━━━━━━━━━━━━━━━

この度はご希望に沿えず、大変申し訳ございません。
引き続き、MMQをよろしくお願いいたします。

お問い合わせは、このメールへの返信にてお願いいたします。

MMQ
このメールは自動送信されています
    `

    // カスタムテンプレート対応
    let finalHtml = emailHtml
    let finalText = emailText

    if (rejectionData.customEmailBody && rejectionData.customEmailBody.trim()) {
      // 管理者が却下ダイアログで全文編集した本文をそのまま送る（テンプレ適用より優先）
      const body = rejectionData.customEmailBody
      const htmlContent = body
        .split('\n')
        .map(line => `<p style="margin: 0.5em 0;">${line ? escapeHtml(line) : '&nbsp;'}</p>`)
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
      finalText = body
      console.log('📧 Using custom email body (full edit)')
    } else if (customTemplate && customTemplate.trim()) {
      // テンプレート変数
      const templateVariables = {
        customer_name: rejectionData.customerName,
        scenario_title: rejectionData.scenarioTitle,
        rejection_reason: rejectionData.rejectionReason,
        candidate_dates: candidatesText.replace('\n\nご希望いただいた日程:\n', ''),
        company_name: senderName
      }
      
      const appliedTemplate = replaceTemplateVariables(customTemplate, templateVariables)
      
      // テキストをHTMLに変換
      const htmlContent = appliedTemplate
        .split('\n')
        .map(line => `<p style="margin: 0.5em 0;">${line ? escapeHtml(line) : '&nbsp;'}</p>`)
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
      console.log('📧 Using custom private_rejection_template')
    }

    const emailSubject = `【貸切リクエスト】${rejectionData.scenarioTitle}のお申し込みについて`

    const emailLogId = await insertEmailLog(serviceClient, {
      organization_id: rejectionData.organizationId ?? null,
      reservation_id:  rejectionData.reservationId ?? null,
      email_type:      'reservation_cancelled',
      to_email:        rejectionData.customerEmail,
      to_name:         rejectionData.customerName ?? null,
      subject:         emailSubject,
      body_html:       finalHtml,
      body_text:       finalText,
      status:          'queued',
    })

    // Resend APIを使ってメール送信
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [rejectionData.customerEmail],
        subject: emailSubject,
        html: finalHtml,
        text: finalText,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error:', errorData)
      await updateEmailLog(serviceClient, emailLogId, {
        status: 'failed',
        error_message: sanitizeErrorMessage(JSON.stringify(errorData)),
      })
      throw new Error(`メール送信に失敗しました: ${JSON.stringify(errorData)}`)
    }

    const result = await resendResponse.json()
    console.log('Email sent successfully:', result)
    await updateEmailLog(serviceClient, emailLogId, {
      status: 'sent',
      provider_message_id: result.id,
      sent_at: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: '貸切リクエスト却下メールを送信しました',
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

