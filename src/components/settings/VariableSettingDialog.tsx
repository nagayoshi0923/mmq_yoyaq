/**
 * 差し込み変数の「値の出どころ」をその場で編集する小さなダイアログ。
 *
 * テンプレ編集中に {company_name} や {cancellation_reason} などをクリックすると、
 * 設定ページへ飛ばずにこのダイアログでその値だけを直して保存できる。
 * 対象（店舗 or 組織）は呼び出し元から storeId / organizationId で受け取り、
 * 送信側と同じく store_id → 無ければ organization_id の行を読み書きする。
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { X, Plus } from 'lucide-react'
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

interface CancelReason {
  id: string
  content: string
}

type EditorKind = 'text' | 'textarea' | 'reasonList'

interface EditorSpec {
  table: 'email_settings' | 'reservation_settings'
  column: string
  label: string
  kind: EditorKind
  description: string
}

// 設定で変えられる変数だけ定義。ここに無い変数はそもそもリンク化されない。
const EDITORS: Record<string, EditorSpec> = {
  company_name: { table: 'email_settings', column: 'company_name', label: '会社名', kind: 'text', description: 'メールの署名などに使う会社名です' },
  company_phone: { table: 'email_settings', column: 'company_phone', label: '電話番号', kind: 'text', description: 'メールの署名などに使う電話番号です' },
  company_email: { table: 'email_settings', column: 'company_email', label: 'メールアドレス', kind: 'text', description: 'メールの署名・返信先に使うアドレスです' },
  rejection_reason: { table: 'email_settings', column: 'private_rejection_reason', label: '貸切却下メールの既定理由', kind: 'textarea', description: '却下メール本文の {rejection_reason} に最初から入る文です（却下時に本文側で上書きもできます）' },
  cancellation_reason: { table: 'reservation_settings', column: 'organizer_cancel_reasons', label: '店舗都合キャンセル理由', kind: 'reasonList', description: '中止/キャンセル操作時に選べる定型理由です' },
}

interface VariableSettingDialogProps {
  variable: string | null
  storeId?: string | null
  organizationId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 保存成功後に呼ばれる。テキスト系のみ新しい値を渡す（プレビュー即時反映用） */
  onSaved?: (variable: string, value: string) => void
}

export function VariableSettingDialog({ variable, storeId, organizationId, open, onOpenChange, onSaved }: VariableSettingDialogProps) {
  const spec = variable ? EDITORS[variable] : undefined
  const state = useOperatingSettings(storeId ? 'store' : 'organization', storeId ?? undefined, open && Boolean(spec))
  const [text, setText] = useState('')
  const [reasons, setReasons] = useState<CancelReason[]>([])
  const { loading, saving, data } = state

  useEffect(() => {
    if (!open || !spec || !data) return
    const current = resolveSetting(spec.column, spec.kind === 'reasonList' ? [] : '', data.layers, SETTING_DEFINITIONS[spec.column]?.scopes).value
    if (spec.kind === 'reasonList') setReasons(Array.isArray(current) ? current as CancelReason[] : [])
    else setText(typeof current === 'string' ? current : '')
  }, [open, spec, data])

  if (!spec) return null

  const value = spec.kind === 'reasonList' ? reasons.filter(r => r.content.trim()) : text

  const handleSave = async () => {
    if (await state.save({ [spec.column]: value })) {
      showToast.success(`${spec.label}を保存しました`)
      if (variable && spec.kind !== 'reasonList') onSaved?.(variable, text)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{spec.label}</DialogTitle>
          <DialogDescription>{spec.description}</DialogDescription>
        </DialogHeader>

        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">読み込み中...</div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">現在の設定元：{SETTING_SCOPE_LABELS[state.resolve(spec.column, '').source]}</p>
            {spec.kind === 'text' && (
              <Input value={text} onChange={(e) => setText(e.target.value)} className="text-sm" />
            )}
            {spec.kind === 'textarea' && (
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="text-sm" />
            )}
            {spec.kind === 'reasonList' && (
              <div className="space-y-2">
                {reasons.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Input
                      value={r.content}
                      onChange={(e) => setReasons(prev => prev.map((x, j) => j === i ? { ...x, content: e.target.value } : x))}
                      placeholder="キャンセル理由を入力"
                      className="text-sm"
                    />
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0"
                      onClick={() => setReasons(prev => prev.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="text-xs"
                  onClick={() => setReasons(prev => [...prev, { id: crypto.randomUUID(), content: '' }])}>
                  <Plus className="h-3 w-3 mr-1" />理由を追加
                </Button>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              {storeId && <Button type="button" variant="outline" disabled={saving || !data?.can_edit} onClick={async () => {
                const inherited = state.inherited(spec.column, spec.kind === 'reasonList' ? [] : '').value
                if (await state.save({ [spec.column]: null })) {
                  if (variable && spec.kind !== 'reasonList') onSaved?.(variable, String(inherited))
                  onOpenChange(false)
                }
              }}>共通設定を使う</Button>}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>キャンセル</Button>
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
