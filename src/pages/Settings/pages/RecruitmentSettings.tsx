import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { apiClient } from '@/lib/apiClient'
import { RecruitmentTargetFields } from '@/components/settings/RecruitmentTargetFields'
import { DEFAULT_RECRUITMENT_TARGET, isRecruitmentTarget, type RecruitmentTarget } from '../../../../shared/recruitmentTarget'
import '@/components/modals/ScenarioEditDialogV2.css'

type Response = { setting: RecruitmentTarget & { updated_at: string | null }; common_count: number; custom_count: number; can_edit: boolean }
export function RecruitmentSettings() {
  const queryClient = useQueryClient()
  const [data, setData] = useState<Response | null>(null)
  const [target, setTarget] = useState<RecruitmentTarget>(DEFAULT_RECRUITMENT_TARGET)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError(''); setData(null)
    try {
      const result = await apiClient.get<Response>('/api/schedule?type=common-recruitment-settings')
      setData(result); setTarget(result.setting)
    } catch { setError('共通設定を読み込めませんでした。再読込してください。') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  async function save() {
    if (!data || !isRecruitmentTarget(target.mode, target.value)) { setError('対象を1〜20人または1〜100％の整数で指定してください。'); return }
    setSaving(true); setError(''); setMessage('')
    try {
      await apiClient.patch('/api/schedule?action=common-recruitment-settings', { ...target, expected_updated_at: data.setting.updated_at })
      await queryClient.invalidateQueries({ queryKey: ['booking-window'], refetchType: 'all' })
      await load(); setMessage('共通設定を保存しました。案内済みの追加募集期限は維持します。')
    } catch (e) { setError(e instanceof Error ? e.message : '共通設定を保存できませんでした。') }
    finally { setSaving(false) }
  }
  return <div className="space-y-4">
    <PageHeader title="開催判断・追加募集" description="追加募集の対象人数を、シナリオ共通で設定します。"><Button onClick={() => void save()} disabled={!data?.can_edit || loading || saving}>{saving ? '保存中…' : '保存'}</Button></PageHeader>
    {loading && <p role="status">読み込み中…</p>}
    {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load()}>再読込</Button></div>}
    {data && <>
      <section className="scenario-edit-card"><p className="scenario-edit-card__help">「共通設定を使う」シナリオに適用します。個別指定の値は維持します。</p><p className="scenario-edit-card__note">変更対象：{data.common_count}作品 ／ 個別指定：{data.custom_count}作品（対象外）</p></section>
      <section className="scenario-edit-card">
        <p className="scenario-edit-card__note">組織共通</p><h3 className="scenario-edit-card__title">追加募集の対象</h3>
        <p className="scenario-edit-card__help">最低開催人数までの不足を、何人まで許容して追加募集するか設定します。</p>
        <RecruitmentTargetFields value={target} onChange={setTarget} minimum={7} disabled={!data.can_edit || saving} idPrefix="common-recruitment" />
        <p className="scenario-edit-card__help">上は最低7人のシナリオの計算例です。実際は各シナリオの最低開催人数で計算します。</p>
      </section>
      <section className="scenario-edit-card"><h3 className="scenario-edit-card__title">個別に変更したい場合</h3><p className="scenario-edit-card__help">シナリオ編集 → ゲーム設定 → 追加募集の対象で「このシナリオだけ指定」を選ぶと、人数または割合で設定できます。</p><p className="scenario-edit-card__note">共通設定の変更は、共通設定を参照する既存シナリオにも適用します。お客様へ案内済みの追加募集期限・不足人数の上限は維持します。追加募集の延長の有効・無効と期限は各シナリオの設定を使います。</p></section>
    </>}
    {message && <p role="status" className="scenario-edit-card__note">{message}</p>}
  </div>
}
