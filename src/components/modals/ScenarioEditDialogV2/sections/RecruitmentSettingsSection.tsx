import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Settings = { enabled: boolean; max_missing: number; deadline_minutes: number }
type History = { id: string; actor_name: string; before_settings: Settings; after_settings: Settings; created_at: string }
type Response = { setting: { recruitment_extension_enabled: boolean; recruitment_max_missing: number; recruitment_deadline_minutes: number; updated_at: string } | null; history: History[]; can_edit: boolean }
const describe = (s: Settings) => s.enabled ? `不足${s.max_missing}人以内・開始${s.deadline_minutes}分前まで` : '延長しない'

export function RecruitmentSettingsSection({ masterId, eventId, readOnly = false }: { masterId?: string | null; eventId?: string; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const [data, setData] = useState<Response | null>(null)
  const [value, setValue] = useState<Settings>({ enabled: true, max_missing: 2, deadline_minutes: 90 })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    if (!masterId && !eventId) return
    setLoading(true); setError('')
    try {
      const result = await apiClient.get<Response>(`/api/schedule?type=recruitment-settings&id=${encodeURIComponent(masterId ?? eventId!)}${eventId ? `&event_id=${encodeURIComponent(eventId)}` : ''}`)
      setData(result)
      if (result.setting) setValue({ enabled: result.setting.recruitment_extension_enabled, max_missing: result.setting.recruitment_max_missing, deadline_minutes: result.setting.recruitment_deadline_minutes })
    } catch { setError('追加募集設定を読み込めませんでした。') }
    finally { setLoading(false) }
  }, [masterId, eventId])
  useEffect(() => { void load() }, [load])
  async function save() {
    if (!data?.setting || !masterId) return
    if (!Number.isInteger(value.max_missing) || value.max_missing < 1 || value.max_missing > 20 || !Number.isInteger(value.deadline_minutes) || value.deadline_minutes < 1 || value.deadline_minutes > 239) {
      setError('不足人数は1〜20人、期限は開始1〜239分前で指定してください。'); return
    }
    setSaving(true); setError(''); setMessage('')
    try {
      await apiClient.patch(`/api/schedule?action=recruitment-settings&id=${encodeURIComponent(masterId)}`, { ...value, expected_updated_at: data.setting.updated_at })
      await queryClient.invalidateQueries({ queryKey: ['booking-window'], refetchType: 'all' })
      await load(); setMessage('追加募集設定を保存しました。案内済みの期限は変更しません。')
    } catch (e) { setError(e instanceof Error ? e.message : '保存できませんでした。') }
    finally { setSaving(false) }
  }
  const disabled = readOnly || !data?.can_edit || saving
  const cutoff = 18 * 60 - value.deadline_minutes
  const time = `${Math.floor(cutoff / 60)}:${String(cutoff % 60).padStart(2, '0')}`
  return <section className="scenario-edit-card">
    <h3 className="scenario-edit-card__title">開催判断・追加募集</h3>
    {error && <p className="scenario-edit-card__help" role="alert">{error} <Button variant="outline" size="sm" onClick={() => void load()}>再読込</Button></p>}
    {loading ? <p className="scenario-edit-card__note" role="status">読み込み中…</p> : !data?.setting ? <p className="scenario-edit-card__help">シナリオを保存すると設定できます。</p> : <>
      <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="recruitment-enabled">追加募集の延長</Label><div className="scenario-edit-field__control">
        <Select value={value.enabled ? 'yes' : 'no'} onValueChange={v => setValue({ ...value, enabled: v === 'yes' })} disabled={disabled}>
          <SelectTrigger className="h-7 text-xs" id="recruitment-enabled"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">延長する</SelectItem><SelectItem value="no">延長しない</SelectItem></SelectContent>
        </Select></div></div>
      <p className="scenario-edit-card__help">通常は開始4時間前に開催を判断します。</p>
      {value.enabled && <>
        <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="recruitment-missing">追加募集の対象</Label><div className="scenario-edit-field__control flex items-center gap-2"><Input id="recruitment-missing" className="h-7 text-xs w-24" type="number" min={1} max={20} value={value.max_missing} onChange={e => setValue({ ...value, max_missing: Number(e.target.value) })} disabled={disabled} /><span className="scenario-edit-card__help">人以内（初期値：2名）</span></div></div>
        <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="recruitment-minutes">追加募集の期限</Label><div className="scenario-edit-field__control flex items-center gap-2"><Input id="recruitment-minutes" className="h-7 text-xs w-24" type="number" min={1} max={239} value={value.deadline_minutes} onChange={e => setValue({ ...value, deadline_minutes: Number(e.target.value) })} disabled={disabled} /><span className="scenario-edit-card__help">分前（初期値：90分）</span></div></div>
      </>}
      <p className="scenario-edit-card__note">18:00開演の例：{value.enabled ? `14:00に判断し、不足${value.max_missing}人以内なら${time}まで募集。期限まで未達なら中止します。` : '14:00の判断で人数未達なら中止します。'}</p>
      <p className="scenario-edit-card__note">シナリオ単位で適用します。未案内の既存公演にも反映し、お客様へ案内済みの期限は維持します。</p>
      {!readOnly && data.can_edit && <Button variant="outline" size="sm" className="h-7 text-xs self-end" onClick={() => void save()} disabled={saving}>追加募集設定を保存</Button>}
      {message && <p className="scenario-edit-card__note" role="status">{message}</p>}
      <details><summary className="scenario-edit-card__help">設定の変更履歴（直近30件）</summary>
        {data.history.length === 0 ? <p className="scenario-edit-card__note">変更履歴はありません。</p> : data.history.map(h => <div key={h.id} className="space-y-1 py-2"><p className="scenario-edit-card__help">{new Date(h.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} ／ {h.actor_name}</p><p className="scenario-edit-card__note">{describe(h.before_settings)} → {describe(h.after_settings)}</p></div>)}
      </details>
    </>}
  </section>
}
