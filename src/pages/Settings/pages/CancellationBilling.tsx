import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/PageHeader'
import type { TransferAccount, FeeAssessment, CancellationInvoice } from '@/lib/cancellationBilling'

type Settings = { accounts: TransferAccount[]; activeAccountId: string | null; operatorEmail: string; matchingApproved: boolean; notificationsEnabled: boolean }
type Claim = { id: string; reservation_id: string; revision: number; data: CancellationInvoice & { assessment: FeeAssessment } }
type Snapshot = { settings: { revision: number; data: Settings }; claims: Claim[]; cancelledReservations: { id: string; reservation_number: string; title: string }[]; freeeConnected: boolean }
const emptyAccount = { bankName: '', branchName: '', accountType: '普通' as '普通' | '当座', accountNumber: '', accountHolder: '', freeeCompanyId: '', freeeWalletableId: '' }
const statusLabel = { pending: '料金確認待ち', payable: '未入金', free: '料金なし', waived: '免除' }

export function CancellationBilling() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState('')
  const [account, setAccount] = useState(emptyAccount)
  const [settings, setSettings] = useState<Settings>({ accounts: [], activeAccountId: null, operatorEmail: '', matchingApproved: false, notificationsEnabled: false })
  const [reservationId, setReservationId] = useState('')
  const [receivedAt, setReceivedAt] = useState('')
  const [receiptEvidence, setReceiptEvidence] = useState('')
  const [payerName, setPayerName] = useState('')
  const [cause, setCause] = useState('customer')
  const [evidence, setEvidence] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  async function load() {
    const data = await apiClient.get<Snapshot>('/api/cancellation-billing')
    setSnapshot(data); setSettings(data.settings.data)
  }
  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : '読み込みに失敗しました。')) }, [])
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : '処理を完了できませんでした。') }
    finally { setBusy(false) }
  }
  async function intake(apply: boolean) {
    const old = snapshot?.claims.find(c => c.reservation_id === reservationId)
    const result = await apiClient.post<{ assessment: FeeAssessment; preview: string }>('/api/cancellation-billing?action=intake', {
      reservationId, receivedAt: receivedAt ? `${receivedAt}:00+09:00` : null, receiptEvidence, payerName, cause, evidence,
      revision: old?.revision ?? 0, apply,
    })
    setPreview(result.preview)
    if (apply) { await load(); setMessage('キャンセル料の受付を保存しました。通知プレビューから案内内容を確認できます。') }
  }
  async function reconcile(apply: boolean) {
    const result = await apiClient.post<{ entryCount: number; matches: unknown[]; reviewInvoiceIds: string[]; settled: string[]; conflicts: string[] }>('/api/cancellation-billing?action=reconcile', { startDate, endDate, apply })
    setPreview(`取得した入金明細：${result.entryCount}件\n一意に照合：${result.matches.length}件\n確認待ち：${result.reviewInvoiceIds.length}件\n入金済みに更新：${result.settled.length}件\n競合による保留：${result.conflicts.length}件`)
    if (apply) await load()
  }
  const active = settings.accounts.find(a => a.id === settings.activeAccountId)
  return <div className="space-y-6 max-w-4xl mx-auto pb-12">
    <PageHeader title="キャンセル料・入金確認" description="予約の受付記録から料金を確認し、freeeの入金明細と照合します。" />
    {message && <p role="status">{message}</p>}
    <Card><CardHeader><CardTitle>振込先と連絡設定（組織共通）</CardTitle></CardHeader><CardContent className="space-y-4">
      <p>{snapshot?.freeeConnected ? 'freee APIの認証設定あり（接続結果は照合時に確認）' : 'freee APIは未接続です。銀行とfreeeの連携とは別にAPI認証が必要です。'}</p>
      <p>現在の振込先：{active ? `${active.bankName} ${active.branchName} ${active.accountType} ${active.accountNumber} ${active.accountHolder}` : '未登録'}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {([['bankName', '銀行名'], ['branchName', '支店名'], ['accountNumber', '口座番号（7桁）'], ['accountHolder', '口座名義'], ['freeeCompanyId', 'freee事業所ID'], ['freeeWalletableId', 'freee口座ID']] as const).map(([key, label]) =>
          <div key={key}><Label htmlFor={`billing-${key}`}>{label}</Label><Input id={`billing-${key}`} value={account[key]} onChange={e => setAccount({ ...account, [key]: e.target.value })} /></div>)}
        <div><Label htmlFor="billing-accountType">口座種別</Label><select id="billing-accountType" className="border p-2 w-full" value={account.accountType} onChange={e => setAccount({ ...account, accountType: e.target.value as '普通' | '当座' })}><option>普通</option><option>当座</option></select></div>
        <div><Label htmlFor="billing-operator">運営の通知先メール</Label><Input id="billing-operator" type="email" value={settings.operatorEmail} onChange={e => setSettings({ ...settings, operatorEmail: e.target.value })} /></div>
      </div>
      <p>口座欄を入力して保存すると新しい振込先になります。案内済みの旧口座は入金照合用に保持し、未払いの方への変更案内を用意します。</p>
      <label className="flex gap-2"><input type="checkbox" checked={settings.matchingApproved} onChange={e => setSettings({ ...settings, matchingApproved: e.target.checked })} />金額・振込名義・口座が一致し、請求と明細が互いに1件の場合の入金確定を有効にする</label>
      <p>freee明細の備考全文と振込名義を照合します。空白・全半角以外は推測で補正せず、名義が確認できない明細は確認待ちになります。</p>
      <label className="flex gap-2"><input type="checkbox" checked={settings.notificationsEnabled} onChange={e => setSettings({ ...settings, notificationsEnabled: e.target.checked })} />料金案内・入金確認・口座変更の連絡を有効にする</label>
      <Button disabled={busy || !snapshot} onClick={() => void run(async () => {
        const hasAccount = Object.entries(account).some(([k, v]) => k !== 'accountType' && v !== '')
        await apiClient.post('/api/cancellation-billing?action=settings', { revision: snapshot!.settings.revision, operatorEmail: settings.operatorEmail,
          matchingApproved: settings.matchingApproved, notificationsEnabled: settings.notificationsEnabled,
          ...(hasAccount ? { newAccount: { ...account, freeeCompanyId: Number(account.freeeCompanyId), freeeWalletableId: Number(account.freeeWalletableId) } } : {}) })
        setAccount(emptyAccount); await load(); setMessage('振込先・連絡設定を保存しました。')
      })}>設定を保存</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>キャンセル料の受付</CardTitle></CardHeader><CardContent className="space-y-4">
      <p>MMQでキャンセル済みの予約を選びます。受信時刻が不明な場合は空欄にし、料金確認待ちとして受付できます。</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="billing-reservation">キャンセル済みの予約（直近100件）</Label><select id="billing-reservation" className="border p-2 w-full" value={reservationId} onChange={e => setReservationId(e.target.value)}><option value="">予約を選択</option>{snapshot?.cancelledReservations.map(r => <option key={r.id} value={r.id}>{r.reservation_number} {r.title}</option>)}</select></div>
        <div><Label htmlFor="billing-received">キャンセル連絡の受付時刻（日本時間）</Label><Input id="billing-received" type="datetime-local" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} /></div>
        <div><Label htmlFor="billing-receipt">受信記録の参照（メール・電話受付など）</Label><Input id="billing-receipt" value={receiptEvidence} onChange={e => setReceiptEvidence(e.target.value)} /></div>
        <div><Label htmlFor="billing-payer">お客様に確認した振込名義</Label><Input id="billing-payer" value={payerName} onChange={e => setPayerName(e.target.value)} /></div>
      </div>
      <div><Label htmlFor="billing-cause">キャンセル理由</Label><select id="billing-cause" className="border p-2 w-full" value={cause} onChange={e => setCause(e.target.value)}>
        <option value="customer">お客様都合</option><option value="organizer">主催者による公演中止</option><option value="transport_pending">交通機関の運休（確認待ち）</option><option value="transport_confirmed">交通機関の運休（運営確認済み）</option>
      </select></div>
      <div><Label htmlFor="billing-evidence">公式の運休発表URL・対象路線と来店への影響</Label><Textarea id="billing-evidence" value={evidence} onChange={e => setEvidence(e.target.value)} /></div>
      <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => void run(() => intake(false))}>料金を確認</Button><Button disabled={busy} onClick={() => void run(() => intake(true))}>受付を保存</Button></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>入金照合と連絡</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="billing-from">明細の開始日</Label><Input id="billing-from" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div><div><Label htmlFor="billing-to">明細の終了日</Label><Input id="billing-to" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void run(() => reconcile(false))}>freee明細で照合プレビュー</Button>
        <Button disabled={busy || !settings.matchingApproved} onClick={() => void run(() => reconcile(true))}>一意に一致した入金を記録</Button>
        <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
          const result = await apiClient.post<{ notices: { text: string }[]; unknown: unknown[] }>('/api/cancellation-billing?action=notices', { apply: false })
          setPreview(result.notices.map(n => n.text).join('\n\n────────\n\n') || '新しい連絡はありません。')
          setMessage(`送信結果の確認待ち：${result.unknown.length}件`)
        })}>連絡内容を確認</Button>
        <Button disabled={busy || !settings.notificationsEnabled} onClick={() => void run(async () => {
          const result = await apiClient.post<{ sent: string[]; unknown: string[] }>('/api/cancellation-billing?action=notices', { apply: true })
          await load(); setMessage(`送信：${result.sent.length}件、結果確認待ち：${result.unknown.length}件`)
        })}>連絡を実行</Button>
      </div>
      <p>freee明細の取得失敗や同期時刻不明は未入金と扱いません。送信結果が不明な連絡は重複を避けて確認待ちにします。</p>
      {preview && <pre className="whitespace-pre-wrap border p-4" aria-live="polite">{preview}</pre>}
      <div className="overflow-x-auto"><table className="w-full"><thead><tr><th>予約</th><th>状態</th><th>料金</th><th>案内日時</th></tr></thead><tbody>
        {snapshot?.claims.map(c => <tr key={c.id}><td className="p-2"><Button variant="link" onClick={() => setReservationId(c.reservation_id)}>{snapshot.cancelledReservations.find(r => r.id === c.reservation_id)?.reservation_number ?? c.reservation_id}</Button></td><td>{c.data.paidAt ? '入金済み' : statusLabel[c.data.assessment.status]}</td><td>{c.data.assessment.amount === null ? '確認中' : `${c.data.assessment.amount.toLocaleString('ja-JP')}円`}</td><td>{c.data.notifiedAt ? new Date(c.data.notifiedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未案内'}</td></tr>)}
      </tbody></table></div>
    </CardContent></Card>
  </div>
}
