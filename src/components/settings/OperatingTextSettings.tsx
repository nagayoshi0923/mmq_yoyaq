import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOperatingSettings } from '@/hooks/useOperatingSettings'
import { SETTING_SCOPE_LABELS, type SettingScope } from '../../../supabase/functions/_shared/settings-inheritance'

export interface TextSettingField { key: string; label: string; fallback: string; multiline?: boolean }
export function OperatingTextSettings({ scope, targetId, fields }: {
  scope: SettingScope; targetId?: string; fields: TextSettingField[]
}) {
  const state = useOperatingSettings(scope, targetId)
  const disabled = !state.data?.can_edit || state.saving || state.loading
  return <div className="space-y-6">
    {state.error && <div role="alert" className="space-y-2"><p>{state.error}</p><Button variant="outline" onClick={() => void state.reload()}>再読み込み</Button></div>}
    {state.loading ? <p role="status">読み込み中…</p> : state.data && <>
      {fields.map(field => {
        const resolved = state.resolve(field.key, field.fallback)
        const inherited = state.inherited(field.key, field.fallback)
        const custom = resolved.source === scope
        const id = `setting-${scope}-${field.key}`
        return <div key={field.key} className="space-y-2">
          <Label htmlFor={id}>{field.label}</Label>
          {scope !== 'organization' && <Select value={custom ? 'custom' : 'common'} disabled={disabled}
            onValueChange={value => state.set(field.key, value === 'common' ? null : resolved.value)}>
            <SelectTrigger aria-label={`${field.label}の設定元`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="common">共通設定を使う（{SETTING_SCOPE_LABELS[inherited.source]}）</SelectItem>
              <SelectItem value="custom">この{SETTING_SCOPE_LABELS[scope]}で指定</SelectItem></SelectContent>
          </Select>}
          {(scope === 'organization' || custom) && (field.multiline
            ? <Textarea id={id} value={String(resolved.value)} disabled={disabled} onChange={e => state.set(field.key, e.target.value)} />
            : <Input id={id} value={String(resolved.value)} disabled={disabled} onChange={e => state.set(field.key, e.target.value)} />)}
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">適用値：{String(resolved.value) || '（空欄）'}（{SETTING_SCOPE_LABELS[resolved.source]}）</p>
        </div>
      })}
      {state.data.can_edit && <Button disabled={disabled || !state.dirty} onClick={() => void state.save()}>{state.saving ? '保存中…' : '保存'}</Button>}
    </>}
    {state.message && <p role="status">{state.message}</p>}
  </div>
}
