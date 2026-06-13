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
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

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
}

export function VariableSettingDialog({ variable, storeId, organizationId, open, onOpenChange }: VariableSettingDialogProps) {
  const spec = variable ? EDITORS[variable] : undefined
  const [rowId, setRowId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [reasons, setReasons] = useState<CancelReason[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !spec || (!storeId && !organizationId)) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        let query = supabase.from(spec.table).select(`id, ${spec.column}`)
        query = storeId ? query.eq('store_id', storeId) : query.eq('organization_id', organizationId as string)
        const { data, error } = await query.limit(1).maybeSingle()
        if (error && error.code !== 'PGRST116') throw error
        if (cancelled) return

        setRowId((data as { id?: string } | null)?.id ?? null)
        const current = (data as Record<string, unknown> | null)?.[spec.column]
        if (spec.kind === 'reasonList') {
          setReasons(Array.isArray(current) ? (current as CancelReason[]) : [])
        } else {
          setText(typeof current === 'string' ? current : '')
        }
      } catch (e) {
        logger.error('設定値の取得エラー:', e)
        if (!cancelled) showToast.error('設定の読み込みに失敗しました')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, spec, storeId, organizationId])

  if (!spec) return null

  const value = spec.kind === 'reasonList' ? reasons.filter(r => r.content.trim()) : text

  const handleSave = async () => {
    if (!storeId && !organizationId) return
    setSaving(true)
    try {
      if (rowId) {
        const { error } = await supabase.from(spec.table).update({ [spec.column]: value }).eq('id', rowId)
        if (error) throw error
      } else if (storeId) {
        const { data: store } = await supabase.from('stores').select('organization_id').eq('id', storeId).maybeSingle()
        const { data: inserted, error } = await supabase
          .from(spec.table)
          .insert({ store_id: storeId, organization_id: store?.organization_id, [spec.column]: value })
          .select('id').single()
        if (error) throw error
        setRowId(inserted?.id ?? null)
      } else if (organizationId) {
        const { data: inserted, error } = await supabase
          .from(spec.table)
          .insert({ organization_id: organizationId, [spec.column]: value })
          .select('id').single()
        if (error) throw error
        setRowId(inserted?.id ?? null)
      }
      showToast.success(`${spec.label}を保存しました`)
      onOpenChange(false)
    } catch (e) {
      logger.error('設定値の保存エラー:', e)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{spec.label}</DialogTitle>
          <DialogDescription>{spec.description}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">読み込み中...</div>
        ) : (
          <div className="space-y-3">
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>キャンセル</Button>
              <Button type="button" onClick={handleSave} disabled={saving || (!storeId && !organizationId)}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
