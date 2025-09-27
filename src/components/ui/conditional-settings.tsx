import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { MigrationConfirmationDialog } from '@/components/ui/migration-confirmation-dialog'

export interface ConditionalSetting {
  condition: string
  amount: number
  type?: 'percentage' | 'fixed'
  usageCount?: number
  status?: 'active' | 'legacy' | 'unused' | 'ready'
  startDate?: string // 追加
  endDate?: string   // 追加
}

interface ConditionalSettingsProps {
  title: string
  subtitle?: string
  items: ConditionalSetting[]
  newItem: ConditionalSetting
  conditionOptions: { value: string; label: string }[]
  showTypeSelector?: boolean
  showDescription?: boolean
  showItemLabels?: boolean
  showNewItem?: boolean
  preventDuplicates?: boolean
  showStatusSelector?: boolean // Added showStatusSelector prop
  showHideLegacyToggle?: boolean // 過去のみ非表示チェックボックス
  itemType?: string // 削除ダイアログで使用する項目タイプ
  getDescription?: (condition: string) => string
  getItemLabel?: (index: number) => string
  onItemsChange: (items: ConditionalSetting[]) => void
  onNewItemChange: (item: ConditionalSetting) => void
  onAddItem: () => void
  onRemoveItem: (index: number) => void
  onClearNewItem: () => void
  onHideNewItem?: () => void
  placeholder?: string
  addButtonText?: string
  className?: string
  onEditItem?: (index: number) => void // Added onEditItem prop
}

// 金額を表示用にフォーマット（カンマ区切り + 円）
const formatCurrency = (amount: number | string) => {
  const num = typeof amount === 'string' ? parseInt(amount) || 0 : amount
  if (num === 0) return ''
  return `${num.toLocaleString()}円`
}

// 全角数字を半角数字に変換
const convertFullWidthToHalfWidth = (str: string) => {
  return str.replace(/[０-９]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
  })
}

// 表示用文字列から数値を抽出
const parseCurrency = (value: string) => {
  // 全角数字を半角に変換してから処理
  const halfWidthValue = convertFullWidthToHalfWidth(value)
  return parseInt(halfWidthValue.replace(/[^\d]/g, '')) || 0
}

// ファイル冒頭に編集アイコンを定義
const EditIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 13.5V16h2.5l7.06-7.06-2.5-2.5L4 13.5z" fill="currentColor"/>
    <path d="M14.06 6.44a1.5 1.5 0 0 0 0-2.12l-1.38-1.38a1.5 1.5 0 0 0-2.12 0l-1.06 1.06 3.5 3.5 1.06-1.06z" fill="currentColor"/>
  </svg>
)

