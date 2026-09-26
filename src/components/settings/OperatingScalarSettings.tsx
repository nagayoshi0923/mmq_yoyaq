import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useOperatingSettings } from '@/hooks/useOperatingSettings'
import { SettingSourceControls } from './SettingSourceControls'
import { SETTING_DEFINITIONS, isValidSettingValue } from '../../../supabase/functions/_shared/setting-definitions'
import { SETTING_DEFAULTS } from '../../../supabase/functions/_shared/setting-defaults'
import { SETTING_SCOPE_LABELS, type SettingScope } from '../../../supabase/functions/_shared/settings-inheritance'

export function OperatingScalarSettings({ scope, targetId, keys, title }: { scope: SettingScope; targetId?: string; keys: string[]; title: string }) {
  const state = useOperatingSettings(scope, targetId)
  if (scope !== 'organization' && !targetId) return <p>対象を保存すると設定できます。</p>
  if (state.loading) return <p role="status">読み込み中…</p>
  if (!state.data) return <div role="alert"><p>{state.error}</p><Button onClick={() => void state.reload()}>再読み込み</Button></div>
  const disabled = state.saving || !state.data.can_edit
  const valid = keys.every(key => isValidSettingValue(key, state.resolve(key, SETTING_DEFAULTS[key]).value, scope))
  return <section className="space-y-4 rounded-xl border p-6">
    <h3 className="font-semibold">{title}</h3>
    {keys.includes('judgment_minutes_before') && <p className="text-sm text-muted-foreground">案内済みの開催判断・追加募集の期限は変更されません。</p>}
    {keys.includes('survey_deadline_days') && <p className="text-sm text-muted-foreground">変更した回答期限は、これから案内するグループに適用します。案内済みの期限は維持します。</p>}
    {keys.includes('coupon_usage_enabled') && <p className="text-muted-foreground">変更はこれから成立する予約へ適用します。予約済みの受付条件と配布済みクーポンの利用条件は保持します。</p>}
    <SettingSourceControls state={state} scope={scope} keys={keys} defaults={SETTING_DEFAULTS} />
    {keys.map(key => {
      const definition = SETTING_DEFINITIONS[key]
      const effective = state.resolve(key, SETTING_DEFAULTS[key])
      const id = `operating-${scope}-${key}`
      return <div key={key} className="space-y-2">
        <Label htmlFor={id}>{definition.label}</Label>
        {definition.kind === 'boolean' ? <div><Checkbox id={id} checked={effective.value === true} disabled={disabled} onCheckedChange={checked => state.set(key, checked === true)} /></div>
          : <Input id={id} type={definition.kind === 'integer' ? 'number' : 'text'}
            min={definition.min} max={definition.max} step={1} disabled={disabled}
            value={typeof effective.value === 'number' && !Number.isFinite(effective.value) ? '' : String(effective.value)}
            onChange={e => state.set(key, definition.kind === 'integer' ? e.target.value === '' ? NaN : Number(e.target.value) : e.target.value)} />}
        <p className="text-xs text-muted-foreground">設定元：{SETTING_SCOPE_LABELS[effective.source]}</p>
      </div>
    })}
    {!valid && <p role="alert">数値の範囲とURLを確認してください。</p>}
    {state.data.can_edit && <Button disabled={disabled || !state.dirty || !valid} onClick={() => void state.save()}>{state.saving ? '保存中…' : '保存'}</Button>}
  </section>
}
