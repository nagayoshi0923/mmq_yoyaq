import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import { useOrganization } from '@/hooks/useOrganization'
import { toJstYmd, formatJstYmd } from '@/utils/jstDate'
import { Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/patterns/modal'

interface Store {
  id: string
  name: string
  short_name: string
  ownership_type?: 'corporate' | 'franchise' | 'office'
}

interface Scenario {
  id: string
  title: string
  author: string
}

// ダイアログ内の「公演（任意）」Select 候補（調整の公演紐付け用）
export interface AdjustmentEventOption {
  id: string
  date: string
  scenario_title: string
  store_id?: string
  store_name?: string
}

export interface ProductionCostItem {
  id: string
  date: string
  category: string
  amount: number
  description?: string
  store_id?: string | null
  scenario_id?: string | null
  // 収支調整由来のとき（income の復元・公演紐付け）
  type?: 'income' | 'expense'
  schedule_event_id?: string | null
}

// 統合ダイアログの種別。'production'=制作費 / 'expense'=その他支出（調整）/ 'income'=収入（調整）
type EntryKind = 'production' | 'expense' | 'income'

interface ProductionCostDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  stores: Store[]
  defaultStoreId?: string
  editingItem?: ProductionCostItem | null  // 編集モード用
  // 種別=その他支出/収入 の「公演（任意）」Select 候補（当期間の公演）
  events?: AdjustmentEventOption[]
  // 制作費の種別を選べるようにするか（フランチャイズ集計時のみ true）。
  // false のときは種別 Select から「制作費」を除外し、その他支出/収入のみ扱う。
  allowProductionKind?: boolean
}

// カテゴリ ⇔ 種別の相互変換
function kindFromItem(item: ProductionCostItem): EntryKind {
  if (item.type === 'income') return 'income'
  if (item.category === '制作費') return 'production'
  return 'expense'
}

function categoryForKind(kind: EntryKind): string {
  if (kind === 'production') return '制作費'
  if (kind === 'income') return '調整（収入）'
  return '調整（支出）'
}

/**
 * 制作費・収支調整 統合ダイアログ
 * miscellaneous_transactions に「制作費 / その他支出 / 収入」を登録・編集・削除する。
 * 種別に応じて category / type を切り替える（集計側の振り分けと互換）。
 */
