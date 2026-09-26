import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { OperatingTextSettings } from './OperatingTextSettings'
import { PAYMENT_SETTING_FIELDS } from './operatingSettingFields'
import { OperatingScalarSettings } from './OperatingScalarSettings'
import { OPERATION_SETTING_KEYS, SURVEY_SETTING_KEYS } from './operatingSettingFields'
import { CancellationSettings } from '@/pages/Settings/pages/CancellationSettings'
import { EmailSettings } from '@/pages/Settings/pages/EmailSettings'

export function PerformanceOperatingSettings({ eventId }: { eventId?: string | null }) {
  const [section, setSection] = useState('operations')
  if (!eventId) return <p>公演を保存すると個別設定できます。</p>
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">この公演の個別指定を優先します。指定のない項目はシナリオ・店舗・組織共通から引き継ぎます。</p>
    <div className="flex flex-wrap gap-2">{[
      ['operations', '開催判断・準備'], ['payment', '支払い案内'], ['cancellation', 'キャンセル・変更'], ['email', 'メール'], ['survey', '事前配役アンケート'],
    ].map(([key, label]) => <Button key={key} variant={section === key ? 'default' : 'outline'} onClick={() => setSection(key)}>{label}</Button>)}</div>
    {section === 'operations' && <OperatingScalarSettings scope="performance" targetId={eventId} keys={OPERATION_SETTING_KEYS} title="開催判断・準備時間・クーポン" />}
    {section === 'payment' && <OperatingTextSettings scope="performance" targetId={eventId} fields={PAYMENT_SETTING_FIELDS} />}
    {section === 'cancellation' && <CancellationSettings scope="performance" targetId={eventId} />}
    {section === 'email' && <EmailSettings scope="performance" targetId={eventId} />}
    {section === 'survey' && <OperatingScalarSettings scope="performance" targetId={eventId} keys={SURVEY_SETTING_KEYS} title="事前配役アンケート" />}
  </div>
}
