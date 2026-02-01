import * as React from 'react'
import { cn } from '@/lib/utils'

interface ContextMenuProps {
  children: React.ReactNode
}

interface ContextMenuTriggerProps {
  children: React.ReactNode
  onContextMenu?: (e: React.MouseEvent) => void
}

interface ContextMenuContentProps {
  children: React.ReactNode
  x: number
  y: number
  onClose: () => void
}

interface ContextMenuItemProps {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}

interface ContextMenuSeparatorProps {
  className?: string
}

interface ContextMenuLabelProps {
  children: React.ReactNode
  className?: string
}

// Context Menu Item
export const ContextMenuItem = React.forwardRef<
  HTMLDivElement,
  ContextMenuItemProps
>(({ children, onClick, disabled, className }, ref) => {
  return (
    <div
      ref={ref}
      onClick={disabled ? undefined : onClick}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
        'hover:bg-accent hover:text-accent-foreground',
        'focus:bg-accent focus:text-accent-foreground',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      {children}
    </div>
  )
})
ContextMenuItem.displayName = 'ContextMenuItem'

// Context Menu Separator
export const ContextMenuSeparator = React.forwardRef<
  HTMLDivElement,
  ContextMenuSeparatorProps
>(({ className }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
    />
  )
})
ContextMenuSeparator.displayName = 'ContextMenuSeparator'

// Context Menu Label
export const ContextMenuLabel = React.forwardRef<
  HTMLDivElement,
  ContextMenuLabelProps
>(({ children, className }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)}
    >
      {children}
    </div>
  )
})
ContextMenuLabel.displayName = 'ContextMenuLabel'

// Context Menu Content (Popup)
export const ContextMenuContent: React.FC<ContextMenuContentProps> = ({
  children,
  x,
  y,
  onClose
}) => {
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Adjust position if menu would go off screen
  const [adjustedPos, setAdjustedPos] = React.useState({ x, y })

  React.useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let newX = x
      let newY = y

      if (x + rect.width > viewportWidth) {
        newX = viewportWidth - rect.width - 8
      }
      if (y + rect.height > viewportHeight) {
        newY = viewportHeight - rect.height - 8
      }

      setAdjustedPos({ x: newX, y: newY })
    }
  }, [x, y])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      onClick={onClose}
    >
      {children}
    </div>
  )
}
