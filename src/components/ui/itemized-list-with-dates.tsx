import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import { DateRangeModal } from '@/components/modals/DateRangeModal'
import { Plus, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface ItemizedListItem {
  // 共通フィールド
  amount: number
  startDate?: string
  endDate?: string
  status?: 'active' | 'ready' | 'legacy'
  usageCount?: number
  
  // 可変フィールド（用途に応じて使い分け）
  [key: string]: any
}

export interface ItemizedListColumn {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  width?: string // Tailwind grid column width (e.g., '1fr', '2fr', 'auto')
}

interface ItemizedListWithDatesProps {
  title: string
  addButtonLabel: string
  emptyMessage?: string
  items: ItemizedListItem[]
  columns: ItemizedListColumn[]
  defaultNewItem: () => ItemizedListItem
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, field: string, value: any) => void
  showDateRange?: boolean
  dateRangeLabel?: string
}

export function ItemizedListWithDates({
  title,
  addButtonLabel,
  emptyMessage = '設定がありません',
  items,
  columns,
  defaultNewItem,
  onAdd,
  onRemove,
  onUpdate,
  showDateRange = true,
  dateRangeLabel = '期間設定'
}: ItemizedListWithDatesProps) {
  const [dateRangeModalOpen, setDateRangeModalOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number>(0)
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null)

  // ステータス判定
  const getItemStatus = (item: ItemizedListItem): 'active' | 'ready' | 'legacy' => {
    if (!item.startDate && !item.endDate) return 'active'
    const now = new Date()
    const start = item.startDate ? new Date(item.startDate) : null
    const end = item.endDate ? new Date(item.endDate) : null
    if (start && now < start) return 'ready'
    if (end && now > end) return 'legacy'
    return 'active'
  }

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'active': return '使用中'
      case 'ready': return '待機中'
      case 'legacy': return '過去の設定'
      default: return status
    }
  }

  // 期間設定モーダルを開く
  const handleOpenDateRangeModal = (index: number) => {
    setEditingIndex(index)
    setDateRangeModalOpen(true)
  }

  // 期間設定を保存
  const handleSaveDateRange = (startDate?: string, endDate?: string) => {
    onUpdate(editingIndex, 'startDate', startDate)
    onUpdate(editingIndex, 'endDate', endDate)
  }

  // 削除処理
  const handleDelete = (index: number) => {
    onRemove(index)
    setDeleteConfirmIndex(null)
  }

  // グリッドカラムの計算
  const gridColumns = columns.map(col => col.width || '1fr').join(' ')
  const gridTemplateColumns = showDateRange 
    ? `${gridColumns} auto auto`
    : `${gridColumns} auto`

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium">{title}</h4>
        <Button
          type="button"
          onClick={onAdd}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {addButtonLabel}
        </Button>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
            <p>{emptyMessage}</p>
            <p className="text-sm mt-2">「{addButtonLabel}」ボタンから追加してください</p>
          </div>
        ) : (
          items.map((item, index) => {
            const status = getItemStatus(item)
            return (
              <div key={index} className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
                <div className="pt-6">
                  <StatusBadge status={status} label={getStatusLabel(status)} />
                </div>

                <div className="flex-1">
                  <div 
                    className="grid gap-3 items-end"
                    style={{ gridTemplateColumns }}
                  >
                      {/* 動的カラム */}
                      {columns.map((column) => (
                        <div key={column.key}>
                          <Label className="text-xs">{column.label}</Label>
                          {column.type === 'select' ? (
                            <Select
                              value={item[column.key] || ''}
                              onValueChange={(value) => onUpdate(index, column.key, value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {column.options?.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type={column.type}
                              value={item[column.key] || ''}
                              onChange={(e) => {
                                const value = column.type === 'number' 
                                  ? parseInt(e.target.value) || 0 
                                  : e.target.value
                                onUpdate(index, column.key, value)
                              }}
                              placeholder={column.placeholder}
                            />
                          )}
                        </div>
                      ))}

                      {/* 期間設定ボタン */}
                      {showDateRange && (
                        <div>
                          <Label className="text-xs opacity-0">期間</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDateRangeModal(index)}
                            className="w-full text-xs h-8"
                          >
                            {dateRangeLabel}
                          </Button>
                          {/* 適用期間の表示 */}
                          {(item.startDate || item.endDate) && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {item.startDate && !item.endDate && `${item.startDate}から`}
                              {!item.startDate && item.endDate && `${item.endDate}まで`}
                              {item.startDate && item.endDate && `${item.startDate} 〜 ${item.endDate}`}
                            </div>
                          )}
                        </div>
                      )}

                      {/* メニューボタン */}
                      <div>
                        <Label className="text-xs opacity-0">メニュー</Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteConfirmIndex(index)}
                            >
                              削除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 期間設定モーダル */}
      {showDateRange && (
        <DateRangeModal
          isOpen={dateRangeModalOpen}
          onClose={() => setDateRangeModalOpen(false)}
          onSave={handleSaveDateRange}
          initialStartDate={items[editingIndex]?.startDate}
          initialEndDate={items[editingIndex]?.endDate}
        />
      )}

      {/* 削除確認ダイアログ */}
      {deleteConfirmIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card p-6 rounded-lg shadow-lg max-w-md w-full mx-4 border">
            <h3 className="text-lg font-semibold mb-2">削除の確認</h3>
            <p className="text-sm text-muted-foreground mb-6">
              この項目を削除してもよろしいですか？この操作は取り消せません。
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteConfirmIndex(null)}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => handleDelete(deleteConfirmIndex)}
              >
                削除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

