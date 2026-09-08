import type { BankEntry, TransferAccount } from '../../../src/lib/cancellationBilling.js'

export async function readFreeeSyncStatus(input: { account: TransferAccount; accessToken: string; fetcher?: typeof fetch }): Promise<string | null> {
  const url = new URL(`https://api.freee.co.jp/api/1/walletables/bank_account/${input.account.freeeWalletableId}`)
  url.search = new URLSearchParams({ company_id: String(input.account.freeeCompanyId), with_last_synced_at: 'true', with_sync_status: 'true' }).toString()
  const response = await (input.fetcher ?? fetch)(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${input.accessToken}`, Accept: 'application/json' } })
  if (!response.ok) throw new Error('freeeの銀行同期状況を確認できません。')
  const data = await response.json() as { walletable?: { id?: number; type?: string; sync_status?: string; last_synced_at?: string } }
  const wallet = data.walletable
  if (!wallet || wallet.id !== input.account.freeeWalletableId || wallet.type !== 'bank_account') throw new Error('freeeの対象口座を確認できません。')
  return wallet.sync_status === 'success' && wallet.last_synced_at && Number.isFinite(Date.parse(wallet.last_synced_at))
    ? wallet.last_synced_at : null
}

/** Only read bank statements. No deal creation, settlement, transfer, or bank refresh. */
export async function readFreeeIncome(input: {
  organizationId: string
  account: TransferAccount
  accessToken: string
  startDate: string
  endDate: string
  fetcher?: typeof fetch
}): Promise<BankEntry[]> {
  if (!input.accessToken) throw new Error('freeeの読み取り認証が未設定です')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)
    || input.startDate > input.endDate) throw new Error('明細取得期間が不正です')
  const fetcher = input.fetcher ?? fetch
  const result: BankEntry[] = []
  const seen = new Set<string>()
  for (let page = 0; page < 100; page++) {
    const url = new URL('https://api.freee.co.jp/api/1/wallet_txns')
    url.search = new URLSearchParams({
      company_id: String(input.account.freeeCompanyId), walletable_type: 'bank_account',
      walletable_id: String(input.account.freeeWalletableId), entry_side: 'income',
      start_date: input.startDate, end_date: input.endDate, limit: '100', offset: String(page * 100),
    }).toString()
    const response = await fetcher(url, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${input.accessToken}`, Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`freee明細取得に失敗しました（HTTP ${response.status}）。未入金とは判定しません。`)
    const payload = await response.json() as { wallet_txns?: Record<string, unknown>[] }
    if (!Array.isArray(payload.wallet_txns)) throw new Error('freee明細の応答形式を確認できません')
    for (const row of payload.wallet_txns) {
      if (!Number.isSafeInteger(row.id) || Number(row.id) <= 0 || row.walletable_type !== 'bank_account'
        || row.walletable_id !== input.account.freeeWalletableId
        || row.company_id !== input.account.freeeCompanyId
        || row.entry_side !== 'income' || !Number.isSafeInteger(row.amount) || Number(row.amount) <= 0
        || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
        || row.date < input.startDate || row.date > input.endDate || typeof row.description !== 'string') {
        throw new Error('freee明細の口座・金額・日付を確認できません。照合を中止しました。')
      }
      const id = `${input.account.freeeCompanyId}:${input.account.freeeWalletableId}:${row.id}`
      if (seen.has(id)) throw new Error('freee明細に重複IDがあります。全件再取得が必要です。')
      seen.add(id)
      result.push({ id, organizationId: input.organizationId, accountId: input.account.id,
        date: row.date, amount: Number(row.amount), payerName: row.description })
    }
    if (payload.wallet_txns.length < 100) return result
  }
  throw new Error('freee明細の取得上限に達しました。期間を短くして再取得してください。')
}
