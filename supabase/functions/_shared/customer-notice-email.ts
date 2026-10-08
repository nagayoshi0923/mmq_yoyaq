/**
 * お客様への知らせのメール（マイページ改修 段階 4）。文面は DB の送信待ち（customer_notice_emails）に積んだ時点で決まっている。
 * ここでは {{SITE_URL}} を実際の URL に置き換え、HTML 版を作るだけ（アンケートのリマインドと同じ HTML の形）。
 */
export interface CustomerNoticeEmailRow { subject: string; body_text: string }

export function buildCustomerNoticeEmail(row: CustomerNoticeEmailRow, siteUrl?: string) {
  const base = (siteUrl || 'https://mmq.game').replace(/\/$/, '')
  const text = row.body_text.split('{{SITE_URL}}').join(base)
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const lines = text.split('\n')
  const html = `<div style="font-family:sans-serif;line-height:1.8">${lines.map(line => {
    if (!line) return '<p style="margin:0">&nbsp;</p>'
    const escaped = escape(line)
    // 自分のサイトの URL だけをリンクにする（本文に入る名前などはリンクにしない）
    const linked = line.startsWith(base) && !/\s/.test(line) ? `<a href="${escaped}">${escaped}</a>` : escaped
    return `<p style="margin:0">${linked}</p>`
  }).join('')}</div>`
  return { subject: row.subject, text, html }
}
