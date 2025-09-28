import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { MigrationConfirmationDialog } from '@/components/ui/migration-confirmation-dialog'
import { StatusBadge } from '@/components/ui/status-badge'

// 全角数字を半角数字に変換
const convertFullWidthToHalfWidth = (str: string) => {
  return str.replace(/[０-９]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
  })
}

// 金額を表示用にフォーマット（カンマ区切り + 円）
const formatCurrency = (amount: number | string) => {
  const num = typeof amount === 'string' ? parseInt(amount) || 0 : amount
  return `${num.toLocaleString()}円`
}

// 表示用文字列から数値を抽出
const parseCurrency = (value: string) => {
  // 全角数字を半角に変換してから処理
  const halfWidthValue = convertFullWidthToHalfWidth(value)
  return parseInt(halfWidthValue.replace(/[^\d]/g, '')) || 0
}

export interface ItemizedSetting {
  item: string
  amount: number
  type?: 'fixed' | 'percentage'
  status?: 'active' | 'legacy' | 'unused' | 'ready'
  usageCount?: number
  originalRole?: string // GM報酬用：元の英語値を保持
  originalTimeSlot?: string // 参加費用：元の時間帯値を保持
  startDate?: string // 適用開始日
  endDate?: string // 使用期限
}

interface ItemizedSettingsProps {
  title: string
  subtitle?: string
  items: ItemizedSetting[]
  conditionOptions: { value: string; label: string }[]
  showTypeSelector?: boolean
  showHideLegacyToggle?: boolean
  itemType: string
  scenarioName?: string
  getItemStatus: (amount: number, usageCount?: number) => 'active' | 'legacy' | 'unused' | 'ready'
  validateNormalSetting?: (items: ItemizedSetting[]) => { hasError: boolean; message: string }
  onItemsChange: (items: ItemizedSetting[]) => void
  onExistingActiveFound?: (existingItem: { index: number; item: ItemizedSetting }, newAmount: number, newType: 'fixed' | 'percentage') => void
}

