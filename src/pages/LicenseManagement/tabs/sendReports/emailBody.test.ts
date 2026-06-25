import { describe, expect, it } from 'vitest'
import {
  paymentDateText,
  buildReportEmailText,
  buildSendEmailBody,
  type ReportEmailItem,
} from './emailBody'

// テスト用に必要なフィールドだけ持つ明細を作る（getPreviewItem 適用後を想定）
function item(overrides: Partial<ReportEmailItem> = {}): ReportEmailItem {
  return {
    scenarioTitle: 'シナリオA',
    isGMTest: false,
    internalEvents: 0,
    internalLicenseAmount: 0,
    internalLicenseCost: 0,
    externalEvents: 0,
    externalLicenseAmount: 0,
    externalLicenseCost: 0,
    events: 0,
    licenseCost: 0,
    ...overrides,
  }
}

describe('paymentDateText', () => {
  it('翌月20日を返す', () => {
    expect(paymentDateText(2026, 6)).toBe('2026年7月20日')
  })
  it('12月は翌年1月20日に繰り上げ', () => {
    expect(paymentDateText(2026, 12)).toBe('2027年1月20日')
  })
})

describe('buildReportEmailText（コピー用）', () => {
  it('通常公演のみの本文を組み立てる', () => {
    const paidItems = [
      item({ scenarioTitle: 'シナリオA', internalEvents: 3, internalLicenseAmount: 1000, internalLicenseCost: 3000, events: 3, licenseCost: 3000 }),
    ]
    expect(buildReportEmailText('テスト作家', paidItems, 2026, 6)).toBe(
`テスト作家 様

いつもお世話になっております。

2026年6月のライセンス料をご報告いたします。

■ 概要
総公演数: 3回
総ライセンス料: ¥3,000

■ 詳細
・シナリオA: 3回 × @¥1,000/回 = ¥3,000

■ お支払いについて
お支払い予定日: 2026年7月20日まで

請求書は queens.waltz@gmail.com 宛にお送りください。

何かご不明点がございましたら、お気軽にお問い合わせください。

よろしくお願いいたします。
`)
  })

  it('GMテストラベル・他店公演分・合計を含む', () => {
    const paidItems = [
      item({ scenarioTitle: 'シナリオA', isGMTest: true, internalEvents: 2, internalLicenseAmount: 1500, internalLicenseCost: 3000, events: 2, licenseCost: 3000 }),
      item({ scenarioTitle: 'シナリオB', externalEvents: 4, externalLicenseAmount: 800, externalLicenseCost: 3200, events: 4, licenseCost: 3200 }),
    ]
    expect(buildReportEmailText('作家X', paidItems, 2026, 12)).toBe(
`作家X 様

いつもお世話になっております。

2026年12月のライセンス料をご報告いたします。

■ 概要
総公演数: 6回
総ライセンス料: ¥6,200

■ 詳細
・シナリオA（GMテスト）: 2回 × @¥1,500/回 = ¥3,000

【他店公演分】
・シナリオB: 4回 × @¥800/回 = ¥3,200

■ お支払いについて
お支払い予定日: 2027年1月20日まで

請求書は queens.waltz@gmail.com 宛にお送りください。

何かご不明点がございましたら、お気軽にお問い合わせください。

よろしくお願いいたします。
`)
  })

  it('明細が空なら詳細セクションは空行になる', () => {
    expect(buildReportEmailText('作家Y', [], 2026, 6)).toContain('■ 詳細\n\n\n■ お支払いについて')
  })
})

describe('buildSendEmailBody（送信用）', () => {
  it('通常公演のみ・コピー用と同一の本文を組み立てる', () => {
    const paidItems = [
      item({ scenarioTitle: 'シナリオA', internalEvents: 3, internalLicenseAmount: 1000, internalLicenseCost: 3000, events: 3, licenseCost: 3000 }),
    ]
    // 単価が非ゼロの通常入力では送信用とコピー用は同一出力
    expect(buildSendEmailBody('テスト作家', paidItems, 2026, 6)).toBe(
      buildReportEmailText('テスト作家', paidItems, 2026, 6),
    )
  })

  it('他店公演分も含めて組み立てる', () => {
    const paidItems = [
      item({ scenarioTitle: 'シナリオA', internalEvents: 2, internalLicenseAmount: 1500, internalLicenseCost: 3000, events: 2, licenseCost: 3000 }),
      item({ scenarioTitle: 'シナリオB', externalEvents: 4, externalLicenseAmount: 800, externalLicenseCost: 3200, events: 4, licenseCost: 3200 }),
    ]
    expect(buildSendEmailBody('作家X', paidItems, 2026, 6)).toBe(
`作家X 様

いつもお世話になっております。

2026年6月のライセンス料をご報告いたします。

■ 概要
総公演数: 6回
総ライセンス料: ¥6,200

■ 詳細
・シナリオA: 2回 × @¥1,500/回 = ¥3,000

【他店公演分】
・シナリオB: 4回 × @¥800/回 = ¥3,200

■ お支払いについて
お支払い予定日: 2026年7月20日まで

請求書は queens.waltz@gmail.com 宛にお送りください。

何かご不明点がございましたら、お気軽にお問い合わせください。

よろしくお願いいたします。
`)
  })
})
