import { useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { flexibleMatch } from '@/utils/kanaUtils'

export interface MultiSelectOption {
  id: string
  name: string
  displayInfo?: string
}

interface MultiSelectProps {
  options: MultiSelectOption[] | string[]
  selectedValues: string[]
  onSelectionChange: (values: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  showBadges?: boolean
  closeOnSelect?: boolean  // 選択時にプルダウンを閉じるか
  useIdAsValue?: boolean  // trueの場合、idを値として使用（デフォルトはname）
  emptyText?: string  // 空の時に表示するテキスト
  emptyActionLabel?: string  // 空の時に表示するボタンラベル
  onEmptyAction?: () => void  // 空の時にボタンをクリックした時のアクション
}

export function MultiSelect({
  options,
  selectedValues,
  onSelectionChange,
  placeholder = "選択してください",
  className = "",
  disabled = false,
  showBadges = false,
  closeOnSelect = false,
  useIdAsValue = false,
  emptyText,
  emptyActionLabel,
  onEmptyAction
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  // optionsを正規化（string[]の場合はMultiSelectOption[]に変換）
  const normalizedOptions: MultiSelectOption[] = options.map((option) => {
    if (typeof option === 'string') {
      return { id: option, name: option }
    }
    return option
  })

  // 検索フィルタリング（ひらがな・カタカナ・アルファベット対応）
  const filteredOptions = searchTerm
    ? normalizedOptions.filter(option => {
        const searchTargets = [
          option.name,
          option.displayInfo
        ].filter(Boolean) as string[]
        
        return flexibleMatch(searchTerm, searchTargets)
      })
    : normalizedOptions

  // 選択済みの項目を上に表示するようにソート
  const sortedOptions = [...filteredOptions].sort((a, b) => {
    const valueA = useIdAsValue ? a.id : a.name
    const valueB = useIdAsValue ? b.id : b.name
    const isSelectedA = (selectedValues || []).includes(valueA)
    const isSelectedB = (selectedValues || []).includes(valueB)
    
    // 選択済みを上に
    if (isSelectedA && !isSelectedB) return -1
    if (!isSelectedA && isSelectedB) return 1
    return 0
  })

  const handleToggleSelection = (value: string) => {
    const currentValues = selectedValues || []
    const isSelected = currentValues.includes(value)
    if (isSelected) {
      onSelectionChange(currentValues.filter(v => v !== value))
    } else {
      onSelectionChange([...currentValues, value])
    }
    
    // closeOnSelectがtrueの場合、選択後にプルダウンを閉じる
    if (closeOnSelect) {
      setOpen(false)
    }
  }

  const handleRemoveValue = (value: string) => {
    onSelectionChange((selectedValues || []).filter(v => v !== value))
  }

  const getDisplayValue = () => {
    if (!selectedValues || selectedValues.length === 0) {
      return placeholder
    }
    if (selectedValues.length === 1) {
      // useIdAsValueがtrueの場合、IDからnameを取得して表示
      if (useIdAsValue) {
        const option = normalizedOptions.find(opt => opt.id === selectedValues[0])
        return option?.name || selectedValues[0]
      }
      return selectedValues[0]
    }
    return `${selectedValues.length}件選択中`
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between font-normal text-sm",
              className
            )}
            disabled={disabled}
            style={{ backgroundColor: '#F6F9FB' }}
          >
            <span className="truncate">{getDisplayValue()}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="p-0 z-[100] flex flex-col" 
          align="start" 
          style={{ 
            width: 'var(--radix-popover-trigger-width)',
            maxHeight: '500px'
          }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onWheel={(e) => {
            e.stopPropagation()
          }}
        >
          <div className="p-2 border-b flex-shrink-0">
            <Input
              placeholder="スタッフ名で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8"
            />
          </div>
          <div 
            className="scrollable-list" 
            style={{ 
              maxHeight: '300px',
              minHeight: '100px',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch'
            }}
            onWheel={(e) => {
              const element = e.currentTarget
              const atTop = element.scrollTop === 0
              const atBottom = element.scrollHeight - element.scrollTop === element.clientHeight
              
              if (!atTop && !atBottom) {
                e.stopPropagation()
              }
            }}
          >
            {sortedOptions.length === 0 && (
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground">
                  {emptyText || (searchTerm ? 'スタッフが見つかりません' : 'スタッフがいません')}
                </p>
              </div>
            )}
            {sortedOptions.length > 0 && sortedOptions.map(option => {
              const valueToCompare = useIdAsValue ? option.id : option.name
              const isSelected = (selectedValues || []).includes(valueToCompare)
              return (
                <div
                  key={option.id}
                  className="flex items-center w-full px-2.5 py-2 cursor-pointer hover:bg-muted/50 text-sm"
                  onClick={() => handleToggleSelection(valueToCompare)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-4 flex justify-center">
                      {isSelected && (
                        <Check className="w-4 h-4 text-green-600" />
                      )}
                    </div>
                    <span className={`truncate ${isSelected ? 'text-green-600 font-medium' : ''}`}>
                      {option.name}
                    </span>
                  </div>
                  {option.displayInfo && (
                    <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                      {option.displayInfo}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {/* 下部に固定表示するアクションボタン */}
          {onEmptyAction && emptyActionLabel && (
            <div className="p-2 border-t bg-muted/30 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onEmptyAction()
                  setOpen(false)
                }}
                className="w-full"
              >
                {emptyActionLabel}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* バッジ表示エリア */}
      {showBadges && selectedValues && selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedValues.map((value) => {
            // useIdAsValueがtrueの場合、IDからnameを取得して表示
            const displayValue = useIdAsValue 
              ? normalizedOptions.find(opt => opt.id === value)?.name || value
              : value
            return (
              <Badge key={value} variant="secondary" className="flex items-center gap-1 font-normal bg-gray-100 border-0 rounded-[2px]">
                {displayValue}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-red-100"
                  onClick={() => handleRemoveValue(value)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