export const ConditionalSettings: React.FC<ConditionalSettingsProps> = ({
  title,
  subtitle,
  items,
  newItem,
  conditionOptions,
  showTypeSelector = false,
  showDescription = false,
  showItemLabels = false,
  showNewItem = true,
  preventDuplicates = false,
  showStatusSelector = false,
  showHideLegacyToggle = false,
  itemType = "設定",
  getDescription,
  getItemLabel,
  onItemsChange,
  onNewItemChange,
  onAddItem,
  onRemoveItem,
  onClearNewItem,
  onHideNewItem,
  placeholder = "金額",
  addButtonText = "条件を追加",
  className = "",
  onEditItem
}) => {
  // 削除確認ダイアログの状態管理
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null)
  
  // 移行確認ダイアログの状態管理
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false)
  const [existingActiveItem, setExistingActiveItem] = useState<{ index: number; item: ConditionalSetting } | null>(null)
  
  // 過去のみ非表示状態管理
  const [hideLegacy, setHideLegacy] = useState(false)
  
  // 表示する項目をフィルタリング
  const visibleItems = hideLegacy ? items.filter(item => item.status !== 'legacy') : items

  // 削除ボタンクリック時の処理
  const handleDeleteClick = (index: number) => {
    setDeleteTargetIndex(index)
    setDeleteDialogOpen(true)
  }

  // 削除確認後の処理
  const handleDeleteConfirm = () => {
    if (deleteTargetIndex !== null) {
      onRemoveItem(deleteTargetIndex)
      setDeleteTargetIndex(null)
    }
  }

  // 追加ボタンクリック時の処理
  const handleAddClick = () => {
    console.log('DEBUG: Add button clicked', {
      newItemCondition: newItem.condition,
      newItemAmount: newItem.amount,
      allItems: items.map(item => ({ condition: item.condition, status: item.status, amount: item.amount }))
    })
    
    // 同じ条件で使用中の項目があるかチェック
    const existingActiveIndex = items.findIndex(item => 
      item.condition === newItem.condition && item.status === 'active'
    )
    
    console.log('DEBUG: Existing active check', {
      existingActiveIndex,
      foundItem: existingActiveIndex !== -1 ? items[existingActiveIndex] : null
    })
    
    if (existingActiveIndex !== -1) {
      // 使用中の項目がある場合は移行確認ダイアログを表示
      console.log('DEBUG: Showing migration dialog')
      setExistingActiveItem({
        index: existingActiveIndex,
        item: items[existingActiveIndex]
      })
      setMigrationDialogOpen(true)
    } else {
      // 使用中の項目がない場合は通常の追加
      console.log('DEBUG: Normal add')
      onAddItem()
    }
  }

  // 移行確認後の処理
  const handleMigrationConfirm = () => {
    if (existingActiveItem) {
      // 既存の項目を「過去のみ」に変更
      const updatedItems = [...items]
      updatedItems[existingActiveItem.index] = {
        ...existingActiveItem.item,
        status: 'legacy'
      }
      onItemsChange(updatedItems)
      
      // 新しい項目を「使用中」として追加
      const newActiveItem = {
        ...newItem,
        status: 'active' as const,
        usageCount: 0
      }
      onItemsChange([...updatedItems, newActiveItem])
      onClearNewItem()
      
      setExistingActiveItem(null)
    }
  }

  // 移行キャンセル後の処理
  const handleMigrationCancel = () => {
    setExistingActiveItem(null)
    // 新規入力欄はそのまま（キャンセルしただけ）
  }

  const updateItem = (index: number, field: keyof ConditionalSetting, value: string | number) => {
    const updatedItems = [...items]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    onItemsChange(updatedItems)
  }

  const updateNewItem = (field: keyof ConditionalSetting, value: string | number) => {
    onNewItemChange({ ...newItem, [field]: value })
  }

  // シンプルな初期化処理
  useEffect(() => {
    // 金額が0の場合は2000に設定
    if (newItem.amount === 0) {
      updateNewItem('amount', 2000)
    }
    // 条件が未選択の場合は最初の選択肢に設定
    if (newItem.condition === '__unselected__' && conditionOptions.length > 0) {
      updateNewItem('condition', conditionOptions[0].value)
    }
  }, [])

  // 新規入力欄の初期値を必ずセット
  useEffect(() => {
    if (newItem.amount === 0) updateNewItem('amount', 2000)
    if ((!newItem.condition || newItem.condition === '__unselected__') && conditionOptions.length > 0) {
      updateNewItem('condition', conditionOptions[0].value)
    }
    if (!newItem.status) updateNewItem('status', 'ready')
  }, [])

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <div className="flex items-center justify-between">
          <h4 className="font-medium">{title}</h4>
          {showHideLegacyToggle && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={hideLegacy}
                onChange={(e) => setHideLegacy(e.target.checked)}
                className="rounded"
              />
              過去のみを非表示
            </label>
          )}
        </div>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        )}
      </div>
      
      {/* 設定済みアイテム入力欄 */}
      <div className="space-y-2">
        {/* 確定済みアイテム */}
        {visibleItems.map((item, index) => {
          // 元のindexを取得（削除時に正しいindexを使用するため）
          const originalIndex = items.findIndex(originalItem => originalItem === item)
          return (
          <div key={index} className="flex gap-2 items-center">
            {showItemLabels && getItemLabel && (
              <div className="w-[60px] text-sm font-medium">
                {getItemLabel(index)}
              </div>
            )}
            <Select 
              value={item.condition} 
              onValueChange={(value: string) => updateItem(originalIndex, 'condition', value)}
              disabled={item.status === 'legacy'}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {conditionOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Input
              type="text"
              placeholder={placeholder}
              value={item.type === 'percentage' ? (item.amount || '') : formatCurrency(item.amount || 0)}
              onChange={(e) => {
                const inputValue = e.target.value
                const value = item.type === 'percentage' 
                  ? parseInt(convertFullWidthToHalfWidth(inputValue).replace(/[^\d]/g, '')) || 0
                  : parseCurrency(inputValue)
                updateItem(originalIndex, 'amount', value)
              }}
              className="w-[120px]"
              disabled={item.status === 'legacy'}
            />
            
            <input
              type="date"
              className="border rounded px-1 py-0.5 w-[130px]"
              value={item.startDate || ''}
              onChange={e => updateItem(index, 'startDate', e.target.value)}
              disabled={item.status === 'legacy'}
            />
            <span className="mx-1">〜</span>
            <input
              type="date"
              className="border rounded px-1 py-0.5 w-[130px]"
              value={item.endDate || ''}
              onChange={e => updateItem(index, 'endDate', e.target.value)}
              disabled={item.status === 'legacy'}
            />
            
                    {showTypeSelector && (
                      <Select 
                        value={item.type || 'fixed'} 
                        onValueChange={(value: 'percentage' | 'fixed') => updateItem(originalIndex, 'type', value)}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">固定額</SelectItem>
                          <SelectItem value="percentage">割合</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {showStatusSelector && (
                      <Select
                        value={item.status}
                        onValueChange={(value: string) => updateItem(originalIndex, 'status', value)}
                        disabled={item.status === 'legacy'}
                      >
                        <SelectTrigger className="w-[80px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ready">有効</SelectItem>
                          <SelectItem value="unused">無効</SelectItem>
                          <SelectItem value="active">使用中</SelectItem>
                          <SelectItem value="legacy">過去のみ</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {showDescription && getDescription && (
                      <span className="text-sm text-gray-600 flex-1">
                        {getDescription(item.condition)}
                      </span>
                    )}
            
            {/* ステータスバッジ（ステータスプルダウンがない場合のみ表示） */}
            {!showStatusSelector && item.status && (
              <div className="flex items-center gap-1">
                {item.status === 'active' && (
                  <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-green-200">
                    使用中{item.usageCount ? `${item.usageCount}件` : '0件'}
                  </Badge>
                )}
                {item.status === 'legacy' && (
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                    🔵過去のみ{item.usageCount ? `${item.usageCount}件` : '0件'}
                  </Badge>
                )}
                {item.status === 'ready' && (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                    待機設定
                  </Badge>
                )}
                {item.status === 'unused' && (
                  <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500 border-gray-200">
                    未設定
                  </Badge>
                )}
              </div>
            )}

            {/* 使用件数表示（ステータスプルダウンがある場合） */}
            {showStatusSelector && item.usageCount !== undefined && item.usageCount > 0 && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                {item.usageCount}件
              </Badge>
            )}
            
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEditItem ? onEditItem(originalIndex) : undefined}
              disabled={item.status === 'legacy'}
              className={`h-8 w-8 p-0 ${item.status === 'legacy' ? 'text-gray-400 cursor-not-allowed' : 'text-blue-500 hover:text-blue-700'}`}
              title={item.status === 'legacy' ? '過去データで使用中のため編集できません' : '編集'}
            >
              <EditIcon />
            </Button>
          </div>
          )
        })}
        
        {/* 新規入力欄 */}
        {showNewItem && (
        <div className="flex gap-2 items-center">
          {showItemLabels && getItemLabel && (
            <div className="w-[60px] text-sm font-medium">
              {getItemLabel(items.length)}
            </div>
          )}
                  <Select 
                    value={newItem.condition || (conditionOptions[0] && conditionOptions[0].value) || ''}
                    onValueChange={(value) => {
                      console.log('GM newItem condition', value)
                      updateNewItem('condition', value)
                    }}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unselected__">未選択</SelectItem>
                      {conditionOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
          
          <Input
            type="text"
            placeholder={placeholder}
            value={newItem.type === 'percentage' ? (newItem.amount || '') : formatCurrency(newItem.amount || 0)}
            onChange={(e) => {
              const inputValue = e.target.value
              const value = newItem.type === 'percentage' 
                ? parseInt(convertFullWidthToHalfWidth(inputValue).replace(/[^\d]/g, '')) || 0
                : parseCurrency(inputValue)
              updateNewItem('amount', value)
            }}
            className="w-[120px]"
          />
          
                  {showTypeSelector && (
                    <Select 
                      value={newItem.type || 'fixed'} 
                      onValueChange={(value: 'percentage' | 'fixed') => updateNewItem('type', value)}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">固定額</SelectItem>
                        <SelectItem value="percentage">割合</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {showStatusSelector && (
                    <Select
                      value={newItem.status}
                      onValueChange={(value: string) => updateNewItem('status', value)}
                    >
                      <SelectTrigger className="w-[80px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ready">有効</SelectItem>
                        <SelectItem value="unused">無効</SelectItem>
                        <SelectItem value="active">使用中</SelectItem>
                        <SelectItem value="legacy">過去のみ</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {showDescription && getDescription && (
                    <span className="text-sm text-gray-600 flex-1">
                      {getDescription(newItem.condition)}
                    </span>
                  )}
          
          {/* 新規入力欄のステータスバッジ（ステータスプルダウンがない場合のみ表示） */}
          {!showStatusSelector && newItem.status && (
            <div className="flex items-center gap-1">
              {newItem.status === 'active' && (
                <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-green-200">
                  使用中{newItem.usageCount ? `${newItem.usageCount}件` : '0件'}
                </Badge>
              )}
              {newItem.status === 'legacy' && (
                <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                  🔵過去のみ{newItem.usageCount ? `${newItem.usageCount}件` : '0件'}
                </Badge>
              )}
              {newItem.status === 'ready' && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                  待機設定
                </Badge>
              )}
              {newItem.status === 'unused' && (
                <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500 border-gray-200">
                  未設定
                </Badge>
              )}
            </div>
          )}

          {/* 新規入力欄の使用件数表示（ステータスプルダウンがある場合） */}
          {showStatusSelector && newItem.usageCount !== undefined && newItem.usageCount > 0 && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
              {newItem.usageCount}件
            </Badge>
          )}
          
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onHideNewItem || onClearNewItem}
            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
          >
            ×
          </Button>
        </div>
        )}
        
        {/* 条件を追加ボタン */}
        <div className="flex justify-end">
          <Button 
            type="button" 
            onClick={handleAddClick}
            disabled={newItem.amount <= 0 || !newItem.condition || newItem.condition === '__unselected__'}
          >
            {addButtonText}
          </Button>
        </div>
      </div>

      {/* 削除確認ダイアログ */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deleteTargetIndex !== null ? conditionOptions.find(opt => opt.value === items[deleteTargetIndex]?.condition)?.label || items[deleteTargetIndex]?.condition || '' : ''}
        itemType={itemType}
        usageCount={deleteTargetIndex !== null ? items[deleteTargetIndex]?.usageCount : 0}
        status={deleteTargetIndex !== null ? items[deleteTargetIndex]?.status : undefined}
        onConfirm={handleDeleteConfirm}
      />

      {/* 移行確認ダイアログ */}
      <MigrationConfirmationDialog
        open={migrationDialogOpen}
        onOpenChange={setMigrationDialogOpen}
        itemName={existingActiveItem ? conditionOptions.find(opt => opt.value === existingActiveItem.item.condition)?.label || existingActiveItem.item.condition : ''}
        itemType={itemType}
        existingAmount={existingActiveItem?.item.amount || 0}
        newAmount={newItem.amount}
        usageCount={existingActiveItem?.item.usageCount || 0}
        onConfirm={handleMigrationConfirm}
        onCancel={handleMigrationCancel}
      />
    </div>
  )
}
