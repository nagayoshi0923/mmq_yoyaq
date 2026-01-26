import * as React from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"

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
  displayInfo?: string | React.ReactNode
  displayInfoSearchText?: string  // displayInfoがReactNodeの場合の検索用テキスト
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
  emptyText?: string
  onEmptyAction?: () => void
  emptyActionLabel?: string
  allowCustomValue?: boolean  // カスタム値を許可するかどうか
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "選択してください",
  searchPlaceholder = "検索...",
  className = "",
  disabled = false,
  emptyText = "見つかりません",
  onEmptyAction,
  emptyActionLabel = "作成",
  allowCustomValue = false
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)

  // 検索フィルタリング（ひらがな・カタカナ・アルファベット対応）
  const filteredOptions = React.useMemo(() => {
    if (!searchTerm) return options
    
    return options.filter(option => {
      // displayInfoがstringの場合はそれを使い、ReactNodeの場合はdisplayInfoSearchTextを使う
      const displayInfoText = typeof option.displayInfo === 'string' 
        ? option.displayInfo 
        : option.displayInfoSearchText
      
      const searchTargets = [
        option.label,
        displayInfoText,
        ...(option.searchKeywords || [])
      ].filter(Boolean) as string[]
      
      return flexibleMatch(searchTerm, searchTargets)
    })
  }, [options, searchTerm])

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal text-xs",
            className
          )}
          disabled={disabled}
          style={{ backgroundColor: '#F6F9FB' }}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="p-0 z-[100] flex flex-col" 
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
            placeholder={searchPlaceholder}
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
          {filteredOptions.length === 0 ? (
            <div className="py-3 text-center">
              <p className="text-xs text-muted-foreground">{emptyText}</p>
              {allowCustomValue && searchTerm && (
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onValueChange(searchTerm)
                      setOpen(false)
                      setSearchTerm("")
                    }}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    「{searchTerm}」で追加
                  </Button>
                </div>
              )}
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
                      <div className={cn(
                        "text-xs text-muted-foreground",
                        typeof option.displayInfo === 'string' && "truncate"
                      )}>
                        {option.displayInfo}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        {/* 下部に固定表示するアクションボタン */}
        {onEmptyAction && emptyActionLabel && (
          <div className="p-2 border-t bg-muted/30 flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onEmptyAction()
                setOpen(false)
              }}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              {emptyActionLabel}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

