import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import { recruitmentNotice } from '../../../../../supabase/functions/_shared/recruitment-notice'

export function RecruitmentEmailSample({ masterId, scenarioName }: { masterId?: string | null; scenarioName: string }) {
  const [minutes, setMinutes] = useState(90)
  const [missing, setMissing] = useState(2)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    if (masterId) void apiClient.get<{ setting: { recruitment_deadline_minutes: number; recruitment_max_missing: number } | null }>(`/api/schedule?type=recruitment-settings&id=${encodeURIComponent(masterId)}`).then(({ setting }) => {
      if (active && setting) { setMinutes(setting.recruitment_deadline_minutes); setMissing(setting.recruitment_max_missing) }
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [masterId])
  const sample = recruitmentNotice({ scenario: scenarioName || 'シナリオ名', date: '2030-01-01', start_time: '18:00', store_name: '開催店舗名', deadline: new Date(new Date('2030-01-01T18:00:00+09:00').getTime() - minutes * 60000).toISOString(), was_confirmed: false, missing_participants: missing, site_url: 'https://mmq.game' }, 'お客様専用リンク')
  return <section className="scenario-edit-card">
    <h3 className="scenario-edit-card__title">追加募集メールのサンプル</h3>
    <p className="scenario-edit-card__help">通常の予約確定メールとは別に、追加募集の開始時に送信します。以下は18:00開演の例です。実際の公演日時・人数・案内済み期限・専用リンクに置き換わります。</p>
    {error && <p className="scenario-edit-card__note" role="alert">設定を取得できなかったため、初期値（不足2名・90分前）で表示しています。</p>}
    <p className="scenario-edit-card__help">件名：{sample.subject}</p>
    <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">{sample.text}</div>
    <p className="scenario-edit-card__note">開催決定後の欠員では、その事情に合わせた文面で送信します。このサンプルは送信されません。</p>
  </section>
}
