import type { AuthorPerformance } from '../types'

/**
 * レポートテキスト生成関数
 */
export function generateAuthorReportText(
  author: AuthorPerformance,
  year: number,
  month: number
): string {
  // 振込予定日を計算（翌月20日）
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const paymentDate = `${nextYear}年${nextMonth}月20日`

  const lines = [
    `${author.author} 様`,
    ``,
    `${year}年${month}月のライセンス料をご報告いたします。`,
    ``,
    `総公演数: ${author.totalEvents}回`,
    `総ライセンス料: ¥${author.totalLicenseCost.toLocaleString()}`,
    ``,
    `詳細は以下の通りです：`,
  ]

  author.scenarios.forEach(scenario => {
    const gmTestLabel = scenario.isGMTest ? '（GMテスト）' : ''
    const licenseInfo = `@¥${scenario.licenseAmountPerEvent.toLocaleString()}/回`
    lines.push(`・${scenario.title}${gmTestLabel}: ${scenario.events}回 × ${licenseInfo} = ¥${scenario.licenseCost.toLocaleString()}`)
  })

  lines.push(``)
  lines.push(`【お支払いについて】`)
  lines.push(`お支払い予定日: ${paymentDate}まで`)
  lines.push(``)
  lines.push(`請求書は queens.waltz@gmail.com 宛にお送りください。`)
  lines.push(``)
  lines.push(`よろしくお願いいたします。`)

  return lines.join('\n')
}

/**
 * Gmailメール送信URL生成
 */
export function generateEmailUrl(
  author: AuthorPerformance,
  year: number,
  month: number,
  email?: string | null
): string {
  const subject = `【${year}年${month}月】ライセンス料レポート - ${author.author}`

  // 振込予定日を計算（翌月20日）
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const paymentDate = `${nextYear}年${nextMonth}月20日`

  const lines = [
    `${author.author} 様`,
    ``,
    `いつもお世話になっております。`,
    ``,
    `${year}年${month}月のライセンス料をご報告いたします。`,
    ``,
    `■ 概要`,
    `総公演数: ${author.totalEvents}回`,
    `総ライセンス料: ¥${author.totalLicenseCost.toLocaleString()}`,
    ``,
    `■ 詳細`,
  ]

  author.scenarios.forEach(scenario => {
    const gmTestLabel = scenario.isGMTest ? '（GMテスト）' : ''
    const licenseInfo = `@¥${scenario.licenseAmountPerEvent.toLocaleString()}/回`
    lines.push(`・${scenario.title}${gmTestLabel}: ${scenario.events}回 × ${licenseInfo} = ¥${scenario.licenseCost.toLocaleString()}`)
  })

  lines.push(``)
  lines.push(`■ お支払いについて`)
  lines.push(`お支払い予定日: ${paymentDate}まで`)
  lines.push(``)
  lines.push(`請求書は queens.waltz@gmail.com 宛にお送りください。`)
  lines.push(``)
  lines.push(`何かご不明点がございましたら、お気軽にお問い合わせください。`)
  lines.push(``)
  lines.push(`よろしくお願いいたします。`)

  const body = lines.join('\n')
  const to = email ? `&to=${encodeURIComponent(email)}` : ''

  return `https://mail.google.com/mail/?view=cm&fs=1${to}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/**
 * クリップボードにコピー
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.error('コピーに失敗しました:', err)
    return false
  }
}

