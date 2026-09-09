import { RecruitmentSettingsSection } from '@/components/modals/ScenarioEditDialogV2/sections/RecruitmentSettingsSection'
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
  if (!eventId) return <p className="scenario-edit-card__help">公演を保存すると、募集・締切を確認できます。</p>
  if (loading) return <p className="scenario-edit-card__note" role="status">締切を読み込み中…</p>
  return <div className="space-y-3">
    <RecruitmentSettingsSection eventId={eventId} readOnly />
    {error && <div role="alert" className="space-y-2"><p className="scenario-edit-card__help">{error}</p><Button size="sm" className="h-7 text-xs" variant="outline" onClick={() => void load()}>再読込</Button></div>}
    {window ? <>
      <section className="scenario-edit-card">
        <h3 className="scenario-edit-card__title">開催判断の期限</h3>
        <p className="scenario-edit-card__help">{formatBookingDeadline(window.judgment_deadline)}（日本時間）</p>
        <p className="scenario-edit-card__help">{window.judgment_status === 'confirmed' ? '開催決定済み' : window.judgment_status === 'active' ? '追加募集中・開催判断待ち' : '通常の開催判断待ち'}</p>
        <p className="scenario-edit-card__help">最低開催人数に届くかを判断する期限です。満席になる時刻とは異なります。</p>
      </section>
      <section className="scenario-edit-card">
        <h3 className="scenario-edit-card__title">開催決定後の予約受付締切</h3>
        <p className="scenario-edit-card__help">{formatBookingDeadline(window.booking_deadline)}（日本時間）</p>
        <p className="scenario-edit-card__help">開催決定後に空席がある場合、この締切まで予約を受け付けます。</p>
        {window.judgment_status === 'active' && <p className="scenario-edit-card__help">現在は追加募集の判断待ちのため、{formatBookingDeadline(window.effective_booking_deadline)}まで受付。開催が決まると上記の予約締切に切り替わります。</p>}
        <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="booking-cutoff-mode">締切設定</Label><div className="scenario-edit-field__control">
        <Select value={mode} onValueChange={setMode} disabled={!canEdit || saving}>
          <SelectTrigger className="h-7 text-xs" id="booking-cutoff-mode"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="default">シナリオ設定を使う（{window.default_minutes}分前）</SelectItem><SelectItem value="custom">この公演だけ指定する</SelectItem></SelectContent>
        </Select></div></div>
        <p className="scenario-edit-card__help">シナリオ編集で設定した予約締切を使います。シナリオ未設定の場合は、従来の締切を維持します。</p>
        {mode === 'custom' && <div className="space-y-2"><div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="booking-cutoff-minutes">受付締切</Label><div className="scenario-edit-field__control flex items-center gap-2"><Input className="h-7 text-xs w-24" aria-label="公演開始の何分前まで受け付けるか" id="booking-cutoff-minutes" type="number" min={0} max={1440} step={1} value={minutes} onChange={e => setMinutes(e.target.value)} disabled={!canEdit || saving} /><span className="text-xs text-muted-foreground">分前</span></div></div><p className="scenario-edit-card__help">0分は公演開始まで。開催判断の期限は変更しません。</p></div>}
        {canEdit ? <Button variant="outline" size="sm" className="h-7 text-xs self-end" onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : '予約締切を保存'}</Button> : <p className="scenario-edit-card__help">変更は管理者が行えます。</p>}
        {message && <p className="scenario-edit-card__note" role="status">{message}</p>}
      </section>
    </> : !error && <p className="scenario-edit-card__help">中止していないオープン公演で設定できます。</p>}
  </div>
}
