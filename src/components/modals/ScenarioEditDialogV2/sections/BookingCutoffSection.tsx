import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Response = { setting: { booking_cutoff_minutes: number | null; updated_at: string } | null; common_minutes: number; can_edit: boolean }
export function BookingCutoffSection({ masterId, common = false }: { masterId?: string | null; common?: boolean }) {
  const client = useQueryClient()
  const [data, setData] = useState<Response | null>(null)
  const [custom, setCustom] = useState(false)
  const [minutes, setMinutes] = useState('0')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  const load = useCallback(async () => {
    const request = ++generation.current
    setData(null); setLoading(true); setError(''); setMessage('')
    if (!common && !masterId) { setLoading(false); return }
    try {
      const result = await apiClient.get<Response>(`/api/schedule?type=booking-cutoff-settings${common ? '' : `&id=${encodeURIComponent(masterId!)}`}`)
      if (request !== generation.current) return
      setData(result); setCustom(!common && result.setting?.booking_cutoff_minutes != null)
      setMinutes(String(result.setting?.booking_cutoff_minutes ?? result.common_minutes))
    } catch { if (request === generation.current) setError('通常予約の受付締切を読み込めませんでした。') }
    finally { if (request === generation.current) setLoading(false) }
  }, [common, masterId])
  useEffect(() => { void load(); const active = generation; return () => { active.current++ } }, [load])
  async function save() {
    if (!data) return
    const value = common || custom ? Number(minutes) : null
    if (value !== null && (minutes.trim() === '' || !Number.isInteger(value) || value < 0 || value > 1440)) { setError('0〜1440分の整数を入力してください。'); return }
    setSaving(true); setError(''); setMessage('')
    try {
      await apiClient.patch(`/api/schedule?action=booking-cutoff-settings${common ? '' : `&id=${encodeURIComponent(masterId!)}`}`, { minutes: value, expected_minutes: data.setting?.booking_cutoff_minutes ?? null, expected_updated_at: data.setting?.updated_at ?? null })
      await Promise.all([
        client.invalidateQueries({ queryKey: ['booking-window'], refetchType: 'all' }),
        client.invalidateQueries({ queryKey: ['booking-data'], refetchType: 'all' }),
      ])
      await load(); setMessage('通常予約の受付締切を保存しました。')
    } catch (e) { setError(e instanceof Error ? e.message : '保存できませんでした。') }
    finally { setSaving(false) }
  }
  const disabled = !data?.can_edit || saving
  const effective = !common && !custom ? data?.common_minutes : Number(minutes)
  return <section className="scenario-edit-card">
    <h3 className="scenario-edit-card__title">通常予約の受付締切</h3>
    <p className="scenario-edit-card__help">{common ? '組織共通の初期値です。個別指定のないシナリオに適用します。' : '開催決定後に空席がある公演の予約を、開始の何分前まで受け付けるか設定します。'}</p>
    {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load()}>再読込</Button></div>}
    {loading ? <p role="status">読み込み中…</p> : !common && !data?.setting ? !error && <p>シナリオを保存すると設定できます。</p> : data && <>
      {!common && <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="booking-cutoff-source">設定元</Label><div className="scenario-edit-field__control"><Select value={custom ? 'custom' : 'common'} onValueChange={v => setCustom(v === 'custom')} disabled={disabled}><SelectTrigger id="booking-cutoff-source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="common">共通設定を使う</SelectItem><SelectItem value="custom">このシナリオで指定</SelectItem></SelectContent></Select></div></div>}
      {(common || custom) && <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="booking-cutoff-minutes">受付締切（分前）</Label><div className="scenario-edit-field__control"><Input id="booking-cutoff-minutes" type="number" min={0} max={1440} step={1} value={minutes} onChange={e => setMinutes(e.target.value)} disabled={disabled} /></div></div>}
      <p className="scenario-edit-card__note">適用する締切：{Number.isInteger(effective) && effective! >= 0 ? `公演開始の${effective}分前まで` : '分数を入力してください'}（{common || !custom ? '組織共通' : 'このシナリオの個別指定'}）</p>
      <p className="scenario-edit-card__help">共通設定を使うシナリオには、共通値の変更も反映されます。0分は公演開始まで受付。公演詳細の「募集・締切」で、公演ごとにも上書きできます。案内済みの追加募集期限は維持します。</p>
      {data.can_edit && <Button className="self-start" variant="outline" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '通常予約の受付締切を保存'}</Button>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>
}