export const ProductionCostDialog: React.FC<ProductionCostDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  stores,
  defaultStoreId,
  editingItem,
  events = [],
  allowProductionKind = false
}) => {
  const { organizationId } = useOrganization()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  // 種別（制作費 / その他支出 / 収入）
  const [kind, setKind] = useState<EntryKind>(allowProductionKind ? 'production' : 'expense')
  const [formData, setFormData] = useState({
    date: toJstYmd(new Date()),
    category: '制作費',
    amount: 0,
    description: '',
    store_id: defaultStoreId || '',
    scenario_id: ''
  })
  // 調整（その他支出/収入）の公演紐付け ID（''=紐づけない）
  const [selectedEventId, setSelectedEventId] = useState('')

  const isEditMode = !!editingItem

  // シナリオを読み込み（制作費の紐付け用）
  useEffect(() => {
    const loadScenarios = async () => {
      if (!organizationId) return

      try {
        let query = supabase
          .from('organization_scenarios_with_master')
          .select('id, title, author')

        // organization_id でフィルタ（マルチテナント対応）
        query = query.eq('organization_id', organizationId)

        query = query.order('title', { ascending: true })

        const { data, error } = await query

        if (error) throw error
        setScenarios(data || [])
      } catch (error) {
        logger.error('シナリオ読み込みエラー:', error)
      }
    }

    if (isOpen && organizationId) {
      loadScenarios()
    }
  }, [isOpen, organizationId])

  // ダイアログが開かれた時にフォームをリセット/設定
  useEffect(() => {
    if (!isOpen) return
    if (editingItem) {
      // 編集モード：既存データから種別を復元
      const restoredKind = kindFromItem(editingItem)
      setKind(restoredKind)
      setFormData({
        date: editingItem.date,
        category: editingItem.category,
        amount: editingItem.amount,
        description: editingItem.description || '',
        store_id: editingItem.store_id || '',
        scenario_id: editingItem.scenario_id || ''
      })
      setSelectedEventId(editingItem.schedule_event_id || '')
    } else {
      // 追加モード：デフォルト値
      const defaultKind: EntryKind = allowProductionKind ? 'production' : 'expense'
      setKind(defaultKind)
      setFormData({
        date: toJstYmd(new Date()),
        category: categoryForKind(defaultKind),
        amount: 0,
        description: '',
        store_id: defaultStoreId || '',
        scenario_id: ''
      })
      setSelectedEventId('')
    }
  }, [isOpen, defaultStoreId, editingItem, allowProductionKind])

  // 選択中の公演（調整の公演紐付け）
  const selectedEvent = events.find(ev => ev.id === selectedEventId)

  // 種別変更時：カテゴリを種別既定に合わせる
  const handleKindChange = (value: EntryKind) => {
    setKind(value)
    setFormData(prev => ({
      ...prev,
      // 制作費以外を選んだら固定ラベルに、制作費に戻したら既定 '制作費' に
      category: value === 'production' ? (prev.category || '制作費') : categoryForKind(value)
    }))
  }

  // 公演 Select 変更時：日付を公演日に合わせる（未選択なら紐付け解除）
  const handleEventChange = (value: string) => {
    if (value === 'none') {
      setSelectedEventId('')
      return
    }
    setSelectedEventId(value)
    const ev = events.find(e => e.id === value)
    if (ev?.date) {
      setFormData(prev => ({ ...prev, date: ev.date }))
    }
  }

  const isAdjustmentKind = kind === 'expense' || kind === 'income'

  const handleSave = async () => {
    if (!formData.amount || formData.amount <= 0) {
      showToast.warning('金額を入力してください')
      return
    }

    // 調整（その他支出/収入）はメモ必須
    if (isAdjustmentKind && !formData.description.trim()) {
      showToast.warning('内容メモを入力してください')
      return
    }

    if (!organizationId) {
      showToast.error('組織情報が取得できません。再ログインしてください。')
      return
    }

    setLoading(true)
    try {
      const saveData = {
        date: formData.date,
        type: (kind === 'income' ? 'income' : 'expense') as 'income' | 'expense',
        category: kind === 'production' ? (formData.category || '制作費') : categoryForKind(kind),
        amount: formData.amount,
        description: formData.description.trim(),
        // 制作費は店舗/シナリオ、調整は公演から店舗を解決
        store_id: kind === 'production'
          ? (formData.store_id || null)
          : (selectedEvent?.store_id || null),
        scenario_id: kind === 'production' ? (formData.scenario_id || null) : null,
        schedule_event_id: isAdjustmentKind ? (selectedEvent?.id || null) : null,
        organization_id: organizationId
      }

      const successLabel = kind === 'production' ? '制作費' : '収支調整'

      if (isEditMode && editingItem) {
        // 更新
        const { error } = await supabase
          .from('miscellaneous_transactions')
          .update(saveData)
          .eq('id', editingItem.id)

        if (error) throw error
        showToast.success(`${successLabel}を更新しました`)
      } else {
        // 新規作成
        const { error } = await supabase
          .from('miscellaneous_transactions')
          .insert([saveData])

        if (error) throw error
        showToast.success(`${successLabel}を${kind === 'production' ? '追加' : '登録'}しました`)
      }

      onSave()
      onClose()
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = () => {
    if (!editingItem) return
    setIsDeleteConfirmOpen(true)
  }

  const runDelete = async () => {
    if (!editingItem) return

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('miscellaneous_transactions')
        .delete()
        .eq('id', editingItem.id)

      if (error) throw error

      showToast.success('削除しました')
      onSave()
      onClose()
    } catch (error) {
      logger.error('削除エラー:', error)
      showToast.error('削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  const titleLabel = isEditMode ? '編集' : '追加'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>制作費・調整を{titleLabel}</DialogTitle>
          <DialogDescription>
            制作費・その他支出・収入を登録します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>種別</Label>
              <Select value={kind} onValueChange={(v: EntryKind) => handleKindChange(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(allowProductionKind || kind === 'production') && <SelectItem value="production">制作費</SelectItem>}
                  <SelectItem value="expense">その他支出</SelectItem>
                  <SelectItem value="income">収入</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>金額</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="0"
                value={formData.amount || ''}
                onChange={(e) => {
                  const v = e.target.value
                  setFormData({ ...formData, amount: v === '' ? 0 : (parseInt(v, 10) || 0) })
                }}
              />
            </div>
          </div>

          {/* 制作費：店舗・シナリオ・カテゴリ */}
          {kind === 'production' && (
            <>
              <div>
                <Label>店舗</Label>
                <Select
                  value={formData.store_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, store_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="店舗を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">全社</SelectItem>
                    {stores.map(store => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>シナリオ（任意）</Label>
                <Select
                  value={formData.scenario_id || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, scenario_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="シナリオなし" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">シナリオなし</SelectItem>
                    {scenarios.map(scenario => (
                      <SelectItem key={scenario.id} value={scenario.id}>
                        {scenario.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>カテゴリ</Label>
                <Input
                  placeholder="制作費"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>
            </>
          )}

          {/* その他支出/収入：公演（任意） */}
          {isAdjustmentKind && events.length > 0 && (
            <div>
              <Label>公演（任意）</Label>
              <Select value={selectedEventId || 'none'} onValueChange={handleEventChange}>
                <SelectTrigger>
                  <SelectValue placeholder="公演に紐づけない" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">公演に紐づけない</SelectItem>
                  {events.map((ev) => {
                    const store = ev.store_name
                      ?? (ev.store_id ? stores.find(s => s.id === ev.store_id)?.short_name : undefined)
                    return (
                      <SelectItem key={ev.id} value={ev.id}>
                        {formatJstYmd(ev.date)} {ev.scenario_title}
                        {store ? ` ・ ${store}` : ''}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>日付</Label>
            <SingleDatePopover
              date={formData.date}
              onDateChange={(date) => setFormData({ ...formData, date: date || '' })}
              placeholder="日付を選択"
            />
          </div>

          <div>
            <Label>{isAdjustmentKind ? '内容メモ' : '説明（任意）'}</Label>
            {isAdjustmentKind ? (
              <Textarea
                placeholder="例: 現金精算のズレを補正 / 割引分を減額"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            ) : (
              <Input
                placeholder="例: 小道具購入"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            )}
          </div>
        </div>

        <div className="flex justify-between gap-2">
          <div>
            {isEditMode && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={loading || deleting}
                size="sm"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {deleting ? '削除中...' : '削除'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading || deleting}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={loading || deleting}>
              {loading ? '保存中...' : (isEditMode ? '更新' : '追加')}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="この項目を削除しますか？"
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={runDelete}
      />
    </Dialog>
  )
}
