import { useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Candidate = { id: string; title: string; participant_count: number; schedule_events: { date: string } }
type Snapshot = { customer_name: string; quantity: number; amount: number; coupon_name: string }
type Result = { already_granted: boolean; quantity: number; notification_failed?: boolean; snapshot?: Snapshot }
export function RepresentativeCompensation() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Candidate[]>([])
  const [selected, setSelected] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const show = async () => {
    setOpen(true); setError(''); setBusy(true)
    try { setItems(await apiClient.get('/api/coupons?type=representative-candidates')) }
    catch (e) { setError(e instanceof Error ? e.message : '取得に失敗しました') }
    finally { setBusy(false) }
  }
  const submit = async (apply: boolean) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const data = await apiClient.post<Result>(`/api/coupons?action=${apply ? 'grant' : 'preview'}-representative-compensation`, {
        reservation_id: selected, snapshot, gm_cancellation_confirmed: confirmed,
      })
      if (data.already_granted) { setSnapshot(undefined); setMessage(`この予約は${data.quantity}枚付与済みです。`) }
      else if (!apply) setSnapshot(data.snapshot)
      else {
        setSnapshot(undefined)
        setMessage(`代表者へ${data.quantity}枚付与しました。${data.notification_failed ? '通知メールは送信を確認できませんでした。メール履歴を確認してください。' : ''}`)
      }
    } catch (e) { setSnapshot(undefined); setError(e instanceof Error ? e.message : '処理に失敗しました') }
    finally { setBusy(false) }
  }
  return <section className="mb-5 space-y-3">
    <Button variant="outline" disabled={busy} onClick={show}>通常公演のお詫びクーポンを代表者へ付与</Button>
    {open && <div className="border rounded-md p-4 space-y-3">
      <Label htmlFor="representative-reservation">対象の中止済み通常公演の予約</Label>
      <select id="representative-reservation" disabled={busy} className="block w-full border rounded-md p-2" value={selected}
        onChange={e => { setSelected(e.target.value); setSnapshot(undefined); setConfirmed(false); setMessage(''); setError('') }}>
        <option value="">予約を選択</option>
        {items.map(r => <option key={r.id} value={r.id}>{r.schedule_events.date} {r.title}（{r.participant_count}名）</option>)}
      </select>
      <Button variant="outline" disabled={!selected || busy} onClick={() => submit(false)}>付与内容を確認</Button>
      {snapshot && <div className="space-y-3">
        <p>代表者：{snapshot.customer_name} 様</p>
        <p>{snapshot.coupon_name}：{snapshot.amount.toLocaleString()}円 × {snapshot.quantity}枚</p>
        <p className="text-sm text-muted-foreground">各1回利用、付与から6か月有効。マーダーミステリーの通常公演・貸切が対象です。ボードゲーム・箱開け会は対象外です。通知を有効にしている場合、枚数をまとめたメールを1通送ります。</p>
        <label className="flex items-center gap-2"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />GM都合による公演中止と、代表者・枚数を確認しました</label>
        <Button disabled={!confirmed || busy} onClick={() => submit(true)}>{busy ? '付与中…' : `${snapshot.quantity}枚を代表者へ付与`}</Button>
      </div>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </section>
}
