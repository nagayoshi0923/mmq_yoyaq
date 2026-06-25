/**
 * ライセンス料報告メールの本文生成（純関数・テスト対象）
 *
 * SendReports の generateEmailText / generateEmailBodyForItems から抽出（Phase 5-5・挙動不変）。
 * 入力 paidItems は「getPreviewItem で上書き済み＋licenseCost>0 で絞り込み済み」の明細。
 * map(getPreviewItem) と selectedIds フィルタは状態依存のため呼び出し側に残す。副作用なし。
 *
 * 注: 2 つのビルダーは共通テンプレート（emailTemplate）と支払予定日（paymentDateText）を共有するが、
 *   行明細の単価表記だけ挙動差がある:
 *   - buildReportEmailText: 単価に `|| 0` ガードあり（コピー用・防御的）
 *   - buildSendEmailBody:   単価はそのまま toLocaleString（送信用・元の挙動を温存）
 *   元コードの差分をそのまま保つため、明細生成は各関数にインラインで残している。
 */

/** メール本文生成に必要な明細フィールド（getPreviewItem 適用後の ReportItem 部分集合）。 */
export interface ReportEmailItem {
  scenarioTitle: string
  isGMTest?: boolean
  internalEvents: number
  internalLicenseAmount: number
  internalLicenseCost: number
  externalEvents: number
  externalLicenseAmount: number
  externalLicenseCost: number
  events: number
  licenseCost: number
}

/** 振込予定日（翌月20日）の表記。12月は翌年1月に繰り上げ。 */
export function paymentDateText(year: number, month: number): string {
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return `${nextYear}年${nextMonth}月20日`
}

/** 共通テンプレート。概要（合計）・詳細（明細文字列）・支払予定日を差し込む。 */
function emailTemplate(
  authorName: string,
  year: number,
  month: number,
  totalEvents: number,
  totalLicenseCost: number,
  detailText: string,
): string {
  const paymentDate = paymentDateText(year, month)
  return `${authorName} 様

いつもお世話になっております。

${year}年${month}月のライセンス料をご報告いたします。

■ 概要
総公演数: ${totalEvents}回
総ライセンス料: ¥${totalLicenseCost.toLocaleString()}

■ 詳細
${detailText}

■ お支払いについて
お支払い予定日: ${paymentDate}まで

請求書は queens.waltz@gmail.com 宛にお送りください。

何かご不明点がございましたら、お気軽にお問い合わせください。

よろしくお願いいたします。
`
}

/**
 * コピー用メール本文（旧 generateEmailText）。
 * 単価は `|| 0` ガード付き。詳細は「通常公演＋【他店公演分】」を連結。
 */
export function buildReportEmailText(
  authorName: string,
  paidItems: ReportEmailItem[],
  year: number,
  month: number,
): string {
  const totalEvents = paidItems.reduce((sum, item) => sum + item.events, 0)
  const totalLicenseCost = paidItems.reduce((sum, item) => sum + item.licenseCost, 0)

  const normalItems = paidItems.filter(item => item.internalEvents > 0)
  const externalItems = paidItems.filter(item => item.externalEvents > 0)

  const normalText = normalItems.map(item => {
    const gmTestLabel = item.isGMTest ? '（GMテスト）' : ''
    const unitPrice = item.internalLicenseAmount || 0
    const cost = item.internalLicenseCost || 0
    return `・${item.scenarioTitle}${gmTestLabel}: ${item.internalEvents}回 × @¥${unitPrice.toLocaleString()}/回 = ¥${cost.toLocaleString()}`
  }).join('\n')

  const externalText = externalItems.length > 0
    ? '\n\n【他店公演分】\n' + externalItems.map(item => {
        const unitPrice = item.externalLicenseAmount || 0
        const cost = item.externalLicenseCost || 0
        return `・${item.scenarioTitle}: ${item.externalEvents}回 × @¥${unitPrice.toLocaleString()}/回 = ¥${cost.toLocaleString()}`
      }).join('\n')
    : ''

  return emailTemplate(authorName, year, month, totalEvents, totalLicenseCost, normalText + externalText)
}

/**
 * 送信用メール本文（旧 generateEmailBodyForItems）。
 * 単価はそのまま toLocaleString（ガード無し・元の送信挙動を温存）。
 */
export function buildSendEmailBody(
  authorName: string,
  paidItems: ReportEmailItem[],
  year: number,
  month: number,
): string {
  const totalEvents = paidItems.reduce((sum, item) => sum + item.events, 0)
  const totalLicenseCost = paidItems.reduce((sum, item) => sum + item.licenseCost, 0)

  const normalItems = paidItems.filter(item => item.internalEvents > 0)
  const externalItems = paidItems.filter(item => item.externalEvents > 0)

  const normalText = normalItems.map(item => {
    const gmTestLabel = item.isGMTest ? '（GMテスト）' : ''
    const cost = item.internalLicenseCost || 0
    return `・${item.scenarioTitle}${gmTestLabel}: ${item.internalEvents}回 × @¥${item.internalLicenseAmount.toLocaleString()}/回 = ¥${cost.toLocaleString()}`
  }).join('\n')

  const externalText = externalItems.length > 0
    ? '\n\n【他店公演分】\n' + externalItems.map(item => {
        const cost = item.externalLicenseCost || 0
        return `・${item.scenarioTitle}: ${item.externalEvents}回 × @¥${item.externalLicenseAmount.toLocaleString()}/回 = ¥${cost.toLocaleString()}`
      }).join('\n')
    : ''

  return emailTemplate(authorName, year, month, totalEvents, totalLicenseCost, `${normalText}${externalText}`)
}
