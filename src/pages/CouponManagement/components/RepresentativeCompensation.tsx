import { useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Event = { id: string; date: string; start_time: string; scenario: string }
type Snapshot = { customer_name: string; quantity: number; amount: number; coupon_name: string }
type Row = { reservation_id: string; name: string; quantity: number; state: 'ready' | 'excluded' | 'held' | 'granted'; reason?: string; snapshot?: Snapshot }
type Result = { already_granted: boolean; quantity: number; notification_failed?: boolean }
const stateLabel = { ready: '付与対象', excluded: '対象外', held: '要確認', granted: '付与済み' }
export function RepresentativeCompensation() {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [selected, setSelected] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = rows?.filter(r => r.state === 'ready') ?? []
  const quantity = ready.reduce((sum, r) => sum + r.quantity, 0)
  const held = rows?.some(r => r.state === 'held')
  const show = async () => {
    setOpen(true); setError(''); setBusy(true)
    try { setEvents(await apiClient.get('/api/coupons?type=compensation-events')) }
    catch (e) { setError(e instanceof Error ? e.message : '取得に失敗しました') }
    finally { setBusy(false) }
  }
  const preview = async () => {
    setBusy(true); setError(''); setMessage(''); setRows(null); setConfirmed(false)
    try { setRows(await apiClient.post<Row[]>('/api/coupons?action=preview-event-compensation', { event_id: selected })) }
    catch (e) { setError(e instanceof Error ? e.message : '対象者を確認できませんでした') }
    finally { setBusy(false) }
  }
  const grant = async () => {
    setBusy(true); setError(''); setMessage('')
    let issued = 0
    const updated = [...(rows ?? [])]
    try {
      for (const row of ready) {
        const result = await apiClient.post<Result>('/api/coupons?action=grant-representative-compensation', {
          reservation_id: row.reservation_id, snapshot: row.snapshot, gm_cancellation_confirmed: confirmed,
        })
        const index = updated.findIndex(r => r.reservation_id === row.reservation_id)
        updated[index] = { ...row, state: 'granted', reason: result.notification_failed ? '通知メールの送信状況を確認してください' : undefined }
        if (!result.already_granted) issued += result.quantity
        setRows([...updated])
      }
      setMessage(`${issued}枚を付与しました。付与済みの方への重複配布はありません。`)
    } catch (e) {
      setError(`${issued}枚の付与後に処理を停止しました。${e instanceof Error ? e.message : '処理に失敗しました'} 「対象者を確認」で最新の状態を読み込んでください。`)
      // Require a fresh preview after partial completion or an uncertain response.
      setConfirmed(false)
      setRows(updated.map(r => r.state === 'ready' ? { ...r, state: 'held', reason: '対象者を確認し直してください' } : r))
    } finally { setBusy(false) }
  }
  return <section className="mb-5 space-y-3">
    <Button variant="outline" disabled={busy} onClick={show}>公演中止のお詫びクーポンを配る（通常公演）</Button>
    {open && <div className="border rounded-md p-4 space-y-4">
      <div><h2 className="font-semibold">参加予定者全員へのお詫びクーポン</h2>
        <p className="text-sm text-muted-foreground">公演中止前にキャンセルした方は対象外です。</p></div>
      <div className="space-y-2">
        <Label htmlFor="compensation-event">1. 中止した公演を選ぶ</Label>
        <select id="compensation-event" disabled={busy} className="block w-full border rounded-md p-2" value={selected}
          onChange={e => { setSelected(e.target.value); setRows(null); setConfirmed(false); setMessage(''); setError('') }}>
          <option value="">公演を選択</option>
          {events.map(e => <option key={e.id} value={e.id}>{e.date} {e.start_time?.slice(0, 5)} {e.scenario}</option>)}
        </select>
        <Button variant="outline" disabled={!selected || busy} onClick={preview}>対象者を確認</Button>
      </div>
      {rows && <div className="space-y-3">
        <h3 className="font-semibold">2. 対象者と枚数を確認する</h3>
        <p>今回の対象：{quantity}名分・{quantity}枚</p>
        <p className="text-sm text-muted-foreground">1人につき1枚。まとめ予約の分は、予約者のアカウントに人数分を付与します。</p>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left">
          <thead><tr className="border-b"><th className="p-2">予約者</th><th className="p-2">人数</th><th className="p-2">クーポン</th><th className="p-2">状態</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.reservation_id} className="border-b">
            <td className="p-2">{r.name}</td><td className="p-2">{r.quantity}名</td>
            <td className="p-2">{r.snapshot ? `${r.snapshot.amount.toLocaleString()}円 × ${r.quantity}枚` : '—'}</td>
            <td className="p-2">{stateLabel[r.state]}{r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}</td>
          </tr>)}</tbody>
        </table></div>
        {rows.length === 0 && <p>この公演に予約はありません。</p>}
        <p className="text-sm text-muted-foreground">クーポンは付与から6か月有効。マーダーミステリー公演に利用できます。ボードゲーム・箱開け会は対象外です。付与通知は各予約者へ1通ずつ送ります（通知が有効な場合）。</p>
        {held && <p role="alert">要確認の予約があります。内容を確認してから、対象者を読み込み直してください。</p>}
        {quantity > 0 && <>
          <label className="flex items-center gap-2"><input type="checkbox" disabled={busy || held} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />GMの欠勤・体調不良などによる中止であることと、上の対象者を確認しました</label>
          <Button disabled={!confirmed || busy || held} onClick={grant}>{busy ? '処理中…' : `対象者全員に配る（${quantity}名分）`}</Button>
        </>}
      </div>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </section>
}
