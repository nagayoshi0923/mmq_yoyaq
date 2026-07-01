import { ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface FilterBarProps {
  children: ReactNode
  /** いずれかのフィルタが既定値以外のとき true（リセットボタンが出る） */
  isDirty?: boolean
  onReset?: () => void
  className?: string
}

/**
 * 絞り込みバーの定型（常時表示・flex-wrap・右端にリセット）
 *
 * 中身は FilterSelect / SearchInput / DateRangePopover 等を並べる。
 * コントロール高さは h-8 に統一（デザイン規約 5.1）。
 */
export function FilterBar({ children, isDirty, onReset, className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
      {isDirty && onReset && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={onReset}
        >
          <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />
          リセット
        </Button>
      )}
    </div>
  )
}

export interface FilterSelectOption {
  value: string
  label: string
}

interface FilterSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: FilterSelectOption[]
  placeholder?: string
  className?: string
}

/**
 * FilterBar 内で使うプルダウンの定型（h-8 / text-xs / 内容幅）
 */
export function FilterSelect({ value, onValueChange, options, placeholder, className }: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn('h-8 w-auto min-w-[120px] text-xs', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
