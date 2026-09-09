import { describe, it, expect } from 'vitest'
import { assessCancellationFee, paymentNotice, validTransferAccount, hasFreeeAccount, reconcileCancellationInvoices, canRemindInvoice,
  type TransferAccount, type CancellationInvoice, type BankEntry } from './cancellationBilling'
import { readFreeeIncome, readFreeeSyncStatus } from '../../api/_lib/cancellation-payments/freee'

const reservation = {
  cancellation_policy_snapshot_version: 1, cancellation_policy_store_id: 'store',
  cancellation_policy_performance_type: 'open' as const, cancellation_policy_deadline_hours: 48,
  cancellation_policy_fee_basis: 'participant_total' as const,
  cancellation_policy_updated_at: '2026-09-01T00:00:00Z',
  cancellation_policy_fees: [{ hours_before: 48, fee_percentage: 50, description: '48時間' }, { hours_before: 24, fee_percentage: 100, description: '24時間' }],
  total_price: 8000, final_price: 6000,
}
const input = { reservation, eventDate: '2026-09-10', startTime: '18:00',
  receivedAt: '2026-09-09T12:00:00+09:00', processedAt: '2026-09-10T12:00:00+09:00', cause: 'customer' as const }
const account: TransferAccount = { id: 'account', bankName: 'テスト銀行', branchName: 'テスト支店',
  accountType: '普通', accountNumber: '1234567', accountHolder: 'テスト', freeeCompanyId: 1, freeeWalletableId: 2 }
const invoice: CancellationInvoice = { id: 'invoice', organizationId: 'org', reservationId: 'reservation', amount: 3000,
  payerName: 'テスト タロウ', accountIds: ['account'], receivedAt: input.receivedAt,
  notifiedAt: '2026-09-10T03:00:00Z', dueAt: '2026-09-17T03:00:00Z', paidAt: null }
const entry: BankEntry = { id: '1:2:3', organizationId: 'org', accountId: 'account', date: '2026-09-11', amount: 3000, payerName: 'ﾃｽﾄ ﾀﾛｳ' }

describe('キャンセル料金と入金照合', () => {
  it('スタッフ処理時刻でなく受信時刻の保存条件から50%を計算する', () => {
    expect(assessCancellationFee(input)).toMatchObject({ amount: 3000, percentage: 50, status: 'payable' })
  })
  it('ちょうど24時間前は100%、48時間より前は無料', () => {
    expect(assessCancellationFee({ ...input, receivedAt: '2026-09-09T18:00:00+09:00' }).amount).toBe(6000)
    expect(assessCancellationFee({ ...input, receivedAt: '2026-09-08T17:59:59+09:00' }).status).toBe('free')
  })
  it('時刻不明・未来・保存条件なし・金額なしを0円にしない', () => {
    for (const update of [{ receivedAt: null }, { receivedAt: '2026-09-11T00:00:00Z' }, { receivedAt: '2026-09-09T12:00:00' },
      { reservation: { total_price: 6000 } }, { reservation: { ...reservation, total_price: null, final_price: null } }]) {
      expect(assessCancellationFee({ ...input, ...update })).toMatchObject({ status: 'pending', amount: null })
    }
  })
  it('運休不明は保留、確認記録のある運休と主催者中止は免除', () => {
    expect(assessCancellationFee({ ...input, cause: 'transport_pending' }).status).toBe('pending')
    expect(assessCancellationFee({ ...input, cause: 'transport_confirmed' }).status).toBe('pending')
    expect(assessCancellationFee({ ...input, cause: 'transport_confirmed', evidence: '公式URL・対象路線と来店影響を運営確認' }).status).toBe('waived')
    expect(assessCancellationFee({ ...input, cause: 'organizer' }).amount).toBe(0)
  })
  it('正式口座と案内から7日の期限を含み、口座未確認なら期限を開始しない', () => {
    const assessment = assessCancellationFee(input)
    const text = paymentNotice(assessment, account, '2026-09-10T03:00:00Z')
    expect(text).toContain('2026/09/17 12:00')
    expect(text).toContain('手数料はお客様')
    expect(text).toContain('1234567')
    expect(paymentNotice(assessment, null, '2026-09-10T03:00:00Z')).toContain('振込先と期限を改めて')
  })
  it('表記ゆれのみ正規化し、一対一だけを照合する', () => {
    expect(reconcileCancellationInvoices([invoice], [entry], new Set()).matches).toHaveLength(1)
    for (const entries of [[entry, { ...entry, id: 'another' }], [entry, entry], [{ ...entry, payerName: 'フリコミ テストタロウ' }],
      [{ ...entry, organizationId: 'other' }], [{ ...entry, accountId: 'other' }], [{ ...entry, amount: 2000 }], [{ ...entry, date: '2026-09-01' }]]) {
      expect(reconcileCancellationInvoices([invoice], entries, new Set()).matches).toHaveLength(0)
    }
    expect(reconcileCancellationInvoices([invoice, { ...invoice, id: 'second' }], [entry], new Set()).matches).toHaveLength(0)
    expect(reconcileCancellationInvoices([invoice], [entry], new Set([entry.id])).matches).toHaveLength(0)
    expect(reconcileCancellationInvoices([invoice, { ...invoice, id: 'unnotified', notifiedAt: null }], [entry], new Set()).matches).toHaveLength(0)
    expect(reconcileCancellationInvoices([invoice], [{ ...entry, payerName: '振込 テストタロウ' }], new Set()).ambiguousInvoiceIds).toEqual(['invoice'])
  })
  it('銀行変更後も旧口座への入金を照合できる', () => {
    expect(reconcileCancellationInvoices([{ ...invoice, accountIds: ['account', 'new'] }], [entry], new Set()).matches).toHaveLength(1)
  })
  it('明細の最新性が不明なら未払いリマインドをしない', () => {
    const now = '2026-09-18T00:00:00Z'
    expect(canRemindInvoice(invoice, now, null)).toBe(false)
    expect(canRemindInvoice(invoice, now, invoice.dueAt)).toBe(false)
    expect(canRemindInvoice(invoice, now, now)).toBe(true)
    expect(canRemindInvoice(invoice, now, '2026-09-17T23:00:00Z')).toBe(false)
    expect(canRemindInvoice(invoice, now, '2026-09-18T01:00:00Z')).toBe(false)
    expect(canRemindInvoice({ ...invoice, paidAt: now }, now, now)).toBe(false)
  })
})

