import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { type BookingWindow, formatBookingDeadline } from '@/lib/bookingWindow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function BookingDeadlineTab({ eventId }: { eventId?: string }) {
  const queryClient = useQueryClient()
  const [window, setWindow] = useState<BookingWindow | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [mode, setMode] = useState('default')
  const [minutes, setMinutes] = useState('0')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    if (!eventId) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const data = await apiClient.get<{ window: BookingWindow | null; can_edit: boolean }>(`/api/schedule?type=booking-window&id=${encodeURIComponent(eventId)}`)
      setWindow(data.window)
      setCanEdit(data.can_edit)
      setMode(data.window?.override_minutes == null ? 'default' : 'custom')
      setMinutes(String(data.window?.override_minutes ?? data.window?.default_minutes ?? 0))
    } catch { setError('締切を読み込めませんでした。再読込してください。') }
    finally { setLoading(false) }
  }, [eventId])
  useEffect(() => { void load() }, [load])
  const save = async () => {
    if (!window || !eventId) return
    const value = mode === 'default' ? null : Number(minutes)
    if (value !== null && (!minutes.trim() || !Number.isInteger(value) || value < 0 || value > 1440)) {
      setError('0〜1440分の整数を入力してください。'); return
    }
    setSaving(true); setError(''); setMessage('')
    try {
      await apiClient.patch(`/api/schedule?action=booking-cutoff&id=${encodeURIComponent(eventId)}`, { minutes: value, expected_updated_at: window.updated_at })
      await queryClient.invalidateQueries({ queryKey: ['booking-window'], refetchType: 'all' })
      await load()
      setMessage('予約受付の締切を保存しました。')
    } catch (e) { setError(e instanceof Error ? e.message : '保存できませんでした。') }
    finally { setSaving(false) }
  }
  if (!eventId) return <p>公演を保存すると、募集・締切を確認できます。</p>
  if (loading) return <p role="status">締切を読み込み中…</p>
  return <div className="space-y-6">
    {error && <div role="alert" className="space-y-2"><p>{error}</p><Button variant="outline" onClick={() => void load()}>再読込</Button></div>}
    {window ? <>
      <section className="space-y-2">
        <h3>開催判断の期限</h3>
        <p>{formatBookingDeadline(window.judgment_deadline)}（日本時間）</p>
        <p>{window.judgment_status === 'confirmed' ? '開催決定済み' : window.judgment_status === 'active' ? '追加募集中・開催判断待ち' : '通常の開催判断待ち'}</p>
        <p>最低開催人数に届くかを判断する期限です。満席になる時刻とは異なります。</p>
      </section>
      <section className="space-y-3">
        <h3>開催決定後の予約受付締切</h3>
        <p>{formatBookingDeadline(window.booking_deadline)}（日本時間）</p>
        <p>開催決定後に空席がある場合、この締切まで予約を受け付けます。</p>
        {window.judgment_status === 'active' && <p>現在は追加募集の判断待ちのため、{formatBookingDeadline(window.effective_booking_deadline)}まで受付。開催が決まると上記の予約締切に切り替わります。</p>}
        <Label htmlFor="booking-cutoff-mode">予約締切の設定</Label>
        <Select value={mode} onValueChange={setMode} disabled={!canEdit || saving}>
          <SelectTrigger id="booking-cutoff-mode"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="default">標準設定を使う（{window.default_minutes}分前）</SelectItem><SelectItem value="custom">この公演だけ指定する</SelectItem></SelectContent>
        </Select>
        <p>標準は店舗の予約設定を使います。既存の公演設定がある場合は、その制限も引き継ぎます。</p>
        {mode === 'custom' && <div className="space-y-2"><Label htmlFor="booking-cutoff-minutes">公演開始の何分前まで受け付けるか</Label><Input id="booking-cutoff-minutes" type="number" min={0} max={1440} step={1} value={minutes} onChange={e => setMinutes(e.target.value)} disabled={!canEdit || saving} /><p>0分は公演開始まで。開催判断の期限は変更しません。</p></div>}
        {canEdit ? <Button onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : '予約締切を保存'}</Button> : <p>変更は管理者が行えます。</p>}
        {message && <p role="status">{message}</p>}
      </section>
    </> : !error && <p>中止していないオープン公演で設定できます。</p>}
  </div>
}
