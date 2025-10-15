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
}

export function MultiSelect({
  options,
  selectedValues,
  onSelectionChange,
  placeholder = "選択してください",
  className = "",
  disabled = false,
  showBadges = false,
  closeOnSelect = false
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

  // 検索フィルタリング
  const filteredOptions = searchTerm
    ? normalizedOptions.filter(option => 
        option.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        option.displayInfo?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : normalizedOptions

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
          className="p-0 z-[100]" 
          align="start" 
          style={{ width: 'var(--radix-popover-trigger-width)' }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onWheel={(e) => {
            e.stopPropagation()
          }}
        >
          <div className="p-2 border-b">
            <Input
              placeholder="スタッフ名で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
          </div>
          <div 
            className="scrollable-list" 
            style={{ 
              maxHeight: '400px',
              minHeight: '100px',
              overflowY: 'scroll',
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
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                {searchTerm ? 'スタッフが見つかりません' : 'スタッフがいません'}
              </div>
            ) : (
              filteredOptions.map(option => {
                const isSelected = (selectedValues || []).includes(option.name)
                return (
                  <div
                    key={option.id}
                    className="flex items-center w-full px-2.5 py-2 cursor-pointer hover:bg-muted/50 text-sm"
                    onClick={() => handleToggleSelection(option.name)}
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
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* バッジ表示エリア */}
      {showBadges && selectedValues && selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedValues.map((value) => (
            <Badge key={value} variant="secondary" className="flex items-center gap-1 font-normal">
              {value}
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
          ))}
        </div>
      )}
    </div>
  )
}
