/**
 * 中止判定のお客様向けメール（中止・募集延長・開催決定）で共通の部分。
 * check-performance-cancellation/index.ts の 3 つのメール処理に同じ内容が書かれていたものをまとめた（文面は変えない）。
 */

/** 日付（例: 2026年10月5日、日本時間） */
export function formatJudgmentDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' })
}

/** 時刻（HH:MM） */
export function formatJudgmentTime(timeStr: string): string {
  return timeStr.slice(0, 5)
}

/** 店舗が設定した文面（1 行ずつの段落）をメールの HTML にする */
export function customTemplateToHtml(template: string): string {
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

/**
 * 送り先: 予約のメール。無ければ、予約名（末尾の「様」を除く）がスタッフ名か表示名と一致するスタッフのメール。
 * どちらも無ければ null（送らない）。
 */
export function resolveRecipientEmail(
  reservation: { customer_email?: string | null; customer_name?: string | null },
  staffList: Array<{ name?: string | null; display_name?: string | null; email?: string | null }> | null | undefined,
): { email: string | null; fromStaff: boolean } {
  if (reservation.customer_email) return { email: reservation.customer_email, fromStaff: false }
  if (reservation.customer_name && staffList) {
    const normalizedName = reservation.customer_name.replace(/様$/, '').trim()
    const matchedStaff = staffList.find(s => s.name === normalizedName || s.display_name === normalizedName)
    if (matchedStaff?.email) return { email: matchedStaff.email, fromStaff: true }
  }
  return { email: null, fromStaff: false }
}
