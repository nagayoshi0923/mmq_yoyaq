import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ChipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  tone?: 'primary' | 'green'
  primaryColor?: string
  children: ReactNode
}

/** 丸い絞り込みチップ（押すと選択の印）。ポップオーバーの引き金にも使うので ref を渡す */
export const ChipButton = forwardRef<HTMLButtonElement, ChipButtonProps>(function ChipButton(
  { selected = false, tone = 'primary', primaryColor = '#E60012', className, children, style, ...rest },
  ref,
) {
  const selectedStyle = selected
    ? tone === 'green'
      ? { borderColor: '#15803d', color: '#15803d' }
      : { borderColor: primaryColor, color: primaryColor }
    : undefined
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[13px] transition-colors',
        selected ? 'border-2 font-bold' : 'border border-input text-foreground hover:bg-muted',
        className,
      )}
      style={{ ...selectedStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  )
})
