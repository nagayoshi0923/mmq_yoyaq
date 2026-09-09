/**
 * 予約確定 / 貸切確定メールの公演上書き編集。
 * 空で保存すると上書きを消し、作品上書き → 店舗テンプレの順に戻る。
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
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import {
  getTemplateConfig,
  getTemplateVariables,
  renderTemplateWithSamples,
  type EmailTemplateKey,
} from '@/lib/templateRegistry'
import { VariableHintChips } from '@/components/settings/VariableHintChips'
import {
  confirmationSourceLabel,
  pickConfirmationEmailTemplate,
  type ConfirmationTemplateSource,
} from '@/lib/confirmationEmailTemplate'

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
    placeholder: '空欄のままなら、作品または店舗の予約確認テンプレを使います',
  },
  private_confirm_template: {
    title: 'この公演の貸切確定メール',
    scope: 'この公演の貸切承認だけに使います',
    storeLabel: '店舗の貸切確定テンプレ',
    saveSuccess: 'この公演の貸切確定メールを保存しました',
    placeholder: '空欄のままなら、作品または店舗の貸切確定テンプレを使います',
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
  const [fallbackSource, setFallbackSource] = useState<ConfirmationTemplateSource>('store')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !eventId) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const orgId = await getCurrentOrganizationId()
        const eventQuery = supabase
          .from('schedule_events')
          .select('reservation_confirmation_template, private_confirm_template, organization_id, organization_scenario_id')
          .eq('id', eventId)
        const { data: eventRow, error: eventError } = orgId
          ? await eventQuery.eq('organization_id', orgId).maybeSingle()
          : await eventQuery.maybeSingle()
        if (eventError) throw eventError

        const scenarioId = organizationScenarioId || eventRow?.organization_scenario_id
        let scenarioTemplate: string | null = null
        if (scenarioId) {
          let scenarioQuery = supabase
            .from('organization_scenarios')
            .select('reservation_confirmation_template, private_confirm_template')
            .eq('id', scenarioId)
          if (orgId) scenarioQuery = scenarioQuery.eq('organization_id', orgId)
          const { data: scenarioRow } = await scenarioQuery.maybeSingle()
          scenarioTemplate = scenarioRow?.[templateKey] ?? null
        }

        let storeQuery = supabase
          .from('email_settings')
          .select('company_name, company_phone, company_email, reservation_confirmation_template, private_confirm_template')
        storeQuery = storeId
          ? storeQuery.eq('store_id', storeId)
          : orgId
            ? storeQuery.eq('organization_id', orgId)
            : storeQuery
        const { data: storeRow } = await storeQuery.limit(1).maybeSingle()

        if (cancelled) return
        const companyName = storeRow?.company_name || ''
        const companyPhone = storeRow?.company_phone || ''
        const companyEmail = storeRow?.company_email || ''
        setPreviewOverrides({
          company_name: companyName,
          company_phone: companyPhone,
          company_email: companyEmail,
        })

        const override = eventRow?.[templateKey]?.trim() || ''
        const fallback = pickConfirmationEmailTemplate({
          eventTemplate: null,
          scenarioTemplate,
          storeTemplate: storeRow?.[templateKey],
        })
        setSavedOverride(override)
        setValue(override)
        setFallbackTemplate(fallback.template || config.getDefault(companyName, companyPhone, companyEmail))
        setFallbackSource(fallback.source)
      } catch (e) {
        logger.error('公演メール上書きの読み込みエラー:', e)
        if (!cancelled) {
          showToast.error('テンプレートの読み込みに失敗しました')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, eventId, storeId, organizationScenarioId, config, templateKey])

  const handleCopyFallback = () => {
    setValue(fallbackTemplate)
  }

  const handleClear = () => {
    setValue('')
  }

  const handleSave = async () => {
    if (!eventId) return
    setSaving(true)
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        showToast.error('組織が特定できないため保存できません')
        return
      }
      const next = value.trim() || null
      const { error } = await supabase
        .from('schedule_events')
        .update({ [templateKey]: next })
        .eq('id', eventId)
        .eq('organization_id', orgId)
      if (error) throw error
      setSavedOverride(next || '')
      showToast.success(next ? copy.saveSuccess : '上書きを解除し、下の段のテンプレに戻しました')
      onOpenChange(false)
    } catch (e) {
      logger.error('公演メール上書きの保存エラー:', e)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const variables = getTemplateVariables(config)
  const hasOverride = Boolean(value.trim())
  const activeSource: ConfirmationTemplateSource = hasOverride ? 'event' : fallbackSource
  const fallbackLabel = confirmationSourceLabel(fallbackSource, copy.storeLabel)
  const activeLabel = confirmationSourceLabel(activeSource, copy.storeLabel)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            空欄なら {fallbackLabel} を送ります。書いた内容は{copy.scope}。
          </DialogDescription>
        </DialogHeader>

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
              <Button type="button" onClick={handleSave} disabled={saving || !eventId}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
