import { useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
}

export function MultiSelect({
  options,
  selectedValues,
  onSelectionChange,
  placeholder = "選択してください",
  className = "",
  disabled = false,
  showBadges = false
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)

  // optionsを正規化（string[]の場合はMultiSelectOption[]に変換）
  const normalizedOptions: MultiSelectOption[] = options.map((option) => {
    if (typeof option === 'string') {
      return { id: option, name: option }
    }
    return option
  })

  const handleToggleSelection = (value: string) => {
    const isSelected = selectedValues.includes(value)
    if (isSelected) {
      onSelectionChange(selectedValues.filter(v => v !== value))
    } else {
      onSelectionChange([...selectedValues, value])
    }
  }

  const handleRemoveValue = (value: string) => {
    onSelectionChange(selectedValues.filter(v => v !== value))
  }

  const getDisplayValue = () => {
    if (selectedValues.length === 0) {
      return placeholder
    }
    if (selectedValues.length === 1) {
      return selectedValues[0]
    }
    return `${selectedValues.length}件選択中`
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
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
        <PopoverContent className="w-full p-0" align="start">
          <div className="max-h-60 overflow-auto">
            {normalizedOptions.map(option => {
              const isSelected = selectedValues.includes(option.name)
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
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* バッジ表示エリア */}
      {showBadges && selectedValues.length > 0 && (
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
