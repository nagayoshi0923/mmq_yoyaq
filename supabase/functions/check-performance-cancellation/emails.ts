/**
 * 中止判定のお客様向けメール（中止・募集延長・開催決定）の文面作りと送信。
 * index.ts から中身を変えずに移したもの。共通の部分は ../_shared/performance-check-email.ts。
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sanitizeErrorMessage, maskEmail } from '../_shared/security.ts'
import { insertEmailLog, updateEmailLog } from '../_shared/email-logs.ts'
import { getEmailSettings, replaceTemplateVariables } from '../_shared/organization-settings.ts'
import { customTemplateToHtml, formatJudgmentDate, formatJudgmentTime } from '../_shared/performance-check-email.ts'
import type { EventDetail } from '../_shared/performance-check-judgment.ts'

/**
 * 中止メールを送信
 */
export async function sendCancellationEmail(
  supabase: ReturnType<typeof createClient>,
  emailSettings: Awaited<ReturnType<typeof getEmailSettings>>,
  customerEmail: string,
  customerName: string,
  event: EventDetail,
  customTemplate?: string | null,
  reservationDetails?: {
    reservationNumber?: string
    participantCount?: number
    totalPrice?: number
    companyPhone?: string
    companyEmail?: string
    reservationId?: string   // email_logs に予約を紐付ける（#757）
    customerId?: string | null
  }
): Promise<void> {
  const formatDate = formatJudgmentDate
  const formatTime = formatJudgmentTime

  // テンプレート変数（基本変数セット - 全メール共通）
  const templateVariables: Record<string, string> = {
    // 顧客情報
    customer_name: customerName,
    customer_email: customerEmail,
    
    // 予約情報
    reservation_number: reservationDetails?.reservationNumber || '',
    scenario_title: event.scenario || '',
    date: formatDate(event.date),
    time: formatTime(event.start_time),
    end_time: event.end_time ? formatTime(event.end_time) : '',
    venue: event.store_name || '未定',
    participants: String(reservationDetails?.participantCount || event.current_participants),
    participant_count: String(reservationDetails?.participantCount || event.current_participants),
    total_price: reservationDetails?.totalPrice?.toLocaleString() || '',
    
    // キャンセル関連
    current_participants: String(event.current_participants),
    max_participants: String(event.max_participants),
    cancellation_reason: '人数未達のため中止となりました',
    
    // 会社情報
    company_name: emailSettings.senderName,
    company_phone: reservationDetails?.companyPhone || '',
    company_email: reservationDetails?.companyEmail || ''
  }

  // カスタムテンプレートをHTMLに変換
  const templateToHtml = customTemplateToHtml

  let finalHtml: string
  let finalText: string

  if (customTemplate && customTemplate.trim()) {
    // カスタムテンプレートを使用
    const appliedTemplate = replaceTemplateVariables(customTemplate, templateVariables)
    finalHtml = templateToHtml(appliedTemplate)
    finalText = appliedTemplate
    console.log('📧 Using custom performance_cancellation_template')
  } else {
    // デフォルトテンプレート
    finalHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>公演中止のお知らせ</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #fef2f2; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #dc2626; margin-top: 0; font-size: 24px;">
      ⚠️ 公演中止のお知らせ
    </h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${customerName} 様
    </p>
    <p style="font-size: 14px; color: #991b1b;">
      誠に申し訳ございませんが、ご予約いただいておりました公演は人数未達のため中止となりました。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #dc2626; padding-bottom: 10px;">
      中止となった公演
    </h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${event.scenario}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(event.date)}<br>
          ${formatTime(event.start_time)}〜
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; color: #1f2937;">${event.store_name || '未定'}</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      ご迷惑をおかけして誠に申し訳ございません。<br>
      またのご予約をお待ちしております。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">${emailSettings.senderName}</p>
    <p style="margin: 5px 0;">このメールは自動送信されています</p>
  </div>
</body>
</html>
    `

    finalText = `
${customerName} 様

⚠️ 公演中止のお知らせ

誠に申し訳ございませんが、ご予約いただいておりました公演は人数未達のため中止となりました。

━━━━━━━━━━━━━━━━━━━━
中止となった公演
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${event.scenario}
日時: ${formatDate(event.date)} ${formatTime(event.start_time)}〜
会場: ${event.store_name || '未定'}

━━━━━━━━━━━━━━━━━━━━

ご迷惑をおかけして誠に申し訳ございません。
またのご予約をお待ちしております。

${emailSettings.senderName}
    `
  }

  const emailSubject = `【公演中止のお知らせ】${event.scenario} - ${event.date}`
  const emailLogId = await insertEmailLog(supabase, {
    organization_id: event.organization_id ?? null,
    reservation_id:  reservationDetails?.reservationId ?? null,
    schedule_event_id: event.event_id ?? null,
    customer_id:     reservationDetails?.customerId ?? null,
    email_type:      'performance_cancellation',
    to_email:        customerEmail,
    subject:         emailSubject,
    body_html:       finalHtml,
    body_text:       finalText,
    status:          'queued',
  })

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${emailSettings.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${emailSettings.senderName} <${emailSettings.senderEmail}>`,
      to: [customerEmail],
      subject: emailSubject,
      html: finalHtml,
      text: finalText,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    await updateEmailLog(supabase, emailLogId, {
      status: 'failed',
      error_message: sanitizeErrorMessage(JSON.stringify(errorData)),
    })
    throw new Error(`Resend API error: ${JSON.stringify(errorData)}`)
  }

  const resendResult = await response.json()
  await updateEmailLog(supabase, emailLogId, {
    status: 'sent',
    provider_message_id: resendResult?.id ?? null,
    sent_at: new Date().toISOString(),
  })
}