export const ItemizedSettings: React.FC<ItemizedSettingsProps> = ({
  title,
  subtitle,
  items,
  conditionOptions,
  showTypeSelector = false,
  showHideLegacyToggle = false,
  itemType,
  scenarioName,
  getItemStatus,
  validateNormalSetting,
  onItemsChange,
  onExistingActiveFound
}) => {
  // 新規入力用state
  const [newItem, setNewItem] = useState(conditionOptions[0]?.value || '')
  const [newAmountInput, setNewAmountInput] = useState('')
  const [newType, setNewType] = useState<'fixed' | 'percentage'>('fixed')
  
  // ダイアログ用state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null)
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false)
  const [existingActiveItem, setExistingActiveItem] = useState<{ index: number; item: ItemizedSetting } | null>(null)

  // デバッグ用：itemsの変更を監視（開発時のみ）
  // React.useEffect(() => {
  //   console.log('Items updated - count:', items.length)
  //   items.forEach((item, index) => {
  //     console.log(`Items updated - [${index}]:`, {
  //       item: item.item,
  //       status: item.status,
  //       startDate: item.startDate,
  //       endDate: item.endDate
  //     })
  //   })
  // }, [items])
  
  // 過去のみ非表示state
  const [hideLegacy, setHideLegacy] = useState(false)
  
  // 表示する項目をフィルタリング
  const visibleItems = hideLegacy ? items.filter(item => item.status !== 'legacy') : items
  
  // バリデーション
  const validation = validateNormalSetting ? validateNormalSetting(items) : { hasError: false, message: '' }

  // 追加処理
  const handleAdd = () => {
    if (newItem && newAmountInput !== '') {
      const amount = parseCurrency(newAmountInput)
      
      // デバッグログ（開発時のみ）
      // console.log('DEBUG: Adding item', {
      //   newItem,
      //   newAmountInput,
      //   amount,
      //   allItems: items.map(item => ({ 
      //     item: item.item, 
      //     originalRole: item.originalRole, 
      //     status: item.status,
      //     amount: item.amount
      //   })),
      //   conditionOptions: conditionOptions.map(opt => ({ value: opt.value, label: opt.label }))
      // })
      
      // 同じ項目で使用中または待機設定の項目があるかチェック
      const existingActiveIndex = items.findIndex(item => 
        (item.originalRole === newItem || item.originalTimeSlot === newItem || item.item === newItem) && (item.status === 'active' || item.status === 'ready')
      )
      
      // デバッグログ（開発時のみ）
      // console.log('DEBUG: Existing active check', {
      //   newItem,
      //   existingActiveIndex,
      //   foundItem: existingActiveIndex !== -1 ? items[existingActiveIndex] : null,
      //   allItems: items.map(item => ({
      //     item: item.item,
      //     originalRole: item.originalRole,
      //     originalTimeSlot: item.originalTimeSlot,
      //     status: item.status
      //   }))
      // })
      
      if (existingActiveIndex !== -1) {
        // 使用中の項目がある場合は移行確認ダイアログを表示
        // console.log('DEBUG: Showing migration dialog')
        setExistingActiveItem({
          index: existingActiveIndex,
          item: items[existingActiveIndex]
        })
        setMigrationDialogOpen(true)
      } else {
        // 使用中の項目がない場合は即座に使用中として追加
        const selectedOption = conditionOptions.find(opt => opt.value === newItem)
        const newItemData: ItemizedSetting = {
          item: selectedOption ? selectedOption.label : newItem, // 日本語表示名を使用
          amount: amount,
          type: newType,
          status: 'active', // 使用中の設定がない場合は即座に使用中
          usageCount: 0,
          originalRole: newItem, // 元の英語値を保持
          originalTimeSlot: newItem // 元の時間帯値を保持
        }
        onItemsChange([...items, newItemData])
        
        // 入力欄をリセット
        setNewItem(conditionOptions[0]?.value || '')
        setNewAmountInput('')
        setNewType('fixed')
      }
    }
  }

  // 削除処理
  const handleDelete = (index: number) => {
    setDeleteTargetIndex(index)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = (action: 'delete' | 'archive') => {
    if (deleteTargetIndex === null) return
    
    if (action === 'archive') {
      // アーカイブ: ステータスを「過去のみ」に変更
      const updatedItems = items.map((item, i) => 
        i === deleteTargetIndex ? { ...item, status: 'legacy' as const } : item
      )
      onItemsChange(updatedItems)
    } else {
      // 完全削除: 項目を完全に削除
      const updatedItems = items.filter((_, i) => i !== deleteTargetIndex)
      onItemsChange(updatedItems)
    }
    
    setDeleteDialogOpen(false)
    setDeleteTargetIndex(null)
  }

  // 移行確認処理
  const handleMigrationConfirm = (startDate?: string) => {
    // console.log('handleMigrationConfirm called', { startDate })
    if (existingActiveItem) {
      // 既存の使用中設定に終了日を設定（ステータスは使用中のまま）
      const updatedItems = [...items]
      updatedItems[existingActiveItem.index] = {
        ...existingActiveItem.item,
        status: 'active', // 期限まで使用中のまま
        endDate: startDate // 新設定の開始日を既存設定の終了日として設定
      }
      
      // 他の同じ項目の使用中設定にも終了日を設定
      updatedItems.forEach((item, index) => {
        if (index !== existingActiveItem.index && item.status === 'active' && 
            (item.originalRole === newItem || item.originalTimeSlot === newItem || item.item === newItem)) {
          updatedItems[index] = {
            ...item,
            endDate: startDate
          }
        }
      })
      
      // 新しい項目を「待機設定」として追加（開始時期指定）
      const selectedOption = conditionOptions.find(opt => opt.value === newItem)
      const newActiveItem: ItemizedSetting = {
        item: selectedOption ? selectedOption.label : newItem, // 日本語表示名を使用
        amount: parseCurrency(newAmountInput),
        type: newType,
        status: startDate ? 'ready' : 'active', // 開始時期指定がある場合は待機設定
        usageCount: 0,
        originalRole: newItem, // 元の英語値を保持
        originalTimeSlot: newItem, // 元の時間帯値を保持
        startDate: startDate // 適用開始日を保持
      }
      
      // デバッグログ（開発時のみ）
      // console.log('Creating newActiveItem - item:', newActiveItem.item)
      // console.log('Creating newActiveItem - status:', newActiveItem.status)
      // console.log('Creating newActiveItem - startDate:', newActiveItem.startDate)
      // console.log('Creating newActiveItem - endDate:', newActiveItem.endDate)
      // console.log('Creating newActiveItem - startDate param:', startDate)
      onItemsChange([...updatedItems, newActiveItem])
      
      // 入力欄をリセット
      setNewItem(conditionOptions[0]?.value || '')
      setNewAmountInput('')
      setNewType('fixed')
      setExistingActiveItem(null)
    }
  }

  const handleMigrationCancel = () => {
    setExistingActiveItem(null)
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">{title}</h4>
            {subtitle && (
              <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            )}
          </div>
          {showHideLegacyToggle && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={hideLegacy}
                onChange={(e) => setHideLegacy(e.target.checked)}
                className="rounded"
              />
                      以前の設定を非表示
            </label>
          )}
        </div>
        
        {/* バリデーションエラー表示 */}
        {validation.hasError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
            <div className="flex items-center gap-2 text-red-700 font-medium mb-1">
              ⚠️ 設定エラー
            </div>
            <p className="text-red-600 text-sm">
              {validation.message}
            </p>
          </div>
        )}
      </div>
      
      {/* 新規入力欄 */}
      <div className="flex gap-2">
        <Select value={newItem} onValueChange={setNewItem}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="項目を選択" />
          </SelectTrigger>
          <SelectContent>
            {conditionOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
{showTypeSelector && (
          <Select 
            value={newType} 
            onValueChange={(value: 'fixed' | 'percentage') => {
              setNewType(value)
              // タイプ変更時に既存の入力値を適切にフォーマット
              if (newAmountInput) {
                const parsed = parseCurrency(newAmountInput)
                if (value === 'percentage') {
                  const formatted = parsed === 0 ? '0%' : `${parsed}%`
                  setNewAmountInput(formatted)
                } else {
                  const formatted = parsed === 0 ? '0円' : formatCurrency(parsed)
                  setNewAmountInput(formatted)
                }
              }
            }}
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
        
        <Input
          type="text"
          placeholder={newType === 'percentage' ? '%' : '円'}
          value={newAmountInput}
          onChange={e => setNewAmountInput(e.target.value)}
          onBlur={() => {
            const parsed = parseCurrency(newAmountInput)
            if (newType === 'percentage') {
              const formatted = parsed === 0 ? '0%' : `${parsed}%`
              setNewAmountInput(formatted)
            } else {
              const formatted = parsed === 0 ? '0円' : formatCurrency(parsed)
              setNewAmountInput(formatted)
            }
          }}
          className="w-[120px]"
        />
        
        <Button 
          type="button" 
          onClick={handleAdd}
          disabled={!newItem || newAmountInput === ''}
        >
          追加
        </Button>
      </div>
      
      {/* アイテムリスト */}
      {visibleItems.length > 0 && (
        <div className="mt-2 space-y-2">
          {visibleItems.map((item, displayIndex) => {
            // 元のindexを取得
            const originalIndex = items.findIndex(original => original === item)
            return (
              <div key={originalIndex} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {item.item}: {item.type === 'percentage' ? `${item.amount}%` : `${item.amount.toLocaleString()}円`}
                  </span>
                  {item.status && (
                    <div>
                      <StatusBadge 
                        status={item.status} 
                        usageCount={item.usageCount}
                        startDate={item.startDate}
                        endDate={item.endDate}
                      />
                      {/* デバッグ情報 */}
                      <span className="text-xs text-gray-400 ml-2">
                        DEBUG: start={item.startDate}, end={item.endDate}
                      </span>
                    </div>
                  )}
                </div>
                {item.status !== 'legacy' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(originalIndex)}
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                  >
                    ×
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) {
            setDeleteTargetIndex(null)
          }
        }}
        itemName={deleteTargetIndex !== null ? items[deleteTargetIndex]?.item || '' : ''}
        itemType={itemType}
        usageCount={deleteTargetIndex !== null ? items[deleteTargetIndex]?.usageCount : 0}
        status={deleteTargetIndex !== null ? items[deleteTargetIndex]?.status : undefined}
        scenarioName={scenarioName}
        requireScenarioNameConfirmation={deleteTargetIndex !== null && items[deleteTargetIndex]?.status === 'active'}
        onConfirm={confirmDelete}
      />

      {/* 移行確認ダイアログ */}
      <MigrationConfirmationDialog
        open={migrationDialogOpen}
        onOpenChange={setMigrationDialogOpen}
        itemName={existingActiveItem?.item.item || ''}
        itemType={itemType}
        existingAmount={existingActiveItem?.item.amount || 0}
        newAmount={parseCurrency(newAmountInput)}
        usageCount={existingActiveItem?.item.usageCount || 0}
        onConfirm={handleMigrationConfirm}
        onCancel={handleMigrationCancel}
      />
    </div>
  )
}
