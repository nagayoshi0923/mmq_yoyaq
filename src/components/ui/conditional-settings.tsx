import React from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export interface ConditionalSetting {
  condition: string
  amount: number
  type?: 'percentage' | 'fixed'
  usageCount?: number
  status?: 'active' | 'legacy' | 'unused' | 'ready'
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
  preventDuplicates?: boolean // Added preventDuplicates prop
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
  className = ""
}) => {
  const updateItem = (index: number, field: keyof ConditionalSetting, value: string | number) => {
    const updatedItems = [...items]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    onItemsChange(updatedItems)
  }

  const updateNewItem = (field: keyof ConditionalSetting, value: string | number) => {
    onNewItemChange({ ...newItem, [field]: value })
  }

  // 利用可能な選択肢を取得（重複制御）
  const getAvailableOptions = (currentIndex?: number) => {
    if (!preventDuplicates) return conditionOptions
    
    const usedConditions = items
      .map((item, index) => index === currentIndex ? null : item.condition)
      .filter(Boolean)
    
    return conditionOptions.filter(option => !usedConditions.includes(option.value))
  }

  // 新規入力欄用の利用可能な選択肢
  const getAvailableOptionsForNew = () => {
    if (!preventDuplicates) return conditionOptions
    
    const usedConditions = items.map(item => item.condition)
    return conditionOptions.filter(option => !usedConditions.includes(option.value))
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h4 className="font-medium">{title}</h4>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        )}
      </div>
      
      {/* 設定済みアイテム入力欄 */}
      <div className="space-y-2">
        {/* 確定済みアイテム */}
        {items.map((item, index) => (
          <div key={index} className="flex gap-2 items-center">
            {showItemLabels && getItemLabel && (
              <div className="w-[60px] text-sm font-medium">
                {getItemLabel(index)}
              </div>
            )}
                    <Select 
                      value={item.condition} 
                      onValueChange={(value: string) => updateItem(index, 'condition', value)}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableOptions(index).map(option => (
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
                updateItem(index, 'amount', value)
              }}
              className="w-[120px]"
            />
            
            {showTypeSelector && (
              <Select 
                value={item.type || 'fixed'} 
                onValueChange={(value: 'percentage' | 'fixed') => updateItem(index, 'type', value)}
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
            
            {showDescription && getDescription && (
              <span className="text-sm text-gray-600 flex-1">
                {getDescription(item.condition)}
              </span>
            )}
            
            {/* ステータスバッジ */}
            {item.status && (
              <div className="flex items-center gap-1">
                {item.status === 'active' && (
                  <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-green-200">
                    🟢使用中{item.usageCount ? `${item.usageCount}件` : '0件'}
                  </Badge>
                )}
                {item.status === 'legacy' && (
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                    🔵過去のみ{item.usageCount ? `${item.usageCount}件` : '0件'}
                  </Badge>
                )}
                {item.status === 'ready' && (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                    ✅運用可能
                  </Badge>
                )}
                {item.status === 'unused' && (
                  <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500 border-gray-200">
                    未設定
                  </Badge>
                )}
              </div>
            )}
            
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemoveItem(index)}
              disabled={item.status === 'legacy'}
              className={`h-8 w-8 p-0 ${
                item.status === 'legacy' 
                  ? 'text-gray-400 cursor-not-allowed' 
                  : 'text-red-500 hover:text-red-700'
              }`}
              title={item.status === 'legacy' ? '過去データで使用中のため削除できません' : '削除'}
            >
              {item.status === 'legacy' ? '🔒' : '×'}
            </Button>
          </div>
        ))}
        
        {/* 新規入力欄 */}
        {showNewItem && (
        <div className="flex gap-2 items-center">
          {showItemLabels && getItemLabel && (
            <div className="w-[60px] text-sm font-medium">
              {getItemLabel(items.length)}
            </div>
          )}
                  <Select 
                    value={newItem.condition} 
                    onValueChange={(value: string) => updateNewItem('condition', value)}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableOptionsForNew().map(option => (
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
          
          {showDescription && getDescription && (
            <span className="text-sm text-gray-600 flex-1">
              {getDescription(newItem.condition)}
            </span>
          )}
          
          {/* 新規入力欄のステータスバッジ */}
          {newItem.status && (
            <div className="flex items-center gap-1">
              {newItem.status === 'active' && (
                <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-green-200">
                  🟢使用中{newItem.usageCount ? `${newItem.usageCount}件` : '0件'}
                </Badge>
              )}
              {newItem.status === 'legacy' && (
                <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                  🔵過去のみ{newItem.usageCount ? `${newItem.usageCount}件` : '0件'}
                </Badge>
              )}
              {newItem.status === 'ready' && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                  ✅運用可能
                </Badge>
              )}
              {newItem.status === 'unused' && (
                <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500 border-gray-200">
                  未設定
                </Badge>
              )}
            </div>
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
            onClick={onAddItem}
            disabled={newItem.amount <= 0}
          >
            {addButtonText}
          </Button>
        </div>
      </div>
    </div>
  )
}
