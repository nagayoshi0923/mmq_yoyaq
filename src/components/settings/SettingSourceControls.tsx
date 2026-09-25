import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SETTING_DEFINITIONS } from '../../../supabase/functions/_shared/setting-definitions'
import { SETTING_SCOPE_LABELS, type SettingScope, type SettingValue } from '../../../supabase/functions/_shared/settings-inheritance'
import type { useOperatingSettings } from '@/hooks/useOperatingSettings'

export function SettingSourceControls({ state, scope, keys, defaults }: {
  state: ReturnType<typeof useOperatingSettings>; scope: SettingScope; keys: string[]; defaults: Record<string, SettingValue>
}) {
  return <section className="rounded-xl border p-4 space-y-3">
    <p className="text-sm">{scope === 'organization' ? '組織共通の設定です。個別指定のない項目に適用します。' : '共通設定を引き継ぎ、変更した項目だけこの対象で個別指定します。'}</p>
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
    <details><summary className="cursor-pointer">項目ごとの設定元を確認・変更</summary>
      <div className="grid gap-4 mt-4">{keys.map(key => {
        const resolved = state.resolve(key, defaults[key] ?? '')
        const inherited = state.inherited(key, defaults[key] ?? '')
        return <div key={key} className="space-y-1"><p className="text-sm">{SETTING_DEFINITIONS[key].label}：{SETTING_SCOPE_LABELS[resolved.source]}</p>
          {scope !== 'organization' && <Select value={resolved.source === scope ? 'custom' : 'common'} disabled={state.saving || !state.data?.can_edit}
            onValueChange={value => state.set(key, value === 'common' ? null : resolved.value)}>
            <SelectTrigger aria-label={`${SETTING_DEFINITIONS[key].label}の設定元`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="common">共通設定を使う（{SETTING_SCOPE_LABELS[inherited.source]}）</SelectItem>
              <SelectItem value="custom">この{SETTING_SCOPE_LABELS[scope]}で指定</SelectItem></SelectContent>
          </Select>}
        </div>
      })}</div>
    </details>
  </section>
}
