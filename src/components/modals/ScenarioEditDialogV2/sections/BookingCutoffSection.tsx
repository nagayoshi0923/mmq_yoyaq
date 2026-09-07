import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function BookingCutoffSection({ masterId }: { masterId?: string | null }) {
  const queryClient = useQueryClient()
  const [minutes, setMinutes] = useState('')
  const [revision, setRevision] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    if (!masterId) return
    setLoading(true); setError('')
    try {
      const data = await apiClient.get<{ setting: { booking_cutoff_minutes: number | null; updated_at: string } | null; can_edit: boolean }>(`/api/schedule?type=scenario-booking-cutoff&id=${encodeURIComponent(masterId)}`)
      setMinutes(data.setting?.booking_cutoff_minutes == null ? '' : String(data.setting.booking_cutoff_minutes))
      setRevision(data.setting?.updated_at ?? null)
      setCanEdit(data.can_edit)
    } catch { setError('予約締切を読み込めませんでした。') }
    finally { setLoading(false) }
  }, [masterId])
  useEffect(() => { void load() }, [load])
  const save = async () => {
    if (!masterId || !revision) return
    const value = minutes.trim() === '' ? null : Number(minutes)
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 1440)) { setError('0〜1440分の整数を入力してください。'); return }
    setSaving(true); setError(''); setMessage('')
    try {
      await apiClient.patch(`/api/schedule?action=scenario-booking-cutoff&id=${encodeURIComponent(masterId)}`, { minutes: value, expected_updated_at: revision })
      await queryClient.invalidateQueries({ queryKey: ['booking-window'], refetchType: 'all' })
      await load()
      setMessage('シナリオの予約締切を保存しました。')
    } catch (e) { setError(e instanceof Error ? e.message : '保存できませんでした。') }
    finally { setSaving(false) }
  }
  return <section className="scenario-edit-card space-y-3">
    <h3 className="scenario-edit-card__title">予約受付締切</h3>
    <p>このシナリオの公演で、開催決定後に空席がある場合の受付締切です。開催可否を判断する期限とは別に設定します。</p>
    {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load()}>再読込</Button></div>}
    {loading ? <p role="status">読み込み中…</p> : !revision ? <p>シナリオを保存すると設定できます。</p> : <>
      <Label htmlFor="scenario-booking-cutoff">公演開始の何分前まで予約を受け付けるか</Label>
      <Input id="scenario-booking-cutoff" type="number" min={0} max={1440} step={1} placeholder="未設定" value={minutes} onChange={e => setMinutes(e.target.value)} disabled={!canEdit || saving} />
      <p>0分は公演開始まで。未設定の間は従来の締切を維持します。公演詳細の「募集・締切」で、その公演だけ変更できます。</p>
      {canEdit && <Button onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : 'シナリオの予約締切を保存'}</Button>}
      {message && <p role="status">{message}</p>}
    </>}
  </section>
}
