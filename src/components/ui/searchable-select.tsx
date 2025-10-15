import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { flexibleMatch } from "@/utils/kanaUtils"

export interface SearchableSelectOption {
  value: string
  label: string
  displayInfo?: string
  renderContent?: () => React.ReactNode
  searchKeywords?: string[]  // 追加の検索キーワード（読み仮名など）
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "選択してください",
  searchPlaceholder = "検索...",
  className = "",
  disabled = false
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)

  // 検索フィルタリング（ひらがな・カタカナ・アルファベット対応）
  const filteredOptions = React.useMemo(() => {
    if (!searchTerm) return options
    
    return options.filter(option => {
      const searchTargets = [
        option.label,
        option.displayInfo,
        ...(option.searchKeywords || [])
      ].filter(Boolean) as string[]
      
      return flexibleMatch(searchTerm, searchTargets)
    })
  }, [options, searchTerm])

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
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="p-0" 
        style={{ width: 'var(--radix-popover-trigger-width)' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => {
          e.stopPropagation()
        }}
      >
        <div className="p-2 border-b">
          <Input
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8"
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
            <div className="py-6 text-center text-sm text-muted-foreground">
              シナリオが見つかりません
            </div>
          ) : (
            filteredOptions.map((option) => (
              <div
                key={option.value}
                className={cn(
                  "flex items-center px-2 py-2 cursor-pointer hover:bg-muted/50 text-sm",
                  value === option.value && "bg-muted"
                )}
                onClick={() => {
                  onValueChange(option.value)
                  setOpen(false)
                  setSearchTerm("")
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 flex-shrink-0",
                    value === option.value ? "opacity-100" : "opacity-0"
                  )}
                />
                {option.renderContent ? (
                  option.renderContent()
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{option.label}</div>
                    {option.displayInfo && (
                      <div className="text-xs text-muted-foreground truncate">
                        {option.displayInfo}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

