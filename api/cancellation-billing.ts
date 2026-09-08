import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { db } from './_lib/db.js'
import { requireAuth, ApiError } from './_lib/auth.js'
import { readFreeeIncome, readFreeeSyncStatus } from './_lib/cancellation-payments/freee.js'
import { assessCancellationFee, paymentNotice, validTransferAccount, hasFreeeAccount, reconcileCancellationInvoices, canRemindInvoice, CANCELLATION_PAYMENT_POLICY,
  cancellationNoticeChannel, type TransferAccount, type CancellationInvoice, type FeeAssessment, type BankEntry } from '../src/lib/cancellationBilling.js'

type Settings = { accounts: TransferAccount[]; activeAccountId: string | null; operatorEmail: string;
  matchingApproved: boolean; notificationsEnabled: boolean }
type ClaimData = CancellationInvoice & { assessment: FeeAssessment; accountId: string | null; needsDecisionNotice?: boolean;
  reminderSentAt: string | null; paidNoticeSentAt: string | null; actorId: string; receiptEvidence: string }
type ClaimRow = { id: string; reservation_id: string; revision: number; data: ClaimData }
type Reconciliation = { verifiedThrough: string | null; startDate: string; endDate: string; ambiguousInvoiceIds: string[]; settingsRevision: number }
const defaults: Settings = { accounts: [], activeAccountId: null, operatorEmail: '', matchingApproved: false, notificationsEnabled: false }
const uuid = z.string().uuid()
const time = z.string().datetime({ offset: true })
const accountSchema = z.object({
  bankName: z.string().trim().min(1).max(100), branchName: z.string().trim().min(1).max(100),
  accountType: z.enum(['普通', '当座']), accountNumber: z.string().regex(/^\d{7}$/),
  accountHolder: z.string().trim().min(1).max(100), freeeCompanyId: z.number().int().positive().safe().nullish(),
  freeeWalletableId: z.number().int().positive().safe().nullish(),
})
const settingsSchema = z.object({ revision: z.number().int().min(0), newAccount: accountSchema.optional(),
  operatorEmail: z.email(), matchingApproved: z.boolean(), notificationsEnabled: z.boolean() })
const intakeSchema = z.object({ reservationId: uuid, receivedAt: time.nullable(), receiptEvidence: z.string().trim().min(1).max(1000),
  cause: z.enum(['customer', 'organizer', 'transport_pending', 'transport_confirmed']),
  evidence: z.string().max(2000).optional(), payerName: z.string().trim().max(100),
  contact: z.object({ channel: z.enum(['mmq', 'company_email', 'manual']), messageId: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(200).optional(), threadId: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(200).optional() }).optional(),
  revision: z.number().int().min(0), apply: z.boolean().default(false) })

function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new ApiError(503, 'キャンセル料台帳の読み書きに失敗しました。再取得して確認してください。')
  return result.data
}
async function getSettings(org: string) {
  const row = checked(await db!.from('cancellation_billing_settings').select('revision,data').eq('organization_id', org).maybeSingle())
  return { revision: (row?.revision as number) ?? 0, data: (row?.data as Settings) ?? defaults }
}
async function getClaims(org: string): Promise<ClaimRow[]> {
  const rows = checked(await db!.from('cancellation_billing_claims').select('id,reservation_id,revision,data')
    .eq('organization_id', org).order('updated_at', { ascending: false }).limit(1001)) as ClaimRow[]
  if (rows.length > 1000) throw new ApiError(409, '請求件数が取得上限を超えています。照合を実行せず、運営へ確認してください。')
  return rows
}
async function recentCancellations(org: string) {
  return checked(await db!.from('reservations').select('id,reservation_number,title,cancelled_at')
    .eq('organization_id', org).eq('status', 'cancelled').order('cancelled_at', { ascending: false }).limit(100)) ?? []
}
async function saveClaim(org: string, row: ClaimRow, data: ClaimData, noticeKey: string | null = null) {
  const updated = checked(await db!.rpc('update_cancellation_billing_claim', { p_organization_id: org,
    p_claim_id: row.id, p_revision: row.revision, p_data: data, p_notice_key: noticeKey }))
  if (updated !== true) throw new ApiError(409, '請求が更新されたか、連絡の処理中です。再取得してください。')
}