/**
 * 募集延長メールを送信
 */
export async function sendExtensionEmail(
  supabase: SupabaseClient,
  emailSettings: Awaited<ReturnType<typeof getEmailSettings>>,
  customerEmail: string,
  customerName: string,
  event: EventDetail,
  customTemplate?: string | null,
  reservationDetails?: {
    reservationNumber?: string
    participantCount?: number
    totalPrice?: number
    companyPhone?: string
    companyEmail?: string
    reservationId?: string   // email_logs に予約を紐付ける
  }
): Promise<void> {
  const formatDate = formatJudgmentDate
  const formatTime = formatJudgmentTime

  const remainingSeats = event.max_participants - event.current_participants
  const deadlineLabel = new Date(event.judgment_deadline!).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  // テンプレート変数（基本変数セット対応）
  const templateVariables: Record<string, string> = {
    // 顧客情報
    customer_name: customerName,
    customer_email: customerEmail,
    // 予約情報
    reservation_number: reservationDetails?.reservationNumber || '',
    scenario_title: event.scenario || '',
    date: formatDate(event.date),
    time: formatTime(event.start_time),
    end_time: event.end_time ? formatTime(event.end_time) : '',
    venue: event.store_name || '未定',
    participants: String(reservationDetails?.participantCount || event.current_participants),
    participant_count: String(reservationDetails?.participantCount || event.current_participants),
    total_price: reservationDetails?.totalPrice?.toLocaleString() || '',
    // キャンセル関連（延長時は空）
    cancellation_fee: '',
    cancellation_reason: '',
    // 会社情報
    company_name: emailSettings.senderName,
    company_phone: reservationDetails?.companyPhone || '',
    company_email: reservationDetails?.companyEmail || '',
    // 延長専用変数
    current_participants: String(event.current_participants),
    max_participants: String(event.max_participants),
    remaining_seats: String(remainingSeats),
    extension_deadline: deadlineLabel
  }

  // カスタムテンプレートをHTMLに変換
  const templateToHtml = customTemplateToHtml

  let finalHtml: string
  let finalText: string

  if (customTemplate && customTemplate.trim()) {
    // カスタムテンプレートを使用
    const appliedTemplate = replaceTemplateVariables(customTemplate, templateVariables)
    finalHtml = templateToHtml(appliedTemplate)
    finalText = appliedTemplate
    console.log('📧 Using custom performance_extension_template')
  } else {
    // デフォルトテンプレート
    finalHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>募集延長のお知らせ</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #fef3c7; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #b45309; margin-top: 0; font-size: 24px;">
      ⏰ 募集延長のお知らせ
    </h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${customerName} 様
    </p>
    <p style="font-size: 14px; color: #92400e;">
      ご予約いただいている公演は、現在満席ではないため、募集を${deadlineLabel}まで延長いたします。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">
      公演情報
    </h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${event.scenario}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(event.date)}<br>
          ${formatTime(event.start_time)}〜
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${event.store_name || '未定'}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">現在の参加者</td>
        <td style="padding: 12px 0; color: #1f2937;">${event.current_participants}/${event.max_participants}名（あと${remainingSeats}名）</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <p style="margin: 0; color: #1e40af; font-size: 14px;">
      <strong>ご案内</strong><br>
      ${deadlineLabel}までに最低開催人数に達した場合は、公演を開催いたします。<br>
      最低開催人数に達しない場合は、中止となりメールでお知らせいたします。
    </p>
  </div>

  <div style="background-color: #dcfce7; border-left: 4px solid #22c55e; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <p style="margin: 0; color: #166534; font-size: 14px;">
      <strong>キャンセルについて</strong><br>
      募集延長中の公演は、キャンセル料無料でキャンセルが可能です。<br>
      ご都合が悪くなった場合は、お気軽にご連絡ください。
    </p>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      お知り合いでご興味のある方がいらっしゃいましたら、ぜひお誘いください。<br>
      ご協力よろしくお願いいたします。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">${emailSettings.senderName}</p>
    <p style="margin: 5px 0;">このメールは自動送信されています</p>
  </div>
</body>
</html>
    `

    finalText = `
${customerName} 様

⏰ 募集延長のお知らせ

ご予約いただいている公演は、現在満席ではないため、募集を${deadlineLabel}まで延長いたします。

━━━━━━━━━━━━━━━━━━━━
公演情報
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${event.scenario}
日時: ${formatDate(event.date)} ${formatTime(event.start_time)}〜
会場: ${event.store_name || '未定'}
現在の参加者: ${event.current_participants}/${event.max_participants}名（あと${remainingSeats}名）

━━━━━━━━━━━━━━━━━━━━

【ご案内】
${deadlineLabel}までに最低開催人数に達した場合は、公演を開催いたします。
最低開催人数に達しない場合は、中止となりメールでお知らせいたします。

【キャンセルについて】
募集延長中の公演は、キャンセル料無料でキャンセルが可能です。
ご都合が悪くなった場合は、お気軽にご連絡ください。

お知り合いでご興味のある方がいらっしゃいましたら、ぜひお誘いください。
ご協力よろしくお願いいたします。

${emailSettings.senderName}
    `
  }

  // 送信記録を先に作り、予約・公演に紐付ける（送信サービスからの通知はこの行を更新する。#757 と同じ）
  const emailSubject = `【募集延長】${event.scenario} - ${event.date}`
  const emailLogId = await insertEmailLog(supabase, {
    organization_id: event.organization_id ?? null,
    reservation_id: reservationDetails?.reservationId ?? null,
    schedule_event_id: event.event_id ?? null,
    email_type: 'other',
    to_email: customerEmail,
    subject: emailSubject,
    body_html: finalHtml,
    body_text: finalText,
    status: 'queued',
  })

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${emailSettings.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${emailSettings.senderName} <${emailSettings.senderEmail}>`,
      to: [customerEmail],
      subject: emailSubject,
      html: finalHtml,
      text: finalText,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    await updateEmailLog(supabase, emailLogId, { status: 'failed', error_message: sanitizeErrorMessage(JSON.stringify(errorData)) })
    throw new Error(`Resend API error: ${JSON.stringify(errorData)}`)
  }

  const resendResult = await response.json().catch(() => null)
  await updateEmailLog(supabase, emailLogId, {
    status: 'sent',
    provider_message_id: typeof resendResult?.id === 'string' ? resendResult.id : null,
    sent_at: new Date().toISOString(),
  })
}

