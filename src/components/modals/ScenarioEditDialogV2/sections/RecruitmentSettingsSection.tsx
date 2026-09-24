import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RecruitmentTargetExample, RecruitmentTargetFields } from '@/components/settings/RecruitmentTargetFields'
import { DEFAULT_RECRUITMENT_TARGET, isRecruitmentTarget, recruitmentMissingLimit, recruitmentTargetLabel, type RecruitmentTarget } from '../../../../../shared/recruitmentTarget'

type Settings = { enabled_source: 'common' | 'custom'; deadline_source: 'common' | 'custom'; enabled: boolean; source: 'common' | 'custom'; mode: RecruitmentTarget['mode']; value: number; deadline_minutes: number; max_missing?: number }
type History = { id: string; actor_name: string; before_settings: Settings; after_settings: Settings; created_at: string }
type Response = { setting: { recruitment_enabled_source: Settings['enabled_source']; recruitment_deadline_source: Settings['deadline_source']; recruitment_extension_enabled: boolean; recruitment_max_missing: number; recruitment_deadline_minutes: number; recruitment_target_source: Settings['source']; recruitment_target_mode: RecruitmentTarget['mode']; recruitment_target_value: number; updated_at: string } | null; common: RecruitmentTarget & { enabled: boolean; deadline_minutes: number }; min_required: number; history: History[]; can_edit: boolean }
const describe = (s: Settings) => `${s.enabled_source === 'common' ? '延長：共通設定' : s.enabled ? '延長する' : '延長しない'}・${s.source === 'common' ? '対象：共通設定' : `不足${recruitmentTargetLabel({ mode: s.mode ?? 'count', value: s.value ?? s.max_missing ?? 2 })}`}・${s.deadline_source === 'common' ? '期限：共通設定' : `開始${s.deadline_minutes}分前まで`}`