async function saveSettings(org: string, body: unknown) {
  const input = settingsSchema.parse(body)
  const current = await getSettings(org)
  if (current.revision !== input.revision) throw new ApiError(409, '設定が更新されました。再取得してください。')
  const data: Settings = { ...current.data, operatorEmail: input.operatorEmail,
    matchingApproved: input.matchingApproved, notificationsEnabled: input.notificationsEnabled }
  if (input.newAccount) {
    // Past account versions are immutable so already-notified invoices remain reconcilable.
    const account = { ...input.newAccount, id: randomUUID() }
    if (!validTransferAccount(account)) throw new ApiError(400, '振込先を確認してください。')
    data.accounts = [...data.accounts, account]
    data.activeAccountId = account.id
  }
  if (data.accounts.length > 20) throw new ApiError(400, '口座の登録上限です。運営へ確認してください。')
  if (data.matchingApproved && !data.activeAccountId) throw new ApiError(400, '照合前に振込先口座を登録してください。')
  if (current.revision === 0) {
    checked(await db!.from('cancellation_billing_settings').insert({ organization_id: org, revision: 1, data }))
  } else {
    const saved = checked(await db!.from('cancellation_billing_settings').update({ revision: current.revision + 1, data, updated_at: new Date().toISOString() })
      .eq('organization_id', org).eq('revision', current.revision).select('organization_id'))
    if (!saved?.length) throw new ApiError(409, '設定が更新されました。再取得してください。')
  }
  return { success: true }
}

async function intake(org: string, actorId: string, body: unknown) {
  const input = intakeSchema.parse(body)
  const reservation = checked(await db!.from('reservations')
    .select('id,status,cancelled_at,total_price,final_price,cancellation_policy_snapshot_version,cancellation_policy_store_id,cancellation_policy_performance_type,cancellation_policy_deadline_hours,cancellation_policy_fees,cancellation_policy_fee_basis,cancellation_policy_updated_at,schedule_event_id')
    .eq('organization_id', org).eq('id', input.reservationId).maybeSingle())
  if (!reservation) throw new ApiError(404, '予約が見つかりません。')
  if (reservation.status !== 'cancelled') throw new ApiError(409, '先に予約のキャンセル受付を完了してください。')
  const event = reservation.schedule_event_id ? checked(await db!.from('schedule_events')
    .select('date,start_time,is_cancelled').eq('organization_id', org).eq('id', reservation.schedule_event_id).maybeSingle()) : null
  if (input.cause === 'organizer' && !event?.is_cancelled) throw new ApiError(400, '主催者都合は、公演中止がMMQに記録されている場合だけ選択できます。')
  if (input.cause === 'transport_confirmed' && !input.evidence?.trim()) throw new ApiError(400, '公式発表URLと来店への影響を記録してください。')
  const settings = await getSettings(org)
  const account = settings.data.accounts.find(a => a.id === settings.data.activeAccountId) ?? null
  const now = new Date().toISOString()
  const assessment = assessCancellationFee({ reservation, eventDate: event?.date ?? '', startTime: event?.start_time ?? '',
    receivedAt: input.receivedAt, processedAt: now, cause: input.cause, evidence: input.evidence })
  const preview = paymentNotice(assessment, account, now)
  if (!input.apply) return { assessment, preview }
  const existing = checked(await db!.from('cancellation_billing_claims').select('id,reservation_id,revision,data')
    .eq('organization_id', org).eq('reservation_id', input.reservationId).maybeSingle()) as ClaimRow | null
  if (input.contact?.channel === 'mmq' && existing?.data.contact?.channel !== 'mmq') throw new ApiError(400, '会社メール・電話の受付をMMQ自動送信へ変更できません。')
  if ((existing?.revision ?? 0) !== input.revision) throw new ApiError(409, '請求が更新されました。再取得してください。')
  if (existing?.data.notifiedAt || existing?.data.paidAt) throw new ApiError(409, '案内済みの請求は変更できません。訂正処理を運営へ確認してください。')
  const id = existing?.id ?? randomUUID()
  const data: ClaimData = { id, organizationId: org, reservationId: input.reservationId, assessment,
    amount: assessment.amount ?? 0, receivedAt: input.receivedAt ?? '', payerName: input.payerName,
    contact: input.contact ?? existing?.data.contact ?? { channel: 'manual' },
    receiptEvidence: input.receiptEvidence, actorId, needsDecisionNotice: true, accountIds: account ? [account.id] : [], accountId: account?.id ?? null,
    notifiedAt: null, dueAt: null, paidAt: null, reminderSentAt: null, paidNoticeSentAt: null }
  if (existing) await saveClaim(org, existing, data)
  else checked(await db!.from('cancellation_billing_claims').insert({ id, organization_id: org, reservation_id: input.reservationId, data }))
  return { success: true, assessment, preview }
}