/**
 * 開催決定メールを送信
 */
export async function sendConfirmationEmail(
  supabase: ReturnType<typeof createClient>,
  emailSettings: Awaited<ReturnType<typeof getEmailSettings>>,
  customerEmail: string,
  customerName: string,
  event: EventDetail,
  customTemplate?: string | null,
  reservationDetails?: {
    reservationNumber?: string
    participantCount?: number
    totalPrice?: number
    companyPhone?: string
    companyEmail?: string
  }
): Promise<void> {
  const formatDate = formatJudgmentDate
  const formatTime = formatJudgmentTime

  // テンプレート変数（基本変数セット - 全メール共通）
  const templateVariables: Record<string, string> = {
    // 顧客情報
    customer_name: customerName,
    customer_email: customerEmail,
    // 予約情報
    reservation_number: reservationDetails?.reservationNumber || '',
    scenario_title: event.scenario || '',
    date: formatDate(event.date),
    time: formatTime(event.start_time),
    end_time: event.end_time ? formatTime(event.end_time) : '',
    venue: event.store_name || '未定',
    participants: String(reservationDetails?.participantCount || event.current_participants),
    participant_count: String(reservationDetails?.participantCount || event.current_participants),
    total_price: reservationDetails?.totalPrice?.toLocaleString() || '',
    // 会社情報
    company_name: emailSettings.senderName,
    company_phone: reservationDetails?.companyPhone || '',
    company_email: reservationDetails?.companyEmail || '',
    // 開催決定関連
    current_participants: String(event.current_participants),
    max_participants: String(event.max_participants)
  }

  // カスタムテンプレートをHTMLに変換
  const templateToHtml = customTemplateToHtml

  let finalHtml: string
  let finalText: string

  if (customTemplate && customTemplate.trim()) {
    // カスタムテンプレートを使用
    const appliedTemplate = replaceTemplateVariables(customTemplate, templateVariables)
    finalHtml = templateToHtml(appliedTemplate)
    finalText = appliedTemplate
    console.log('📧 Using custom performance_confirmation_template')
  } else {
    // デフォルトテンプレート
    finalHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>公演開催決定のお知らせ</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dcfce7; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #166534; margin-top: 0; font-size: 24px;">
      🎉 公演開催決定のお知らせ
    </h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${customerName} 様
    </p>
    <p style="font-size: 14px; color: #15803d;">
      ご予約いただいている公演は、開催が決定いたしました。当日のご来場をお待ちしております。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #22c55e; padding-bottom: 10px;">
      公演情報
    </h2>

    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${event.scenario}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(event.date)}<br>
          ${formatTime(event.start_time)}〜
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; color: #1f2937;">${event.store_name || '未定'}</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      当日お会いできることを楽しみにしております。<br>
      お気をつけてお越しください。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">${emailSettings.senderName}</p>
    <p style="margin: 5px 0;">このメールは自動送信されています</p>
  </div>
</body>
</html>
    `

    finalText = `
${customerName} 様

🎉 公演開催決定のお知らせ

ご予約いただいている公演は、開催が決定いたしました。当日のご来場をお待ちしております。

━━━━━━━━━━━━━━━━━━━━
公演情報
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${event.scenario}
日時: ${formatDate(event.date)} ${formatTime(event.start_time)}〜
会場: ${event.store_name || '未定'}

━━━━━━━━━━━━━━━━━━━━

当日お会いできることを楽しみにしております。
お気をつけてお越しください。

${emailSettings.senderName}
    `
  }

  const emailSubject = `【公演開催決定のお知らせ】${event.scenario} - ${event.date}`

  // 送信前に DB で原子的に「送信権」を確保する（#327）。
  //   queued 行を1件 INSERT できた run だけが送信権を持つ。ユニーク制約(active 集合)に
  //   衝突して claim できなかった場合は既に別 run が送信中/送信済みなので送信しない。
  //   これにより同時実行時に Resend を二重に呼ぶこと自体を防ぐ。
  const { data: claimedId, error: claimError } = await supabase.rpc(
    'claim_performance_confirmation_email',
    {
      p_schedule_event_id: event.event_id,
      p_to_email:          customerEmail,
      p_organization_id:   event.organization_id ?? null,
      p_subject:           emailSubject,
      p_body_html:         finalHtml,
      p_body_text:         finalText,
    }
  )
  if (claimError) {
    // claim 呼び出し自体が失敗した場合は、二重送信を避けるため fail-closed で送信を中止する。
    // 行は作られないため、次回 cron で再 claim → 再送される。
    console.error('❌ 開催決定メール claim 失敗のため送信中止:', maskEmail(customerEmail), claimError.message)
    return
  }
  if (!claimedId) {
    // 別 run が送信中/送信済み。実際の Resend 送信はこの run では行わない。
    console.log('📧 開催決定メール 送信権を確保できずスキップ(claim):', maskEmail(customerEmail))
    return
  }
  const emailLogId = claimedId as string

  // fetch / response.json() が例外を投げた場合でも必ず failed を記録してから re-throw する。
  // これを怠ると status が queued のまま残り、重複ガードが「送信済み」と誤判定して
  // 未送信の予約者への再送が永久にスキップされる（#323）。
  // claim で送信権を確保済みなので、この UPDATE は自分の行の更新でありユニーク制約に衝突しない。
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${emailSettings.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${emailSettings.senderName} <${emailSettings.senderEmail}>`,
        to: [customerEmail],
        subject: emailSubject,
        html: finalHtml,
        text: finalText,
      }),
    })

    if (!response.ok) {
      let errorDetail: string
      try {
        errorDetail = JSON.stringify(await response.json())
      } catch {
        errorDetail = `HTTP ${response.status}`
      }
      throw new Error(`Resend API error: ${errorDetail}`)
    }

    const resendResult = await response.json()
    await updateEmailLog(supabase, emailLogId, {
      status: 'sent',
      provider_message_id: resendResult?.id ?? null,
      sent_at: new Date().toISOString(),
    })
  } catch (sendError) {
    await updateEmailLog(supabase, emailLogId, {
      status: 'failed',
      error_message: sanitizeErrorMessage(sendError instanceof Error ? sendError.message : String(sendError)),
    })
    throw sendError
  }
}
