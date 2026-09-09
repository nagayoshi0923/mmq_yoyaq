import { formatJstDateJa } from '@/utils/jstDate'
import { useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Candidate = { id: string; title: string; participant_count: number; schedule_events: { date: string } }
export function PrivateCouponLink() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Candidate[]>([])
  const [selected, setSelected] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [url, setUrl] = useState('')
  const [expires, setExpires] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const show = async () => {
    setOpen(true); setError('')
    try { setItems(await apiClient.get('/api/coupons?type=private-claim-candidates')) }
    catch (e) { setError(e instanceof Error ? e.message : '取得に失敗しました') }
  }
  const create = async () => {
    setBusy(true); setError(''); setUrl('')
    try {
      const data = await apiClient.post<{path: string; revoked: boolean; expires_at: string}>('/api/coupons?action=create-private-claim-link', {
        reservation_id: selected, gm_cancellation_confirmed: confirmed,
      })
      if (data.revoked) setError('この予約の受け取りURLは停止されています')
      else { setUrl(window.location.origin + data.path); setExpires(data.expires_at) }
    } catch (e) { setError(e instanceof Error ? e.message : '作成に失敗しました') }
    finally { setBusy(false) }
  }
  return <section className="mb-5 space-y-3">
    <Button variant="outline" onClick={show}>貸切のお詫びクーポン受け取りURL</Button>
    {open && <div className="border rounded-md p-4 space-y-3">
      <Label htmlFor="claim-reservation">対象の中止済み貸切予約</Label>
      <select id="claim-reservation" className="block w-full border rounded-md p-2" value={selected}
        onChange={e => { setSelected(e.target.value); setUrl(''); setConfirmed(false) }}>
        <option value="">予約を選択</option>
        {items.map(r => <option key={r.id} value={r.id}>{r.schedule_events.date} {r.title}（{r.participant_count}名）</option>)}
      </select>
      <label className="flex items-center gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />GM都合による公演中止であることを確認しました</label>
      <p className="text-sm text-muted-foreground">中止日時に応じた補償額を設定します。参加者が各自1枚、予約人数まで受け取れます。URLは発行から3か月間有効です。作成してもメールは送信されません。</p>
      <Button disabled={!selected || !confirmed || busy} onClick={create}>{busy ? '作成中…' : '受け取りURLを作成・表示'}</Button>
      {url && <><p>受け取り期限：{formatJstDateJa(expires)}</p><Label htmlFor="claim-url">代表者から参加者へ共有するURL</Label><Input id="claim-url" readOnly value={url} onFocus={e => e.target.select()} /><Button variant="outline" onClick={() => navigator.clipboard.writeText(url)}>URLをコピー</Button></>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </section>
}