async function reconcile(org: string, body: unknown) {
  const input = z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), apply: z.boolean().default(false) }).parse(body)
  const settings = await getSettings(org)
  if (org !== process.env.CANCELLATION_BILLING_ORGANIZATION_ID || !process.env.FREEE_ACCESS_TOKEN) {
    throw new ApiError(503, 'この組織のfreee API認証が未接続です。未入金とは判定しません。')
  }
  const claims = await getClaims(org)
  if (input.apply) {
    const jstDate = (t: string) => new Date(Date.parse(t) + 9 * 3600_000).toISOString().slice(0, 10)
    const outstanding = claims.filter(c => c.data.assessment.status === 'payable' && !c.data.paidAt && c.data.receivedAt)
    const earliest = outstanding.map(c => jstDate(c.data.receivedAt)).sort()[0]
    if ((earliest && input.startDate > earliest) || input.endDate < jstDate(new Date().toISOString())) {
      throw new ApiError(409, '入金確定には未払い請求の最初の受付日から本日までの全明細が必要です。期間を広げてください。')
    }
  }
  const entries: BankEntry[] = []
  // An immutable account version can point to the same freee wallet. Fetch it only once,
  // then use all version IDs when matching (a bank-name edit is not a second deposit).
  if (!settings.data.accounts.length || settings.data.accounts.some(account => !hasFreeeAccount(account))) {
    throw new ApiError(409, 'API照合には旧口座を含む全振込先のfreee事業所・口座の確認が必要です。ブラウザでの明細確認とは別に設定してください。')
  }
  const wallets = new Map<string, TransferAccount>()
  for (const account of settings.data.accounts) wallets.set(`${account.freeeCompanyId}:${account.freeeWalletableId}`, account)
  const synced: (string | null)[] = []
  for (const account of wallets.values()) {
    const token = process.env.FREEE_ACCESS_TOKEN
    const before = await readFreeeSyncStatus({ account, accessToken: token })
    entries.push(...await readFreeeIncome({ organizationId: org, account, accessToken: token, startDate: input.startDate, endDate: input.endDate }))
    const after = await readFreeeSyncStatus({ account, accessToken: token })
    if (before !== after) throw new ApiError(409, '明細取得中に銀行同期が更新されました。再取得してください。')
    synced.push(after)
  }
  const used = checked(await db!.from('cancellation_billing_matches').select('entry_id').eq('organization_id', org).limit(10001)) ?? []
  if (used.length > 10000) throw new ApiError(409, '照合履歴の取得上限です。実行を停止しました。')
  const invoices = claims.filter(c => c.data.assessment.status === 'payable').map(c => ({ ...c.data,
    accountIds: c.data.accountIds.map(id => {
      const a = settings.data.accounts.find(item => item.id === id)
      return a ? wallets.get(`${a.freeeCompanyId}:${a.freeeWalletableId}`)!.id : id
    }) }))
  const result = reconcileCancellationInvoices(invoices, entries, new Set(used.map(row => row.entry_id)))
  if (input.apply && !settings.data.matchingApproved) throw new ApiError(409, '照合条件の確認が済んでいません。プレビューを確認してください。')
  if (input.apply && (!synced.length || !synced.every(Boolean))) throw new ApiError(409, '銀行の同期成功を確認できないため、自動入金確定を保留しました。')
  const settled: string[] = [], conflicts: string[] = []
  if (input.apply) for (const match of result.matches) {
    const claim = claims.find(c => c.id === match.invoiceId)!
    const snapshot = claims.map(c => ({ id: c.id, revision: c.revision })).sort((a, b) => a.id.localeCompare(b.id))
    const ok = checked(await db!.rpc('settle_cancellation_billing_snapshot', { p_organization_id: org,
      p_claim_id: claim.id, p_revision: claim.revision, p_entry_id: match.entryId, p_snapshot: snapshot }))
    if (ok === true) claim.revision += 1
    ;(ok === true ? settled : conflicts).push(claim.id)
  }
  const verifiedThrough = synced.length && synced.every(Boolean) && !conflicts.length
    ? new Date(Math.min(...synced.map(t => Date.parse(t!)))).toISOString() : null
  if (input.apply) checked(await db!.from('cancellation_billing_reconciliations').upsert({ organization_id: org,
    data: { verifiedThrough, startDate: input.startDate, endDate: input.endDate, ambiguousInvoiceIds: result.ambiguousInvoiceIds,
      settingsRevision: settings.revision }, updated_at: new Date().toISOString() }))
  // No descriptions or raw banking data in the API response or logs.
  return { ...result, entryCount: entries.length, settled, conflicts, verifiedThrough }
}

