/**
 * 予約確定 / 貸切確定メールの公演上書き編集。
 * 空で保存すると上書きを消し、シナリオ → 店舗 → 組織共通の順に戻る。
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useOperatingSettings } from '@/hooks/useOperatingSettings'
import { SETTING_SCOPE_LABELS, resolveSetting, resolveInheritedSetting, type SettingSource } from '../../../supabase/functions/_shared/settings-inheritance'
import { showToast } from '@/utils/toast'
import { SETTING_DEFINITIONS } from '../../../supabase/functions/_shared/setting-definitions'
import {
  getTemplateConfig,
  getTemplateVariables,
  renderTemplateWithSamples,
  type EmailTemplateKey,
} from '@/lib/templateRegistry'
import { VariableHintChips } from '@/components/settings/VariableHintChips'


export type ConfirmationOverrideKey =
  | 'reservation_confirmation_template'
  | 'private_confirm_template'

const OVERRIDE_COPY: Record<ConfirmationOverrideKey, {
  title: string
  scope: string
  storeLabel: string
  saveSuccess: string
  placeholder: string
}> = {
  reservation_confirmation_template: {
    title: 'この公演の予約確認メール',
    scope: 'この公演の通常予約だけに使います',
    storeLabel: '店舗の予約確認テンプレ',
    saveSuccess: 'この公演の予約確認メールを保存しました',
    placeholder: '空欄のままなら、シナリオ・店舗・組織共通の予約確認テンプレを使います',
  },
  private_confirm_template: {
    title: 'この公演の貸切確定メール',
    scope: 'この公演の貸切承認だけに使います',
    storeLabel: '店舗の貸切確定テンプレ',
    saveSuccess: 'この公演の貸切確定メールを保存しました',
    placeholder: '空欄のままなら、シナリオ・店舗・組織共通の貸切確定テンプレを使います',
  },
}

interface ConfirmationEmailOverrideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateKey?: ConfirmationOverrideKey
  eventId: string | null | undefined
  storeId: string | null | undefined
  organizationScenarioId?: string | null
}

export function ConfirmationEmailOverrideDialog({
  open,
  onOpenChange,
  templateKey = 'reservation_confirmation_template',
  eventId,
  storeId,
  organizationScenarioId,
}: ConfirmationEmailOverrideDialogProps) {
  const config = getTemplateConfig(templateKey as EmailTemplateKey)
  const copy = OVERRIDE_COPY[templateKey]
  const [value, setValue] = useState('')
  const [savedOverride, setSavedOverride] = useState('')
  const [fallbackTemplate, setFallbackTemplate] = useState('')
  const [fallbackSource, setFallbackSource] = useState<SettingSource>('default')
  const state = useOperatingSettings('performance', eventId ?? undefined, open)
  const { loading, saving, data } = state
  const [showPreview, setShowPreview] = useState(false)
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !data) return
    const get = (key: string) => String(resolveSetting(key, '', data.layers, SETTING_DEFINITIONS[key]?.scopes).value)
    const name = get('company_name'), phone = get('company_phone'), email = get('company_email')
    setPreviewOverrides({ company_name: name, company_phone: phone, company_email: email })
    const override = data.layers.performance?.[templateKey]
    const fallback = resolveInheritedSetting(templateKey, '', data.layers, 'performance')
    setValue(typeof override === 'string' ? override : '')
    setSavedOverride(typeof override === 'string' ? override : '')
    setFallbackTemplate(String(fallback.value) || config.getDefault(name, phone, email))
    setFallbackSource(fallback.source)
  }, [open, data, config, templateKey])

  const handleCopyFallback = () => setValue(fallbackTemplate)
  const handleClear = () => setValue('')
  const handleSave = async () => {
    if (await state.save({ [templateKey]: value.trim() || null })) {
      showToast.success(value.trim() ? copy.saveSuccess : '個別指定を解除し、共通設定に戻しました')
      onOpenChange(false)
    }
  }

  const variables = getTemplateVariables(config)
  const hasOverride = Boolean(value.trim())
  const activeSource: SettingSource = hasOverride ? 'performance' : fallbackSource
  const fallbackLabel = SETTING_SCOPE_LABELS[fallbackSource]
  const activeLabel = SETTING_SCOPE_LABELS[activeSource]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            空欄なら {fallbackLabel} を送ります。書いた内容は{copy.scope}。
          </DialogDescription>
        </DialogHeader>

        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">読み込み中...</div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              今送られる文面: {activeLabel}
              {savedOverride ? '（保存済みの上書きあり）' : ''}
            </p>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">使用可能な変数:</p>
              <VariableHintChips
                variables={variables}
                storeId={storeId}
                onVariableSaved={(v, val) => setPreviewOverrides(prev => ({ ...prev, [v]: val }))}
              />
            </div>

            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={16}
              className="font-mono text-sm"
              placeholder={copy.placeholder}
            />

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCopyFallback} disabled={saving}>
                テンプレを引用
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleClear} disabled={saving || !value}>
                上書きをやめる
              </Button>
            </div>

            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowPreview(v => !v)}
              >
                {showPreview ? '▼ 送信プレビューを隠す' : '▶ 送信プレビューを見る（サンプル値）'}
              </Button>
              {showPreview && (
                <div className="mt-1 rounded-md border bg-muted/40 p-3">
                  <pre className="whitespace-pre-wrap text-sm font-sans">
                    {renderTemplateWithSamples(value.trim() || fallbackTemplate, previewOverrides)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                キャンセル
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving || !state.data?.can_edit}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
