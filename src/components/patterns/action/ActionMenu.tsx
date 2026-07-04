import type { LucideIcon } from 'lucide-react'
import { ChevronDown, Download } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export interface ActionMenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  disabled?: boolean
}

interface ActionMenuProps {
  items: (ActionMenuItem | 'separator')[]
  /** トリガーのラベル。既定 'エクスポート' */
  label?: string
  /** トリガーのアイコン。既定 Download */
  icon?: LucideIcon
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  align?: 'start' | 'end'
  /** 全体 disable（トリガーごと） */
  disabled?: boolean
  className?: string
}

/**
 * 複数アクションを 1 つのドロップダウンに集約するトリガー（エクスポート等の入出力操作の集約向け）。
 * 単独アクションには使わない（普通の Button を使うこと）。
 */
export function ActionMenu({
  items,
  label = 'エクスポート',
  icon: Icon = Download,
  variant = 'outline',
  size = 'sm',
  align = 'end',
  disabled = false,
  className,
}: ActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled} className={className}>
          <Icon className="mr-1.5 h-4 w-4" />
          {label}
          <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((item, index) => {
          if (item === 'separator') {
            return <DropdownMenuSeparator key={`separator-${index}`} />
          }
          const ItemIcon = item.icon
          return (
            <DropdownMenuItem
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {ItemIcon && <ItemIcon className="mr-2 h-4 w-4 text-muted-foreground" />}
              {item.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