type Notice = { claimId: string; reservationId: string; key: string; kind: 'initial' | 'reminder' | 'paid' | 'account_changed' | 'review'; text: string; operator: boolean }
function planNotice(row: ClaimRow, settings: Settings, now: string, reconciliation: Reconciliation | null): Notice | null {
  const c = row.data
  const base = { claimId: row.id, reservationId: row.reservation_id, operator: false }
  const active = settings.accounts.find(a => a.id === settings.activeAccountId) ?? null
  if (c.paidAt && !c.paidNoticeSentAt) return { ...base, key: `${row.id}:paid`, kind: 'paid', text: `キャンセル料${c.amount.toLocaleString('ja-JP')}円の入金を確認しました。お振込みありがとうございました。` }
  if (c.paidAt) return null
  if (c.assessment.status === 'pending' || (c.assessment.status === 'payable' && !active)) {
    return { ...base, key: `${row.id}:review:${row.revision}`, kind: 'review', operator: true, text: `キャンセル料の確認が必要です。予約ID: ${row.reservation_id}\n${c.assessment.reason}` }
  }
  if (c.assessment.status !== 'payable') return c.needsDecisionNotice && !c.notifiedAt
    ? { ...base, key: `${row.id}:initial`, kind: 'initial', text: c.assessment.reason } : null
  if (!c.notifiedAt) return { ...base, key: `${row.id}:initial`, kind: 'initial', text: paymentNotice(c.assessment, active, now) }
  if (active && c.accountId !== active.id) return { ...base, key: `${row.id}:account:${active.id}`, kind: 'account_changed',
    text: `キャンセル料の振込先が変更になりました。今後のお振込みは下記口座へお願いいたします。行き違いでお振込み済みの場合はご連絡ください。\n\n${paymentNotice(c.assessment, active, c.notifiedAt)}` }
  const jstDate = (t: string) => new Date(Date.parse(t) + 9 * 3600_000).toISOString().slice(0, 10)
  const covered = reconciliation && reconciliation.startDate <= jstDate(c.receivedAt)
    && reconciliation.endDate >= jstDate(now) && !reconciliation.ambiguousInvoiceIds.includes(row.id)
  if (!c.reminderSentAt && covered && canRemindInvoice(c, now, reconciliation.verifiedThrough)) return { ...base, key: `${row.id}:reminder`, kind: 'reminder', text: `振込期限を過ぎています。ご入金状況をご確認ください。行き違いでお振込み済みの場合はご容赦ください。\n${paymentNotice(c.assessment, active, c.notifiedAt)}` }
  return null
}