export function RecruitmentSettingsSection({ masterId, eventId, readOnly = false, minimumPlayers }: { masterId?: string | null; eventId?: string; readOnly?: boolean; minimumPlayers?: number }) {
  const queryClient = useQueryClient()
  const [data, setData] = useState<Response | null>(null)
  const [value, setValue] = useState<Settings>({ enabled_source: 'common', deadline_source: 'common', enabled: true, source: 'common', ...DEFAULT_RECRUITMENT_TARGET, deadline_minutes: 90 })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const generation = useRef(0)
  const load = useCallback(async () => {
    const request = ++generation.current
    setData(null); setMessage('')
    if (!masterId && !eventId) return
    setLoading(true); setError('')
    try {
      const result = await apiClient.get<Response>(`/api/schedule?type=recruitment-settings&id=${encodeURIComponent(masterId ?? eventId!)}${eventId ? `&event_id=${encodeURIComponent(eventId)}` : ''}`)
      if (request !== generation.current) return
      setData(result)
      if (result.setting) setValue({ enabled_source: result.setting.recruitment_enabled_source, deadline_source: result.setting.recruitment_deadline_source, enabled: result.setting.recruitment_extension_enabled, source: result.setting.recruitment_target_source, mode: result.setting.recruitment_target_mode, value: result.setting.recruitment_target_value, deadline_minutes: result.setting.recruitment_deadline_minutes })
    } catch { if (request === generation.current) setError('追加募集設定を読み込めませんでした。') }
    finally { if (request === generation.current) setLoading(false) }
  }, [masterId, eventId])
  useEffect(() => { void load(); return () => { generation.current++ } }, [load])
  async function save() {
    if (!data?.setting || !masterId) return
    if (!isRecruitmentTarget(value.mode, value.value) || !Number.isInteger(value.deadline_minutes) || value.deadline_minutes < 1 || value.deadline_minutes > 239) {
      setError('対象は1〜20人または1〜100％、期限は開始1〜239分前の整数で指定してください。'); return
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
  const minimum = minimumPlayers ?? data?.min_required ?? 0
  const target = value.source === 'common' ? data?.common ?? DEFAULT_RECRUITMENT_TARGET : { mode: value.mode, value: value.value }
  const missing = recruitmentMissingLimit(minimum, target)
  const enabled = value.enabled_source === 'common' ? data?.common.enabled ?? true : value.enabled
  const deadline = value.deadline_source === 'common' ? data?.common.deadline_minutes ?? 90 : value.deadline_minutes
  const cutoff = 18 * 60 - deadline
  const time = `${Math.floor(cutoff / 60)}:${String(cutoff % 60).padStart(2, '0')}`
  return <section className="scenario-edit-card">
    <h3 className="scenario-edit-card__title">開催判断・追加募集</h3>
    {error && <p className="scenario-edit-card__help" role="alert">{error} <Button variant="outline" size="sm" onClick={() => void load()}>再読込</Button></p>}
    {loading ? <p className="scenario-edit-card__note" role="status">読み込み中…</p> : !data?.setting ? !error && <p className="scenario-edit-card__help">シナリオを保存すると設定できます。</p> : <>
      <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="recruitment-enabled">追加募集の延長</Label><div className="scenario-edit-field__control">
        <Select value={value.enabled_source === 'common' ? 'common' : value.enabled ? 'yes' : 'no'} onValueChange={v => setValue({ ...value, enabled_source: v === 'common' ? 'common' : 'custom', enabled: v === 'yes' })} disabled={disabled}>
          <SelectTrigger className="h-7 text-xs" id="recruitment-enabled"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="common">共通設定を使う（{data.common.enabled ? '延長する' : '延長しない'}）</SelectItem><SelectItem value="yes">このシナリオは延長する</SelectItem><SelectItem value="no">このシナリオは延長しない</SelectItem></SelectContent>
        </Select></div></div>
      <p className="scenario-edit-card__help">通常は開始4時間前に開催を判断します。</p>
      {enabled && <>
        <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="recruitment-source">追加募集の対象</Label><div className="scenario-edit-field__control">
          <Select value={value.source} onValueChange={source => setValue({ ...value, source: source as Settings['source'] })} disabled={disabled}>
            <SelectTrigger id="recruitment-source" className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="common">共通設定を使う（{recruitmentTargetLabel(data.common)}）</SelectItem><SelectItem value="custom">このシナリオだけ指定</SelectItem></SelectContent>
          </Select>
        </div></div>
        {value.source === 'custom' ? <RecruitmentTargetFields value={target} onChange={t => setValue({ ...value, ...t })} minimum={minimum} disabled={disabled} /> : <RecruitmentTargetExample minimum={minimum} target={target} />}
        <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="recruitment-deadline-source">期限の設定元</Label><div className="scenario-edit-field__control"><Select value={value.deadline_source} onValueChange={v => setValue({ ...value, deadline_source: v as Settings['deadline_source'] })} disabled={disabled}><SelectTrigger id="recruitment-deadline-source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="common">共通設定を使う（開始{data.common.deadline_minutes}分前まで）</SelectItem><SelectItem value="custom">このシナリオだけ指定</SelectItem></SelectContent></Select></div></div>
        {value.deadline_source === 'custom' && <div className="scenario-edit-field"><Label className="scenario-edit-field__label" htmlFor="recruitment-minutes">追加募集の期限</Label><div className="scenario-edit-field__control flex items-center gap-2"><Input id="recruitment-minutes" className="h-7 text-xs w-24" type="number" min={1} max={239} value={Number.isFinite(value.deadline_minutes) ? value.deadline_minutes : ''} onChange={e => setValue({ ...value, deadline_minutes: e.target.valueAsNumber })} disabled={disabled} /><span className="scenario-edit-card__help">分前</span></div></div>}
        <p className="scenario-edit-card__note">適用する期限：開始{deadline}分前まで（{value.deadline_source === 'common' ? '組織共通' : 'このシナリオの個別指定'}）</p>
      </>}
      {minimum > 0 && <p className="scenario-edit-card__note">最低{minimum}人の場合の前日判定：{minimum}人以上なら開催、{Math.ceil(minimum / 2)}人以上で最低人数未満なら募集継続、それ未満なら中止。</p>}
      {missing !== null && Number.isInteger(deadline) && deadline >= 1 && deadline <= 239 && <p className="scenario-edit-card__note">18:00開演の例：{enabled && missing > 0 ? `14:00に判断し、不足${missing}人以内なら${time}まで募集。期限まで最低開催人数に届かなければ中止します。` : '14:00の判断で最低開催人数未達なら中止します。'}</p>}
      <p className="scenario-edit-card__note">共通設定は「設定 → 組織共通 → 開催判断・追加募集」で変更できます。未案内の既存公演にも反映し、お客様へ案内済みの期限・不足人数の上限は維持します。</p>
      {!readOnly && data.can_edit && <Button variant="outline" size="sm" className="h-7 text-xs self-end" onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : '追加募集設定を保存'}</Button>}
      {message && <p className="scenario-edit-card__note" role="status">{message}</p>}
      <details><summary className="scenario-edit-card__help">設定の変更履歴（直近30件）</summary>
        {data.history.length === 0 ? <p className="scenario-edit-card__note">変更履歴はありません。</p> : data.history.map(h => <div key={h.id} className="space-y-1 py-2"><p className="scenario-edit-card__help">{new Date(h.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} ／ {h.actor_name}</p><p className="scenario-edit-card__note">{describe(h.before_settings)} → {describe(h.after_settings)}</p></div>)}
      </details>
    </>}
  </section>
}
