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

interface Store {
  id: string
  name: string
  short_name: string
  ownership_type?: 'corporate' | 'franchise' | 'office'
  organization_id?: string
}

// 調整の対象となる公演（行から開いた場合のみ）
export interface AdjustmentTargetEvent {
  id: string
  date: string
  scenario_title: string
  store_id?: string
}

// ダイアログ内の「公演（任意）」Select 候補
export interface AdjustmentEventOption {
  id: string
  date: string
  scenario_title: string
  store_id?: string
  store_name?: string
}

interface AdjustmentDialogProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  stores: Store[]
  // 公演から開いた場合の対象公演（null=公演に紐づかない調整）
  targetEvent?: AdjustmentTargetEvent | null
  // 当期間の公演一覧（ダイアログ内の「公演（任意）」Select 候補）
  events?: AdjustmentEventOption[]
}

/**
 * 収支調整ダイアログ（F-1）
 * miscellaneous_transactions を「調整エントリ」として登録する。
 * 公演から開いた場合は schedule_event_id / store_id / 日付を自動設定する。
 */
export const AdjustmentDialog: React.FC<AdjustmentDialogProps> = ({
  isOpen,
  onClose,
  onSaved,
  stores,
  targetEvent,
  events = []
}) => {
  const { organizationId } = useOrganization()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: 0,
    description: '',
    date: toJstYmd(new Date()),
  })
  // 選択中の公演 ID（''=公演に紐づけない）
  const [selectedEventId, setSelectedEventId] = useState('')

  // ダイアログが開かれた時にフォームを初期化する
  useEffect(() => {
    if (!isOpen) return
    setFormData({
      type: 'expense',
      amount: 0,
      description: '',
      // 公演から開いた場合は公演日、それ以外は今日
      date: targetEvent?.date || toJstYmd(new Date()),
    })
    setSelectedEventId(targetEvent?.id || '')
  }, [isOpen, targetEvent])

  // 選択中の公演（targetEvent 優先。無ければ events から解決）
  const selectedEvent: AdjustmentEventOption | undefined = targetEvent
    ? { id: targetEvent.id, date: targetEvent.date, scenario_title: targetEvent.scenario_title, store_id: targetEvent.store_id }
    : events.find(ev => ev.id === selectedEventId)

  // 公演 Select 変更時: 日付を公演日に合わせる（未選択なら紐付け解除）
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

  const handleSave = async () => {
    if (!formData.amount || formData.amount <= 0) {
      showToast.warning('金額を入力してください')
      return
    }
    if (!formData.description.trim()) {
      showToast.warning('内容メモを入力してください')
      return
    }
    if (!organizationId) {
      showToast.error('組織情報が取得できません。再ログインしてください。')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('miscellaneous_transactions')
        .insert([{
          date: formData.date,
          type: formData.type,
          // 調整カテゴリは種別に応じた固定ラベル（メモは description に入る）
          category: formData.type === 'income' ? '調整（収入）' : '調整（支出）',
          amount: formData.amount,
          description: formData.description.trim(),
          store_id: selectedEvent?.store_id || null,
          scenario_id: null,
          schedule_event_id: selectedEvent?.id || null,
          organization_id: organizationId,
        }])

      if (error) throw error

      showToast.success('収支調整を登録しました')
      onSaved()
      onClose()
    } catch (error) {
      logger.error('収支調整の登録エラー:', error)
      showToast.error('登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const targetStore = targetEvent?.store_id
    ? stores.find(s => s.id === targetEvent.store_id)
    : undefined

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>収支調整を追加</DialogTitle>
          <DialogDescription>
            {targetEvent
              ? '公演に紐づく収支の調整を登録します'
              : '公演に紐づかない収支の調整を登録します'}
          </DialogDescription>
        </DialogHeader>

        {targetEvent && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <div className="truncate">{targetEvent.scenario_title}</div>
            <div className="text-xs text-muted-foreground">
              {formatJstYmd(targetEvent.date)}
              {targetStore ? ` ・ ${targetStore.short_name}` : ''}
            </div>
          </div>
        )}

        <div className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>種別</Label>
              <Select
                value={formData.type}
                onValueChange={(value: 'income' | 'expense') => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">収入</SelectItem>
                  <SelectItem value="expense">支出</SelectItem>
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

          {!targetEvent && events.length > 0 && (
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
            <Label>内容メモ</Label>
            <Textarea
              placeholder="例: 現金精算のズレを補正 / 割引分を減額"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? '保存中...' : '追加'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
