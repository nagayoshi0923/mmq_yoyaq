// 既存の確定メール本文を、送信副作用のない関数へ分離。配送再試行は生成済みpayloadを再利用する。
import { buildSenshinOAuthJoinUrl } from './senshin-discord.ts'
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!)
export interface PrivateBookingConfirmationRequest {
  reservationId: string
  organizationId?: string  // マルチテナント対応
  storeId?: string  // 店舗ID（メール設定取得用）
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
  notes?: string
  scheduleEventId?: string
  scenarioMasterId?: string
  discordPlayerUrl?: string
  discordSpectatorUrl?: string
  /** 指定時は確定メール件名の代わりに使う（追送・訂正文面用） */
  emailSubject?: string
  /** 指定時は店舗/作品テンプレの代わりに使う。変数は通常どおり置換 */
  templateOverride?: string
}

export function buildPrivateConfirmationPayload(bookingData: PrivateBookingConfirmationRequest, options: {
 senderEmail: string; senderName: string; replyToEmail?: string | null; supabaseUrl: string;
 storeEmailSettings: Record<string, any> | null
}) {
 const {senderEmail,senderName,replyToEmail,supabaseUrl,storeEmailSettings}=options
 const htmlData = Object.fromEntries(Object.entries(bookingData).map(([k,v])=>[k,typeof v==='string'?escapeHtml(v):v])) as unknown as PrivateBookingConfirmationRequest
    // 会社情報（デフォルト値付き）
    const companyName = storeEmailSettings?.company_name ?? senderName
    const companyEmail = storeEmailSettings?.company_email ?? replyToEmail ?? ''
    const companyPhone = storeEmailSettings?.company_phone ?? ''

    // 組織共通を含む統一された優先順位で取得済み。旧列で再上書きしない。
    const customTemplate = (bookingData.templateOverride || '').trim() || storeEmailSettings?.private_confirm_template

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
      ${htmlData.customerName} 様
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
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${htmlData.reservationNumber}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${htmlData.scenarioTitle}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(htmlData.eventDate)}<br>
          ${formatTime(htmlData.startTime)} - ${formatTime(htmlData.endTime)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${htmlData.storeName}
          ${htmlData.storeAddress ? `<br><span style="font-size: 13px; color: #6b7280;">${htmlData.storeAddress}</span>` : ''}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">参加人数</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${htmlData.participantCount}名</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">お支払い金額</td>
        <td style="padding: 12px 0; color: #10b981; font-size: 18px; font-weight: bold;">¥${htmlData.totalPrice.toLocaleString()}</td>
      </tr>
    </table>
  </div>

  ${htmlData.notes ? `
  <div style="background-color: #f3f4f6; border-left: 4px solid #6b7280; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #374151; margin-top: 0; font-size: 16px;">特記事項</h3>
    <p style="margin: 0; color: #4b5563; white-space: pre-line;">${htmlData.notes}</p>
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
    <p style="margin: 0; color: #92400e;">ご予約に関する詳細・ご注意事項は、公式サイトのご案内をご確認ください。</p>
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
    <p style="margin: 5px 0; font-weight: bold;">${companyName}</p>
    ${companyPhone ? `<p style="margin: 5px 0;">TEL: ${companyPhone}</p>` : ''}
    ${companyEmail ? `<p style="margin: 5px 0;">Email: ${companyEmail}</p>` : ''}
    <p style="margin: 10px 0 5px 0; font-size: 11px;">このメールは貸切予約確定時に自動送信されています</p>
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
参加人数: ${bookingData.participantCount}名
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

ご予約に関する詳細・ご注意事項は、公式サイトのご案内をご確認ください。

━━━━━━━━━━━━━━━━━━━━

貸切予約を承り、誠にありがとうございます。
当日のご来店を心よりお待ちしております。

ご不明な点がございましたら、お気軽にお問い合わせください。

${companyName}
${companyPhone ? `TEL: ${companyPhone}` : ''}
${companyEmail ? `Email: ${companyEmail}` : ''}
このメールは貸切予約確定時に自動送信されています
    `

    // テンプレートの変数置換用関数（基本変数セット対応）
    const applyTemplate = (template: string) => {
      return template
        // 顧客情報
        .replace(/{customer_name}/g, bookingData.customerName || 'お客様')
        .replace(/{customer_email}/g, bookingData.customerEmail || '')
        // 予約情報
        .replace(/{reservation_number}/g, bookingData.reservationNumber || '')
        .replace(/{scenario_title}/g, bookingData.scenarioTitle || '')
        .replace(/{date}/g, formatDate(bookingData.eventDate))
        .replace(/{time}/g, formatTime(bookingData.startTime))
        .replace(/{end_time}/g, bookingData.endTime ? formatTime(bookingData.endTime) : '')
        .replace(/{venue}/g, bookingData.storeName || '')
        .replace(/{venue_address}/g, bookingData.storeAddress || '')
        .replace(/{participants}/g, String(bookingData.participantCount || ''))
        .replace(/{participant_count}/g, String(bookingData.participantCount || ''))
        .replace(/{total_price}/g, (bookingData.totalPrice || 0).toLocaleString())
        // キャンセル関連
        .replace(/{cancellation_fee}/g, '')
        .replace(/{cancellation_reason}/g, '')
        // 会社情報
        .replace(/{company_name}/g, companyName)
        .replace(/{company_phone}/g, companyPhone || '')
        .replace(/{company_email}/g, companyEmail || '')
        // 貸切専用（顧客メールではGM名を出さない）
        .replace(/{gm_name}/g, '')
        .replace(/{notes}/g, bookingData.notes || '')
        .replace(/{discord_player_url}/g, bookingData.discordPlayerUrl
          ? buildSenshinOAuthJoinUrl(supabaseUrl, bookingData.reservationId, 'player')
          : '')
        .replace(/{discord_spectator_url}/g, bookingData.discordSpectatorUrl
          ? buildSenshinOAuthJoinUrl(supabaseUrl, bookingData.reservationId, 'spectator')
          : '')
        // 未置換変数を除去
        .replace(/\{[a-z_]+\}/g, '')
    }

    // カスタムテンプレートをHTMLに変換
    const templateToHtml = (template: string) => {
      const htmlContent = template
        .split('\n')
        .map(line => `<p style="margin: 0.5em 0;">${line ? escapeHtml(line) : '&nbsp;'}</p>`)
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

    if (customTemplate && customTemplate.trim()) {
      // email_settingsにテンプレートが設定されている場合
      const appliedTemplate = applyTemplate(customTemplate)
      finalHtml = templateToHtml(appliedTemplate)
      finalText = appliedTemplate
      // 組織・店舗・作品・公演の実効テンプレートを使用する。
    } else {
      // デフォルトのハードコードテンプレートを使用
      // 未設定の場合は既存の既定文面を維持する。
      finalHtml = emailHtml
      finalText = emailText
    }

    const emailSubject = (bookingData.emailSubject || '').trim()
      || `【貸切予約確定】${bookingData.scenarioTitle} - ${formatDate(bookingData.eventDate)}${companyName ? ` | ${companyName}` : ''}`

    const emailPayload: Record<string, unknown> = {
      from: `${companyName} <${senderEmail}>`,
      to: [bookingData.customerEmail],
      subject: emailSubject,
      html: finalHtml,
      text: finalText,
    }

    // 返信先メールアドレスが設定されている場合は追加
    const replyTo = (companyEmail || replyToEmail || '').trim()
    if (replyTo) {
      emailPayload.reply_to = replyTo
    }

 return emailPayload
}
