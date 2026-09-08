import { calculateCancellation, resolveCancellationPolicy } from './cancellationPolicy.js'

export type FeeAssessment = {
  status: 'payable' | 'free' | 'waived' | 'pending'
  amount: number | null
  percentage: number | null
  reason: string
  receivedAt: string | null
  processedAt: string
  evidence: string | null
}

export const CANCELLATION_PAYMENT_POLICY = '通常のキャンセル料は、連絡を受け付けた時刻と予約時の適用条件に基づいてご案内します。お支払いは銀行振込で、振込先の案内から1週間以内にお振込みください。振込手数料はお客様負担です。公共交通機関の運休が発表され、その影響によるキャンセルの場合は、運営で確認のうえキャンセル料を免除します。確認が必要な場合もキャンセル連絡を受け付け、料金案内は確認後に行います。追加募集の判断待ちに案内された専用リンクからの無料辞退は、リンクの有効期間と案内された人数の範囲でご利用ください。最初にキャンセルを申し出た方への料金は、追加募集を始めたことだけでは免除されません。'

export type BillingReservation = Parameters<typeof resolveCancellationPolicy>[0] & {
  total_price?: number | null
  final_price?: number | null
}

/** Staff processing time must never replace the original customer message time. */
export function assessCancellationFee(input: {
  reservation: BillingReservation
  eventDate: string
  startTime: string
  receivedAt: string | null
  processedAt: string
  cause: 'customer' | 'organizer' | 'transport_pending' | 'transport_confirmed'
  evidence?: string | null
  performanceTotal?: number | null
}): FeeAssessment {
  const result: FeeAssessment = {
    status: 'pending', amount: null, percentage: null,
    reason: 'キャンセル連絡の受付時刻を確認中です。料金案内は保留しています。',
    receivedAt: input.receivedAt, processedAt: input.processedAt, evidence: input.evidence ?? null,
  }
  if (input.cause === 'organizer') return { ...result, status: 'waived', amount: 0, reason: '主催者都合による中止のため、キャンセル料はかかりません。' }
  if (input.cause === 'transport_pending') return { ...result, reason: '運休による免除の対象か運営へ確認中です。キャンセルは受け付け、料金案内を保留しています。' }
  if (input.cause === 'transport_confirmed') {
    if (!input.evidence?.trim()) return { ...result, reason: '公式の運休発表と来店への影響の確認記録が必要です。' }
    return { ...result, status: 'waived', amount: 0, reason: '公共交通機関の運休に伴うキャンセルのため、キャンセル料を免除します。' }
  }
  if (!input.receivedAt || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.receivedAt)
    || !Number.isFinite(Date.parse(input.receivedAt)) || !Number.isFinite(Date.parse(input.processedAt))
    || Date.parse(input.receivedAt) > Date.parse(input.processedAt)) return result
  const policy = resolveCancellationPolicy(input.reservation)
  if (policy.status !== 'ready' || policy.source !== 'reservation_snapshot') {
    return { ...result, reason: '予約時のキャンセル条件を確認できないため、料金案内を保留しています。' }
  }
  const participantTotal = input.reservation.final_price ?? input.reservation.total_price
  const amount = policy.feeBasis === 'performance_total' ? input.performanceTotal : participantTotal
  if (!Number.isSafeInteger(amount) || amount! < 0) return { ...result, reason: '料金計算の基準額を確認中です。' }
  try {
    const calculation = calculateCancellation({
      policy, performanceDate: input.eventDate, performanceStartTime: input.startTime,
      now: input.receivedAt,
      basisAmounts: { participant_total: participantTotal ?? 0, performance_total: input.performanceTotal ?? 0 },
    })
    return { ...result, status: calculation.feeAmount > 0 ? 'payable' : 'free',
      amount: calculation.feeAmount, percentage: calculation.feePercentage,
      reason: `キャンセル連絡の受付時刻と予約時の条件に基づく料率${calculation.feePercentage}%を適用します。` }
  } catch {
    return { ...result, reason: '公演日時を確認できないため、料金案内を保留しています。' }
  }
}

export interface TransferAccount {
  id: string
  bankName: string
  branchName: string
  accountType: '普通' | '当座'
  accountNumber: string
  accountHolder: string
  freeeCompanyId: number
  freeeWalletableId: number
}

export function validTransferAccount(account: TransferAccount): boolean {
  return Boolean(account.id && account.bankName.trim() && account.branchName.trim()
    && ['普通', '当座'].includes(account.accountType) && /^\d{7}$/.test(account.accountNumber)
    && account.accountHolder.trim() && Number.isSafeInteger(account.freeeCompanyId) && account.freeeCompanyId > 0
    && Number.isSafeInteger(account.freeeWalletableId) && account.freeeWalletableId > 0)
}

