import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DateRangeModal } from '@/components/modals/DateRangeModal'
import { MonthPickerPopover } from '@/components/ui/month-picker-popover'
import { Plus, Trash2 } from 'lucide-react'

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
  enableStatusChange?: boolean
  monthOnly?: boolean  // 月選択モード
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
  dateRangeLabel = '期間設定',
  enableStatusChange = false,
  monthOnly = false
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

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active': return 'text-green-600'
      case 'ready': return 'text-blue-600'
      case 'legacy': return 'text-gray-400'
      default: return 'text-gray-600'
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
    ? `${gridColumns} 80px 120px`
    : `${gridColumns} 120px`

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
              <div key={index} className="border rounded-lg p-3 bg-card hover:shadow-sm transition-shadow">
                  <div 
                    className="grid gap-2 items-end"
                    style={{ gridTemplateColumns }}
                  >
                      {/* 動的カラム */}
                      {columns.map((column) => (
                        <div key={column.key}>
                          <Label className="text-xs mb-1.5 block">{column.label}</Label>
                          {column.type === 'select' ? (
                            <Select
                              value={item[column.key] || ''}
                              onValueChange={(value) => onUpdate(index, column.key, value)}
                            >
                              <SelectTrigger className="h-10">
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
                              className="h-10"
                            />
                          )}
                        </div>
                      ))}

                      {/* 期間設定ボタン */}
                      {showDateRange && (
                        <div>
                          <Label className="text-xs mb-1.5 block opacity-0">{dateRangeLabel}</Label>
                          {monthOnly ? (
                            <MonthPickerPopover
                              value={item.startDate}
                              onSelect={(date) => {
                                onUpdate(index, 'startDate', date)
                                onUpdate(index, 'endDate', undefined)
                              }}
                              label={dateRangeLabel}
                            />
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDateRangeModal(index)}
                              className="text-xs h-10 px-3 w-full"
                            >
                              {dateRangeLabel}
                            </Button>
                          )}
                        </div>
                      )}

                      {/* ステータス・アクションメニュー */}
                      <div>
                        <Label className="text-xs mb-1.5 block">
                          {showDateRange && (item.startDate || item.endDate) ? (
                            <>
                              {item.startDate && !item.endDate && `${item.startDate}〜`}
                              {!item.startDate && item.endDate && `〜${item.endDate}`}
                              {item.startDate && item.endDate && `${item.startDate}〜${item.endDate}`}
                            </>
                          ) : (
                            <span className="opacity-0">ステータス</span>
                          )}
                        </Label>
                        
                        <Select
                          value={status}
                          onValueChange={(value) => {
                            if (value === 'delete') {
                              setDeleteConfirmIndex(index)
                            } else if (enableStatusChange && (value === 'active' || value === 'ready' || value === 'legacy')) {
                              // ステータス変更: startDate/endDateを更新
                              const now = new Date()
                              
                              if (value === 'active') {
                                // 使用中: 日付をクリア
                                onUpdate(index, 'startDate', undefined)
                                onUpdate(index, 'endDate', undefined)
                              } else if (value === 'ready') {
                                // 待機中: 未来の開始日を設定
                                const futureDate = new Date(now)
                                futureDate.setDate(futureDate.getDate() + 7)
                                onUpdate(index, 'startDate', futureDate.toISOString().split('T')[0])
                                onUpdate(index, 'endDate', undefined)
                              } else if (value === 'legacy') {
                                // 過去の設定: 昨日を終了日に設定
                                const yesterday = new Date(now)
                                yesterday.setDate(yesterday.getDate() - 1)
                                onUpdate(index, 'endDate', yesterday.toISOString().split('T')[0])
                              }
                            }
                          }}
                        >
                          <SelectTrigger className="h-10 min-w-[100px] border-none shadow-none hover:bg-muted/50">
                            <SelectValue>
                              <span className={`text-xs font-medium ${getStatusColor(status)}`}>
                                {getStatusLabel(status)}
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {enableStatusChange ? (
                              <>
                                <SelectItem value="active">
                                  <span className="text-green-600">使用中</span>
                                </SelectItem>
                                <SelectItem value="ready">
                                  <span className="text-blue-600">待機中</span>
                                </SelectItem>
                                <SelectItem value="legacy">
                                  <span className="text-gray-400">過去の設定</span>
                                </SelectItem>
                                <SelectItem value="delete" className="text-destructive border-t mt-1 pt-1">
                                  削除
                                </SelectItem>
                              </>
                            ) : (
                              <SelectItem value="delete" className="text-destructive">
                                削除
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
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
          monthOnly={monthOnly}
          title={monthOnly ? '発生月設定' : '期間設定'}
          description={monthOnly ? '費用が発生した月を設定します。設定するとその月の売上として計上されます。' : '開始日・終了日を設定しない場合は、現行設定（使用中）として扱われます。'}
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

