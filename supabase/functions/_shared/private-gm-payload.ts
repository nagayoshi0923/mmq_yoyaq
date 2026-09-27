// メール/Discordを別の配送として扱い、一方の失敗で送信済み通知を繰り返さない。
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!)
export interface GMNotificationRequest {
  organizationId: string
  gmId: string
  gmName: string
  gmEmail?: string
  /** スタッフ個人のDiscordチャンネル（あれば最優先で投稿） */
  gmDiscordChannelId?: string
  /** DiscordユーザーID（スノーフレーク）。個人チャンネルが無い場合はDM、失敗時は貸切用チャンネルでメンション */
  gmDiscordUserId?: string
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  customerName: string
  participantCount: number
  reservationId: string
}
function eventDateToYmdJstCalendar(eventDate: string): string {
  const s = (eventDate || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d)
    const y = parts.find((p) => p.type === 'year')?.value
    const m = parts.find((p) => p.type === 'month')?.value
    const day = parts.find((p) => p.type === 'day')?.value
    if (y && m && day) return `${y}-${m}-${day}`
  }
  const prefix = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return prefix ? prefix[1] : s.slice(0, 10)
}

/** YYYY-MM-DD（または正規化後）を JST の暦日・曜日で表示 */
function formatEventDateLineJst(eventDate: string): string {
  const ymd = eventDateToYmdJstCalendar(eventDate)
  const noonJst = new Date(`${ymd}T12:00:00+09:00`)
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'narrow',
  }).formatToParts(noonJst)
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? ''
  return `${month}/${day}(${wd})`
}

/**
 * 公演時刻を JST の HH:mm で表示。
 * HH:mm / HH:mm:ss はそのまま解釈、ISO文字列は Asia/Tokyo で時分を取る。
 */
function formatScheduleClockJst(timeStr: string): string {
  const s = (timeStr || '').trim()
  if (!s) return ''
  const hmMatch = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (hmMatch) {
    const h = String(parseInt(hmMatch[1], 10)).padStart(2, '0')
    const m = hmMatch[2]
    return `${h}:${m}`
  }
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
    const min = parts.find((p) => p.type === 'minute')?.value ?? '00'
    return `${h.padStart(2, '0')}:${min.padStart(2, '0')}`
  }
  return s.length >= 5 ? s.substring(0, 5) : s
}


export function buildPrivateGmEmailPayload(data: GMNotificationRequest, from: string) {
 const formattedDate=formatEventDateLineJst(data.eventDate)
 const formattedTime=`${formatScheduleClockJst(data.startTime)}〜${formatScheduleClockJst(data.endTime)}`
 const htmlData=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='string'?escapeHtml(v):v])) as unknown as GMNotificationRequest
          const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dcfce7; border-radius: 8px; padding: 25px; margin-bottom: 20px; border: 2px solid #10b981;">
    <h1 style="color: #065f46; margin-top: 0; font-size: 22px;">🎉 貸切公演が確定しました</h1>
    <p style="font-size: 15px; margin-bottom: 5px;">
      ${htmlData.gmName} さん
    </p>
    <p style="font-size: 14px; color: #065f46;">
      以下の貸切公演の担当GMとしてアサインされました。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 16px; margin-top: 0; border-bottom: 2px solid #10b981; padding-bottom: 8px;">公演詳細</h2>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 25%;">シナリオ</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${htmlData.scenarioTitle}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日程</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${formattedDate} ${formattedTime}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${htmlData.storeName}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">代表者</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${htmlData.customerName}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: bold; color: #6b7280;">参加人数</td>
        <td style="padding: 10px 0; color: #1f2937;">${htmlData.participantCount}名</td>
      </tr>
    </table>
  </div>

  <div style="text-align: center; padding-top: 15px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 11px;">
    <p style="margin: 5px 0;">このメールは貸切予約確定時にGMへ自動送信されています</p>
  </div>
</body>
</html>
          `

          const emailText = `
${data.gmName} さん

貸切公演が確定しました。
以下の貸切公演の担当GMとしてアサインされました。

━━━━━━━━━━━━━━━━━━━━
公演詳細
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${data.scenarioTitle}
日程: ${formattedDate} ${formattedTime}
会場: ${data.storeName}
代表者: ${data.customerName}
参加人数: ${data.participantCount}名

━━━━━━━━━━━━━━━━━━━━

このメールは貸切予約確定時にGMへ自動送信されています
          `

          const gmEmailSubject = `【GM担当確定】${data.scenarioTitle} - ${formattedDate}`

 return {from,to:[data.gmEmail],subject:gmEmailSubject,html:emailHtml,text:emailText}
}
export function buildPrivateGmDiscordPayload(data: GMNotificationRequest) {
 const mention=data.gmDiscordUserId && /^\d+$/.test(data.gmDiscordUserId) ? data.gmDiscordUserId : null
 return {
  ...(mention ? {content:`<@${mention}>`} : {}),
  allowed_mentions: {parse:[],users:mention ? [mention] : []},
  embeds:[{
   title:'🎉 貸切公演が確定しました',description:`**担当GM:** ${data.gmName}`,color:0x10b981,
   fields:[
    {name:'📚 シナリオ',value:data.scenarioTitle,inline:false},
    {name:'📅 日程',value:`${formatEventDateLineJst(data.eventDate)} ${formatScheduleClockJst(data.startTime)}〜${formatScheduleClockJst(data.endTime)}`,inline:true},
    {name:'📍 会場',value:data.storeName,inline:true},
    {name:'👤 代表者',value:data.customerName,inline:true},
    {name:'👥 人数',value:`${data.participantCount}名`,inline:true},
   ],footer:{text:'貸切予約確定通知（担当GM向け）'},
  }],
 }
}