export function paymentNotice(assessment: FeeAssessment, account: TransferAccount | null, sentAt: string): string {
  if (assessment.status !== 'payable') return assessment.reason
  const fee = `キャンセル料：${assessment.amount!.toLocaleString('ja-JP')}円\n${assessment.reason}`
  if (!account || !validTransferAccount(account)) return `${fee}\n正式な振込先を確認中です。振込先と期限を改めてご案内します。`
  if (!Number.isFinite(Date.parse(sentAt))) throw new Error('案内日時が不正です')
  const due = new Date(Date.parse(sentAt) + 7 * 24 * 60 * 60 * 1000)
  return `${fee}\n\n振込先：${account.bankName} ${account.branchName}\n${account.accountType} ${account.accountNumber}\n口座名義：${account.accountHolder}\n振込期限：${new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(due)}（この案内から1週間以内）\n振込手数料はお客様のご負担となります。`
}

export interface CancellationInvoice {
  id: string
  organizationId: string
  reservationId: string
  amount: number
  payerName: string
  accountIds: string[]
  receivedAt: string
  notifiedAt: string | null
  dueAt: string | null
  paidAt: string | null
}

export interface BankEntry {
  id: string
  organizationId: string
  accountId: string
  date: string
  amount: number
  payerName: string
}

export const normalizePayerName = (value: string) => value.normalize('NFKC').trim().replace(/[\s　]+/g, '').toUpperCase()

/** Exact normalized name + amount + account; no substring or amount-only matching. */
export function reconcileCancellationInvoices(
  invoices: CancellationInvoice[], entries: BankEntry[], usedEntryIds: ReadonlySet<string>,
): { matches: { invoiceId: string; entryId: string }[]; reviewInvoiceIds: string[]; ambiguousInvoiceIds: string[] } {
  const candidates = new Map<string, string[]>()
  const entryClaims = new Map<string, number>()
  // Repeated source IDs are never interpreted as multiple payments.
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1)
  for (const invoice of invoices) {
    if (invoice.paidAt) continue
    const name = normalizePayerName(invoice.payerName)
    const receivedDate = Number.isFinite(Date.parse(invoice.receivedAt))
      ? new Date(Date.parse(invoice.receivedAt) + 9 * 3600_000).toISOString().slice(0, 10) : null
    const ids = entries.filter(entry => receivedDate && name
      && Number.isSafeInteger(invoice.amount) && invoice.amount > 0
      && Number.isSafeInteger(entry.amount) && entry.amount === invoice.amount
      && !usedEntryIds.has(entry.id) && counts.get(entry.id) === 1
      && entry.organizationId === invoice.organizationId && invoice.accountIds.includes(entry.accountId)
      && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && entry.date >= receivedDate
      && normalizePayerName(entry.payerName) === name).map(entry => entry.id)
    candidates.set(invoice.id, ids)
    for (const id of ids) entryClaims.set(id, (entryClaims.get(id) ?? 0) + 1)
  }
  const matches: { invoiceId: string; entryId: string }[] = []
  const reviewInvoiceIds: string[] = []
  const ambiguousInvoiceIds: string[] = []
  for (const [invoiceId, ids] of candidates) {
    if (ids.length === 1 && entryClaims.get(ids[0]) === 1 && invoices.find(i => i.id === invoiceId)?.notifiedAt) matches.push({ invoiceId, entryId: ids[0] })
    else {
      reviewInvoiceIds.push(invoiceId)
      const invoice = invoices.find(i => i.id === invoiceId)!
      if (!normalizePayerName(invoice.payerName) || entries.some(e => !usedEntryIds.has(e.id)
        && e.organizationId === invoice.organizationId && invoice.accountIds.includes(e.accountId) && e.amount === invoice.amount)) ambiguousInvoiceIds.push(invoiceId)
    }
  }
  return { matches, reviewInvoiceIds, ambiguousInvoiceIds }
}

export function canRemindInvoice(invoice: CancellationInvoice, now: string, verifiedThrough: string | null): boolean {
  // freee API retrieval success is not proof that the bank has synchronized through now.
  return !invoice.paidAt && Boolean(invoice.notifiedAt && invoice.dueAt && verifiedThrough)
    && Date.parse(invoice.dueAt!) < Date.parse(now)
    && Date.parse(verifiedThrough!) > Date.parse(invoice.dueAt!)
    && Date.parse(verifiedThrough!) <= Date.parse(now)
    && Date.parse(now) - Date.parse(verifiedThrough!) <= 15 * 60_000
}