async function notices(org: string, body: unknown) {
  const input = z.object({ apply: z.boolean().default(false), claimId: uuid.optional() }).parse(body)
  const settings = await getSettings(org)
  const claims = await getClaims(org)
  const now = new Date().toISOString()
  const reconciliationRow = checked(await db!.from('cancellation_billing_reconciliations').select('data').eq('organization_id', org).maybeSingle())
  const reconciliation = reconciliationRow?.data as Reconciliation | undefined
  const verified = reconciliation?.settingsRevision === settings.revision ? reconciliation : null
  const plans = claims.filter(c => !input.claimId || c.id === input.claimId).map(row => ({ row, plan: planNotice(row, settings.data, now, verified) }))
    .filter((item): item is { row: ClaimRow; plan: Notice } => item.plan !== null)
  const past = checked(await db!.from('cancellation_billing_notices').select('notice_key,status').eq('organization_id', org).limit(10001)) ?? []
  if (past.length > 10000) throw new ApiError(409, '通知履歴の取得上限です。配信を停止しました。')
  const pending = plans.filter(item => !past.some(p => p.notice_key === item.plan.key))
  const routed = pending.map(p => ({ ...p.plan, deliveryChannel: p.plan.operator ? 'operator' : cancellationNoticeChannel(p.row.data.contact), contact: p.row.data.contact ?? null }))
  if (!input.apply) return { notices: routed, unknown: past.filter(p => p.status !== 'sent'),
    verifiedThrough: verified?.verifiedThrough ?? null }
  if (!pending.some(p => p.plan.operator || cancellationNoticeChannel(p.row.data.contact) === 'mmq')) {
    return { sent: [], unknown: [], companyReplies: routed.filter(p => p.deliveryChannel === 'company_email'), manual: routed.filter(p => p.deliveryChannel === 'manual') }
  }
  if (!settings.data.notificationsEnabled || process.env.CANCELLATION_BILLING_SEND_ENABLED !== 'true'
    || org !== process.env.CANCELLATION_BILLING_ORGANIZATION_ID) throw new ApiError(409, 'この組織の自動連絡は未有効です。プレビューだけ実行できます。')
  const emailSettings = checked(await db!.from('organization_settings').select('resend_api_key,sender_email,reply_to_email')
    .eq('organization_id', org).maybeSingle())
  if (!emailSettings?.resend_api_key || !emailSettings?.sender_email || !settings.data.operatorEmail) throw new ApiError(409, '送信元・API認証・運営通知先を設定してください。')
  const sent: string[] = [], unknown: string[] = []
  const companyReplies = routed.filter(p => p.deliveryChannel === 'company_email')
  const manual = routed.filter(p => p.deliveryChannel === 'manual')
  for (const { row } of pending.slice(0, 20)) {
    const dispatchAt = new Date().toISOString()
    const plan = planNotice(row, settings.data, dispatchAt, verified)
    if (!plan) continue
    // Company correspondence stays in the original company mailbox thread.
    // No fallback to a new MMQ message, including reminders and payment acknowledgements.
    if (!plan.operator && cancellationNoticeChannel(row.data.contact) !== 'mmq') continue
    const reservation = checked(await db!.from('reservations').select('customer_email,customer_id')
      .eq('organization_id', org).eq('id', row.reservation_id).maybeSingle())
    if (!reservation) continue
    let recipient = reservation.customer_email as string | null
    if (!recipient && reservation.customer_id) {
      const customer = checked(await db!.from('customers').select('email').eq('id', reservation.customer_id).maybeSingle())
      recipient = customer?.email ?? null // customer identity comes only from this org's reservation
    }
    if (plan.operator) recipient = settings.data.operatorEmail
    if (!recipient || !z.email().safeParse(recipient).success) continue
    const claimed = checked(await db!.rpc('claim_cancellation_billing_notice', { p_organization_id: org,
      p_claim_id: row.id, p_revision: row.revision, p_notice_key: plan.key, p_kind: plan.kind }))
    if (claimed !== true) continue
    // No blind retries after an ambiguous provider response. Unique notice keys stop duplicates.
    try {
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${emailSettings.resend_api_key}`, 'Content-Type': 'application/json', 'Idempotency-Key': plan.key },
        body: JSON.stringify({ from: emailSettings.sender_email, to: [recipient],
          ...(plan.kind === 'reminder' ? { bcc: [settings.data.operatorEmail] } : {}),
          ...(emailSettings.reply_to_email ? { reply_to: emailSettings.reply_to_email } : {}),
          subject: plan.operator ? 'キャンセル料の確認依頼' : 'キャンセル料についてのご案内', text: plan.text }) })
      const result = await response.json() as { id?: string }
      if (!response.ok || !result.id) throw new Error('配信結果を確認できません')
      const data = { ...row.data }
      const active = settings.data.accounts.find(a => a.id === settings.data.activeAccountId)
      if (plan.kind === 'initial') { data.notifiedAt = dispatchAt; data.dueAt = data.assessment.status === 'payable' ? new Date(Date.parse(dispatchAt) + 7 * 86400_000).toISOString() : null }
      if ((plan.kind === 'initial' || plan.kind === 'account_changed') && active) {
        data.accountId = active.id; data.accountIds = [...new Set([...data.accountIds, active.id])]
      }
      if (plan.kind === 'paid') data.paidNoticeSentAt = dispatchAt
      if (plan.kind === 'reminder') data.reminderSentAt = dispatchAt
      if (plan.kind !== 'review') await saveClaim(org, row, data, plan.key)
      checked(await db!.from('cancellation_billing_notices').update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('organization_id', org).eq('notice_key', plan.key))
      sent.push(plan.key)
    } catch {
      checked(await db!.from('cancellation_billing_notices').update({ status: 'unknown' }).eq('organization_id', org).eq('notice_key', plan.key))
      unknown.push(plan.key)
    }
  }
  return { sent, unknown, companyReplies, manual }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method === 'POST' && req.query.action === 'run') {
      const actual = Buffer.from(req.headers.authorization ?? '')
      const expected = Buffer.from(`Bearer ${process.env.CANCELLATION_BILLING_WORKER_SECRET ?? ''}`)
      const org = process.env.CANCELLATION_BILLING_ORGANIZATION_ID
      if (!process.env.CANCELLATION_BILLING_WORKER_SECRET || !org || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ApiError(401, '実行認証が必要です。')
      if (!db) throw new ApiError(503, '台帳に接続できません。')
      const settings = await getSettings(org)
      if (!settings.data.matchingApproved) return res.status(200).json({ skipped: true, reason: '照合条件未承認' })
      const claims = (await getClaims(org)).filter(c => c.data.assessment.status === 'payable' && !c.data.paidAt && c.data.receivedAt)
      const jstDate = (t: string) => new Date(Date.parse(t) + 9 * 3600_000).toISOString().slice(0, 10)
      const endDate = jstDate(new Date().toISOString())
      const startDate = claims.length ? claims.map(c => jstDate(c.data.receivedAt)).sort()[0] : endDate
      const matched = await reconcile(org, { startDate, endDate, apply: true })
      const notified = await notices(org, { apply: settings.data.notificationsEnabled && process.env.CANCELLATION_BILLING_SEND_ENABLED === 'true' })
      return res.status(200).json({ matched, notified })
    }
    if (req.method === 'GET' && req.query.action === 'public-policy') {
      const slug = z.string().trim().min(1).max(100).parse(req.query.organization)
      if (!db) throw new ApiError(503, '公開ポリシーを取得できません。')
      const org = checked(await db.from('organizations').select('id').eq('slug', slug).maybeSingle())
      if (!org) return res.status(404).json({ error: '組織が見つかりません。' })
      const settings = await getSettings(org.id)
      // Account numbers, freee IDs, notification state and claims are never public.
      return res.status(200).json({ paymentPolicy: settings.revision > 0 ? CANCELLATION_PAYMENT_POLICY : null })
    }
    const user = await requireAuth(req)
    if (user.role !== 'admin' || !user.orgId) throw new ApiError(403, 'この操作は組織管理者に限ります。')
    if (!db) throw new ApiError(503, '台帳に接続できません。')
    if (req.method === 'GET') {
      const [settings, claims, cancelledReservations] = await Promise.all([getSettings(user.orgId), getClaims(user.orgId), recentCancellations(user.orgId)])
      return res.status(200).json({ settings, claims, cancelledReservations, freeeConnected: user.orgId === process.env.CANCELLATION_BILLING_ORGANIZATION_ID && Boolean(process.env.FREEE_ACCESS_TOKEN) })
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }) }
    switch (req.query.action) {
      case 'settings': return res.status(200).json(await saveSettings(user.orgId, req.body))
      case 'intake': return res.status(200).json(await intake(user.orgId, user.userId, req.body))
      case 'reconcile': return res.status(200).json(await reconcile(user.orgId, req.body))
      case 'notices': return res.status(200).json(await notices(user.orgId, req.body))
      default: throw new ApiError(400, '操作が不正です。')
    }
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: '入力内容を確認してください。' })
    return res.status(error instanceof ApiError ? error.status : 503).json({ error: error instanceof ApiError ? error.message : '処理を完了できませんでした。運営へ確認してください。' })
  }
}
