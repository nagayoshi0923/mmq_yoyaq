import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface RenewalChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
}

/** 丸い選択チップ（選択中は黒地に白字。Figma のチップと同じ） */
export const RenewalChip = forwardRef<HTMLButtonElement, RenewalChipProps>(function RenewalChip({ selected, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-4 text-sm transition-colors',
        selected ? 'border-[#111] bg-[#111] font-bold text-white' : 'border-gray-300 bg-white text-foreground hover:bg-gray-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
