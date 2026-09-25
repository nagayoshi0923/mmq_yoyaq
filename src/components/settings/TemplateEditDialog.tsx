/**
 * 共通メールテンプレ編集ダイアログ
 *
 * テンプレの key を渡すと「いつ送られるか」の説明＋使える差し込み変数＋本文編集＋
 * 保存をその場で行える。設定画面（EmailSettings）まで行かなくても、テンプレを使う
 * 画面の近くから同じ組織・店舗の継承設定を編集できる。
 *
 * 設計の経緯は docs/refactoring/template-editing-triage-plan.md を参照。
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useOperatingSettings } from '@/hooks/useOperatingSettings'
import { resolveSetting, SETTING_SCOPE_LABELS } from '../../../supabase/functions/_shared/settings-inheritance'
import { showToast } from '@/utils/toast'
import { SETTING_DEFINITIONS } from '../../../supabase/functions/_shared/setting-definitions'
import {
  type EmailTemplateKey,
  getTemplateConfig,
  getTemplateVariables,
  renderTemplateWithSamples,
} from '@/lib/templateRegistry'
import { VariableHintChips } from '@/components/settings/VariableHintChips'

interface TemplateEditDialogProps {
  /** 編集するテンプレ（= email_settings の列名） */
  templateKey: EmailTemplateKey
  /** 対象店舗。email_settings は店舗ごとに1行 */
  storeId: string | null | undefined
  /** storeId が無い場合のフォールバック。組織の email_settings 行を編集する（貸切リクエスト等） */
  organizationId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 保存成功後に呼ばれる。呼び出し元のメモリ上の値を更新する用 */
  onSaved?: (value: string) => void
}

export function TemplateEditDialog({
  templateKey,
  storeId,
  organizationId,
  open,
  onOpenChange,
  onSaved,
}: TemplateEditDialogProps) {
  const config = getTemplateConfig(templateKey)
  const [value, setValue] = useState('')
  const state = useOperatingSettings(storeId ? 'store' : 'organization', storeId ?? undefined, open)
  const [company, setCompany] = useState({ name: '', phone: '', email: '' })
  const { loading, saving, data } = state
  const [showPreview, setShowPreview] = useState(false)
  // プレビューで使う実値（設定済みの会社情報・却下既定理由など）。サンプル値より優先
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !data) return
    const get = (key: string) => String(resolveSetting(key, '', data.layers, SETTING_DEFINITIONS[key]?.scopes).value)
    const name = get('company_name'), phone = get('company_phone'), email = get('company_email')
    setCompany({ name, phone, email })
    setPreviewOverrides({ company_name: name, company_phone: phone, company_email: email, rejection_reason: get('private_rejection_reason') })
    setValue(get(templateKey) || config.getDefault(name, phone, email))
  }, [open, data, templateKey, config])

  const handleReset = () => setValue(config.getDefault(company.name, company.phone, company.email))
  const handleSave = async () => {
    if (await state.save({ [templateKey]: value })) {
      showToast.success('テンプレートを保存しました')
      onSaved?.(value)
      onOpenChange(false)
    }
  }

  const variables = getTemplateVariables(config)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>送信タイミング: {config.description}</DialogDescription>
        </DialogHeader>

        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">読み込み中...</div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">現在の設定元：{SETTING_SCOPE_LABELS[state.resolve(templateKey, '').source]}</p>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                使用可能な変数:
                <span className="ml-2 font-normal text-[11px]">（下線付きはクリックで設定画面を開きます）</span>
              </p>
              <VariableHintChips
                variables={variables}
                storeId={storeId}
                organizationId={organizationId}
                onVariableSaved={(v, val) => setPreviewOverrides(prev => ({ ...prev, [v]: val }))}
              />
            </div>

            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={16}
              className="font-mono text-sm"
              placeholder="メールテンプレートを編集"
            />

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
                <div className="mt-1 rounded-md border bg-gray-50 p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    差し込み変数をサンプル値に置き換えた、実際に送られる全文のイメージです。
                  </p>
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">{renderTemplateWithSamples(value, previewOverrides)}</pre>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={saving}>
                標準文面を引用
              </Button>
              {storeId && <Button type="button" variant="outline" size="sm" disabled={saving || !data?.can_edit} onClick={async () => {
                const inherited = String(state.inherited(templateKey, '').value) || config.getDefault(company.name, company.phone, company.email)
                if (await state.save({ [templateKey]: null })) { onSaved?.(inherited); onOpenChange(false) }
              }}>共通設定を使う</Button>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  キャンセル
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving || !state.data?.can_edit}>
                  {saving ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
