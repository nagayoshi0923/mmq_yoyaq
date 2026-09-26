import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { apiClient } from '@/lib/apiClient'
import { RecruitmentTargetFields } from '@/components/settings/RecruitmentTargetFields'
import { DEFAULT_RECRUITMENT_TARGET, isRecruitmentTarget, type RecruitmentTarget } from '../../../../shared/recruitmentTarget'
import '@/components/modals/ScenarioEditDialogV2.css'

type Response = { setting: RecruitmentTarget & { enabled: boolean; deadline_minutes: number; updated_at: string | null }; common_count: number; custom_count: number; can_edit: boolean }
export function RecruitmentSettings() {
  const queryClient = useQueryClient()
  const [data, setData] = useState<Response | null>(null)
  const [target, setTarget] = useState<RecruitmentTarget>(DEFAULT_RECRUITMENT_TARGET)
  const [enabled, setEnabled] = useState(true)
  const [deadline, setDeadline] = useState('90')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError(''); setData(null)
    try {
      const result = await apiClient.get<Response>('/api/schedule?type=common-recruitment-settings')
      setData(result); setTarget(result.setting); setEnabled(result.setting.enabled); setDeadline(String(result.setting.deadline_minutes))
    } catch { setError('共通設定を読み込めませんでした。再読込してください。') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  async function save() {
    if (!data || !isRecruitmentTarget(target.mode, target.value) || !deadline.trim() || !Number.isInteger(Number(deadline)) || Number(deadline) < 1 || Number(deadline) > 239) { setError('対象は1〜20人または1〜100％、期限は開始1〜239分前の整数で指定してください。'); return }
    setSaving(true); setError(''); setMessage('')
    try {
      await apiClient.patch('/api/schedule?action=common-recruitment-settings', { ...target, enabled, deadline_minutes: Number(deadline), expected_updated_at: data.setting.updated_at })
      await queryClient.invalidateQueries({ queryKey: ['booking-window'], refetchType: 'all' })
      await load(); setMessage('共通設定を保存しました。案内済みの追加募集期限は維持します。')
    } catch (e) { setError(e instanceof Error ? e.message : '共通設定を保存できませんでした。') }
    finally { setSaving(false) }
  }
  return <div className="space-y-4">
    <PageHeader title="開催判断・追加募集" description="追加募集の有効・無効、対象人数、期限を組織共通で設定します。"><Button onClick={() => void save()} disabled={!data?.can_edit || loading || saving}>{saving ? '保存中…' : '保存'}</Button></PageHeader>
    {loading && <p role="status">読み込み中…</p>}
    {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load()}>再読込</Button></div>}
    {data && <>
      <section className="scenario-edit-card"><p className="scenario-edit-card__help">「共通設定を使う」シナリオに適用します。個別指定の値は維持します。</p><p className="scenario-edit-card__note">対象人数の設定：共通 {data.common_count}作品 ／ 個別指定 {data.custom_count}作品</p></section>
      <section className="scenario-edit-card space-y-4">
        <h3 className="scenario-edit-card__title">追加募集の延長と期限</h3>
        <Label htmlFor="common-recruitment-enabled">追加募集の延長</Label>
        <Select value={enabled ? 'yes' : 'no'} onValueChange={v => setEnabled(v === 'yes')} disabled={!data.can_edit || saving}>
          <SelectTrigger id="common-recruitment-enabled"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">延長する</SelectItem><SelectItem value="no">延長しない</SelectItem></SelectContent>
        </Select>
        <Label htmlFor="common-recruitment-deadline">追加募集の期限（公演開始の何分前まで）</Label>
        <Input id="common-recruitment-deadline" type="number" min={1} max={239} step={1} value={deadline} onChange={e => setDeadline(e.target.value)} disabled={!data.can_edit || saving} />
        <p className="scenario-edit-card__help">通常の開催判断は開始4時間前です。この時点で不足が対象人数以内なら、指定した期限まで追加募集します。</p>
      </section>
      <section className="scenario-edit-card">
        <p className="scenario-edit-card__note">組織共通</p><h3 className="scenario-edit-card__title">追加募集の対象</h3>
        <p className="scenario-edit-card__help">最低開催人数までの不足を、何人まで許容して追加募集するか設定します。</p>
        <RecruitmentTargetFields value={target} onChange={setTarget} minimum={7} disabled={!data.can_edit || saving} idPrefix="common-recruitment" />
        <p className="scenario-edit-card__help">上は最低7人のシナリオの計算例です。実際は各シナリオの最低開催人数で計算します。</p>
      </section>
      <section className="scenario-edit-card"><h3 className="scenario-edit-card__title">個別に変更したい場合</h3><p className="scenario-edit-card__help">シナリオ編集 → ゲーム設定 → 開催判断・追加募集で、延長の有効・無効、対象人数、期限をそれぞれ個別指定できます。</p><p className="scenario-edit-card__note">共通設定の変更は、共通設定を参照する既存シナリオにも適用します。お客様へ案内済みの追加募集期限・不足人数の上限は維持します。各項目で「共通設定を使う」を選ぶと、組織共通の設定へ戻せます。</p></section>
    </>}
    {message && <p role="status" className="scenario-edit-card__note">{message}</p>}
  </div>
}
