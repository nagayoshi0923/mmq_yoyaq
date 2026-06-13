/**
 * 共通メールテンプレ編集ダイアログ
 *
 * テンプレの key を渡すと「いつ送られるか」の説明＋使える差し込み変数＋本文編集＋
 * 保存をその場で行える。設定画面（EmailSettings）まで行かなくても、テンプレを使う
 * 画面の近くから同じ DB の1か所（email_settings の該当列）を編集できる。
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
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
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
  const [rowId, setRowId] = useState<string | null>(null)
  const [company, setCompany] = useState({ name: '', phone: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // ダイアログを開いたら、対象（店舗 or 組織）の現在値（無ければデフォルト文面）を読み込む
  useEffect(() => {
    if (!open || (!storeId && !organizationId)) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        // storeId があれば店舗の行、無ければ組織の行（貸切リクエスト等で店舗未確定の場合）
        let query = supabase
          .from('email_settings')
          .select(`id, company_name, company_phone, company_email, ${templateKey}`)
        query = storeId
          ? query.eq('store_id', storeId)
          : query.eq('organization_id', organizationId as string)
        const { data, error } = await query.limit(1).maybeSingle()
        if (error && error.code !== 'PGRST116') throw error
        if (cancelled) return

        const companyName = data?.company_name || ''
        const companyPhone = data?.company_phone || ''
        const companyEmail = data?.company_email || ''
        setCompany({ name: companyName, phone: companyPhone, email: companyEmail })
        setRowId(data?.id ?? null)

        const current = (data as Record<string, unknown> | null)?.[templateKey] as string | undefined
        setValue(current || config.getDefault(companyName, companyPhone, companyEmail))
      } catch (e) {
        logger.error('テンプレ取得エラー:', e)
        if (!cancelled) {
          setValue(config.getDefault('', '', ''))
          showToast.error('テンプレートの読み込みに失敗しました')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, storeId, organizationId, templateKey, config])

  const handleReset = () => {
    setValue(config.getDefault(company.name, company.phone, company.email))
  }

  const handleSave = async () => {
    if (!storeId && !organizationId) return
    setSaving(true)
    try {
      if (rowId) {
        const { error } = await supabase
          .from('email_settings')
          .update({ [templateKey]: value })
          .eq('id', rowId)
        if (error) throw error
      } else if (storeId) {
        // email_settings 行が未作成の店舗 → 組織IDを取得して新規作成
        const { data: store } = await supabase
          .from('stores')
          .select('organization_id')
          .eq('id', storeId)
          .maybeSingle()
        const { data: inserted, error } = await supabase
          .from('email_settings')
          .insert({ store_id: storeId, organization_id: store?.organization_id, [templateKey]: value })
          .select('id')
          .single()
        if (error) throw error
        setRowId(inserted?.id ?? null)
      } else if (organizationId) {
        // 組織に email_settings 行が無い → 組織レベルの行を新規作成（store_id は null）。
        // 送信側の organization_id フォールバックがこの行を引く。
        const { data: inserted, error } = await supabase
          .from('email_settings')
          .insert({ organization_id: organizationId, [templateKey]: value })
          .select('id')
          .single()
        if (error) throw error
        setRowId(inserted?.id ?? null)
      } else {
        showToast.error('保存先のメール設定が見つかりませんでした')
        return
      }
      showToast.success('テンプレートを保存しました')
      onSaved?.(value)
      onOpenChange(false)
    } catch (e) {
      logger.error('テンプレ保存エラー:', e)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
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

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">読み込み中...</div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                使用可能な変数:
                <span className="ml-2 font-normal text-[11px]">（下線付きはクリックで設定画面を開きます）</span>
              </p>
              <VariableHintChips variables={variables} storeId={storeId} organizationId={organizationId} />
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
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">{renderTemplateWithSamples(value)}</pre>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={saving}>
                デフォルトに戻す
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  キャンセル
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving || (!storeId && !organizationId)}>
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
