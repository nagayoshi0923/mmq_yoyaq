import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { flexibleMatch } from "@/utils/kanaUtils"

export interface AutocompleteOption {
  value: string
  label: string
  type?: 'staff' | 'customer'  // スタッフか顧客かを区別
}

interface AutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  staffOptions: AutocompleteOption[]  // スタッフ名の候補
  customerOptions?: AutocompleteOption[]  // 顧客名の候補（オプション）
  showStaffOnFocus?: boolean  // フォーカス時にスタッフ名を表示するか
}

export function AutocompleteInput({
  value,
  onChange,
  placeholder = "入力してください",
  className = "",
  disabled = false,
  staffOptions,
  customerOptions = [],
  showStaffOnFocus = true
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filteredOptions, setFilteredOptions] = useState<AutocompleteOption[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // フィルタリング処理
  const filterOptions = (searchTerm: string) => {
    if (!searchTerm.trim()) {
      // 入力が空の場合は、フォーカス時のみスタッフ名を表示
      if (showStaffOnFocus && isOpen) {
        return staffOptions
      }
      return []
    }

    const allOptions = [...staffOptions, ...customerOptions]
    return allOptions.filter(option => {
      return flexibleMatch(searchTerm, [option.label])
    })
  }

  // 入力値変更時の処理
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    
    const filtered = filterOptions(newValue)
    setFilteredOptions(filtered)
    
    // 候補がある場合はドロップダウンを開く
    setIsOpen(filtered.length > 0)
  }

  // フォーカス時の処理
  const handleFocus = () => {
    const filtered = filterOptions(value)
    setFilteredOptions(filtered)
    setIsOpen(filtered.length > 0)
  }

  // 選択時の処理
  const handleSelect = (option: AutocompleteOption) => {
    onChange(option.value)
    setIsOpen(false)
    inputRef.current?.focus()
  }

  // 外部クリック時の処理
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
      />
      
      {isOpen && filteredOptions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredOptions.map((option, index) => (
            <div
              key={`${option.value}-${index}`}
              className={cn(
                "px-3 py-2 cursor-pointer hover:bg-gray-100 text-sm",
                "flex items-center justify-between"
              )}
              onClick={() => handleSelect(option)}
            >
              <span>{option.label}</span>
              {option.type && (
                <span className={cn(
                  "text-xs px-2 py-1",
                  option.type === 'staff' 
                    ? "bg-blue-100 text-blue-800" 
                    : "bg-green-100 text-green-800"
                )}>
                  {option.type === 'staff' ? 'スタッフ' : '顧客'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
