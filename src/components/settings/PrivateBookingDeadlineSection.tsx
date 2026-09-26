import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Response = { setting: { private_booking_deadline_days: number | null; updated_at: string } | null; common_days: number; can_edit: boolean }
export function PrivateBookingDeadlineSection({ masterId, common = false }: { masterId?: string | null; common?: boolean }) {
  const client = useQueryClient()
  const [data, setData] = useState<Response | null>(null)
  const [custom, setCustom] = useState(false)
  const [days, setDays] = useState('14')
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
      const result = await apiClient.get<Response>(`/api/schedule?type=private-booking-settings${common ? '' : `&id=${encodeURIComponent(masterId!)}`}`)
      if (request !== generation.current) return
      setData(result); setCustom(!common && result.setting?.private_booking_deadline_days != null)
      setDays(String(result.setting?.private_booking_deadline_days ?? result.common_days))
    } catch { if (request === generation.current) setError('貸切の受付締切を読み込めませんでした。') }
    finally { if (request === generation.current) setLoading(false) }
  }, [common, masterId])
  useEffect(() => { void load(); const active = generation; return () => { active.current++ } }, [load])
  async function save() {
    if (!data) return
    const value = common || custom ? Number(days) : null
    if (value !== null && (days.trim() === '' || !Number.isInteger(value) || value < 0 || value > 90)) { setError('0〜90日の整数を入力してください。'); return }
    setSaving(true); setError(''); setMessage('')
    try {
      await apiClient.patch(`/api/schedule?action=private-booking-settings${common ? '' : `&id=${encodeURIComponent(masterId!)}`}`, { days: value, expected_days: data.setting?.private_booking_deadline_days ?? null, expected_updated_at: data.setting?.updated_at ?? null })
      await Promise.all([
        client.invalidateQueries({ queryKey: ['private-booking-deadline-days'], refetchType: 'all' }),
        client.invalidateQueries({ queryKey: ['booking-data'], refetchType: 'all' }),
      ])
      await load(); setMessage('貸切予約の受付締切を保存しました。')
    } catch (e) { setError(e instanceof Error ? e.message : '保存できませんでした。') }
    finally { setSaving(false) }
  }
  const disabled = !data?.can_edit || saving
  const effective = !common && !custom ? data?.common_days : Number(days)
  return <section className="scenario-edit-card">
    <h3 className="scenario-edit-card__title">貸切予約の受付締切</h3>
    <p className="scenario-edit-card__help">{common ? '組織共通の初期値です。個別指定のないシナリオに適用します。' : '貸切の申込を、公演日の何日前まで受け付けるか設定します。'}</p>
    {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load()}>再読込</Button></div>}
    {loading ? <p role="status">読み込み中…</p> : !common && !data?.setting ? !error && <p>シナリオを保存すると設定できます。</p> : data && <>
      {!common && <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="private-deadline-source">設定元</Label><div className="scenario-edit-field__control"><Select value={custom ? 'custom' : 'common'} onValueChange={v => setCustom(v === 'custom')} disabled={disabled}><SelectTrigger id="private-deadline-source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="common">共通設定を使う</SelectItem><SelectItem value="custom">このシナリオで指定</SelectItem></SelectContent></Select></div></div>}
      {(common || custom) && <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="private-deadline-days">受付締切（日数）</Label><div className="scenario-edit-field__control"><Input id="private-deadline-days" type="number" min={0} max={90} step={1} value={days} onChange={e => setDays(e.target.value)} disabled={disabled} /></div></div>}
      <p className="scenario-edit-card__note">適用する締切：{Number.isInteger(effective) && effective! >= 0 ? `公演日の${effective}日前まで` : '日数を入力してください'}（{common || !custom ? '組織共通' : 'このシナリオの個別指定'}）</p>
      <p className="scenario-edit-card__help">共通設定を使うシナリオには、共通値の変更も反映されます。申込済みの予約や候補日は変更しません。</p>
      {data.can_edit && <Button className="self-start" variant="outline" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '貸切の受付締切を保存'}</Button>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>
}
