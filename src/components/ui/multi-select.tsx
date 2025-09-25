import React, { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  options: MultiSelectOption[]
  selectedValues: string[]
  onSelectionChange: (values: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function MultiSelect({
  options,
  selectedValues,
  onSelectionChange,
  placeholder = "選択してください",
  className = "",
  disabled = false
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)

  const handleToggleSelection = (value: string) => {
    const isSelected = selectedValues.includes(value)
    if (isSelected) {
      onSelectionChange(selectedValues.filter(v => v !== value))
    } else {
      onSelectionChange([...selectedValues, value])
    }
  }

  const getDisplayValue = () => {
    if (selectedValues.length === 0) {
      return placeholder
    }
    if (selectedValues.length === 1) {
      return selectedValues[0]
    }
    return `${selectedValues.length}名選択中`
  }

  return (
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
          {options.map(option => {
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
  )
}