describe('freee明細の読み取り', () => {
  const row = { id: 3, company_id: 1, walletable_type: 'bank_account', walletable_id: 2,
    entry_side: 'income', amount: 3000, date: '2026-09-11', description: 'ﾃｽﾄ ﾀﾛｳ' }
  const options = { organizationId: 'org', account, accessToken: 'test-token', startDate: '2026-09-01', endDate: '2026-09-30' }
  it('対象会社・口座の入金だけをGETし、明細IDを維持する', async () => {
    const fetcher = (async (url, init) => {
      const target = new URL(String(url))
      expect(target.origin).toBe('https://api.freee.co.jp')
      expect(target.searchParams.get('walletable_id')).toBe('2')
      expect(target.searchParams.get('entry_side')).toBe('income')
      expect(init?.method).toBe('GET')
      return Response.json({ wallet_txns: [row] })
    }) as typeof fetch
    expect(await readFreeeIncome({ ...options, fetcher })).toEqual([entry])
  })
  it('エラー・他口座・出金・不正応答・重複IDは全体を停止する', async () => {
    for (const response of [new Response('', { status: 401 }), Response.json({}),
      Response.json({ wallet_txns: [{ ...row, walletable_id: 99 }] }),
      Response.json({ wallet_txns: [{ ...row, entry_side: 'expense' }] }),
      Response.json({ wallet_txns: [row, row] })]) {
      await expect(readFreeeIncome({ ...options, fetcher: (async () => response) as typeof fetch })).rejects.toThrow()
    }
  })
  it('対象口座の同期成功時刻だけを採用し、同期中・時刻なしは不明とする', async () => {
    const sync = { id: 2, type: 'bank_account', sync_status: 'success', last_synced_at: '2026-09-11T00:00:00Z' }
    for (const [value, expected] of [[sync, sync.last_synced_at], [{ ...sync, sync_status: 'syncing' }, null], [{ ...sync, last_synced_at: null }, null]] as const) {
      expect(await readFreeeSyncStatus({ account, accessToken: 'test', fetcher: (async (url) => {
        expect(String(url)).toContain('with_last_synced_at=true')
        return Response.json({ walletable: value })
      }) as typeof fetch })).toBe(expected)
    }
  })
})


describe('ブラウザで確認する振込先', () => {
  const browserAccount = { ...account, freeeCompanyId: null, freeeWalletableId: null }
  it('API未接続でも正式口座と振込期限を案内できる', () => {
    expect(validTransferAccount(browserAccount)).toBe(true)
    expect(hasFreeeAccount(browserAccount)).toBe(false)
    const text = paymentNotice(assessCancellationFee(input), browserAccount, input.processedAt)
    expect(text).toContain('1234567')
    expect(text).toContain('振込期限：')
    expect(text).not.toContain('正式な振込先を確認中')
  })
  it('未設定のAPI口座は明細取得・同期確認の通信前に止まる', async () => {
    const fetcher = async () => { throw new Error('通信してはいけない') }
    await expect(readFreeeIncome({ organizationId: 'org', account: browserAccount, accessToken: 'test',
      startDate: '2026-09-01', endDate: '2026-09-08', fetcher })).rejects.toThrow('対象口座が未設定')
    await expect(readFreeeSyncStatus({ account: browserAccount, accessToken: 'test', fetcher })).rejects.toThrow('対象口座が未設定')
  })
})
