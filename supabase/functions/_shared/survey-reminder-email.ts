/** 事前配役アンケートの未回答者へのリマインドメールの文面（普段のリマインドメールと同じ形） */
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function jstParts(date: Date) {
  const shifted = new Date(date.getTime() + 9 * 3600 * 1000)
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate(), w: WEEKDAYS[shifted.getUTCDay()] }
}
export function formatJstDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+09:00` : value) : value
  const p = jstParts(date)
  return `${p.y}年${p.m}月${p.d}日(${p.w})`
}

export interface SurveyReminderInput {
  toName: string
  scenarioTitle: string
  performanceDate: string
  startTime?: string | null
  venue?: string | null
  deadlineAt: string
  inviteCode: string
  companyName: string
  siteUrl?: string
}

export function buildSurveyReminderEmail(input: SurveyReminderInput) {
  const date = formatJstDate(input.performanceDate)
  const deadline = formatJstDate(input.deadlineAt)
  const url = `${(input.siteUrl || 'https://mmq.game').replace(/\/$/, '')}/group/invite/${encodeURIComponent(input.inviteCode)}?tab=survey`
  const time = input.startTime ? ` ${input.startTime.slice(0, 5)}開演` : ''
  const subject = `【事前配役アンケートのお願い】${input.scenarioTitle} - ${date} | ${input.companyName}`
  const lines = [
    `${input.toName} 様`,
    '',
    `${date}の貸切公演「${input.scenarioTitle}」について、事前配役アンケートへのご回答をお願いいたします。`,
    '当日の準備に使わせていただきます。',
    '',
    '■ 事前配役アンケートのご回答',
    `回答期限: ${deadline}まで`,
    `回答はこちら: ${url}`,
    '',
    '■ ご予約内容',
    `シナリオ名: ${input.scenarioTitle}`,
    `開催日時: ${date}${time}`,
    ...(input.venue ? [`会場: ${input.venue}`] : []),
    '',
    '■ ログインについて',
    'アカウントを作らずにご参加の方は、ご参加時にお送りしたメールに記載の4桁のPINでお入りください。',
    'PINがお分かりにならない場合は、上の画面の「PINを忘れた方」から再送できます。',
    '',
    'すでにご回答済みの場合は、行き違いですのでご容赦ください。',
    'ご不明な点は、グループ画面の歯車マークから「店舗へのお問い合わせ」をご利用ください。',
    '',
    input.companyName,
  ]
  const text = lines.join('\n')
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<div style="font-family:sans-serif;line-height:1.8">${lines.map(line => line ? `<p style="margin:0">${escape(line).replace(escape(url), `<a href="${escape(url)}">${escape(url)}</a>`)}</p>` : '<p style="margin:0">&nbsp;</p>').join('')}</div>`
  return { subject, text, html }
}
