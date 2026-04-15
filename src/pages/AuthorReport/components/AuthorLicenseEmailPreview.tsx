import type { AuthorPerformance } from '../types'

interface AuthorLicenseEmailPreviewProps {
  author: AuthorPerformance
  year: number
  month: number
  email: string
}

export function AuthorLicenseEmailPreview({
  author,
  year,
  month,
}: AuthorLicenseEmailPreviewProps) {
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const paymentDate = `${nextYear}年${nextMonth}月20日`

  const formatYen = (value: number) => value.toLocaleString()

  const scenarioLines = author.scenarios.map(scenario => {
    const gmTestLabel = scenario.isGMTest ? '（GMテスト）' : ''
    const licenseAmount = scenario.licenseAmountPerEvent ?? 0
    const events = scenario.events ?? 0
    const cost = scenario.licenseCost ?? 0
    return `・${scenario.title}${gmTestLabel}: ${events}回 × @¥${formatYen(licenseAmount)}/回 = ¥${formatYen(cost)}`
  }).join('\n')

  const plainText = `${author.author} 様

いつもお世話になっております。

${year}年${month}月のライセンス料をご報告いたします。

■ 概要
総公演数: ${author.totalEvents}回
総ライセンス料: ¥${formatYen(author.totalLicenseCost)}

■ 詳細
${scenarioLines}

■ お支払いについて
お支払い予定日: ${paymentDate}まで

請求書は queens.waltz@gmail.com 宛にお送りください。

何かご不明点がございましたら、お気軽にお問い合わせください。

よろしくお願いいたします。

━━━━━━━━━━━━━━━━━━━━
MMQ
このメールは自動送信されています
ご不明な点がございましたら、お気軽にお問い合わせください`

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        件名: 【{year}年{month}月】ライセンス料レポート - {author.author}
      </p>
      <pre className="border rounded-lg p-4 bg-muted text-sm font-mono whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto">
        {plainText}
      </pre>
    </div>
  )
}
