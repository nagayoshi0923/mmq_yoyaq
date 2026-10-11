import { useState } from 'react'
import { ChevronDown, Users } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PEOPLE_OPTIONS } from '@/lib/publicPerformanceSearch'
import { cn } from '@/lib/utils'

/** 人数（1〜8 名）を選ぶチップ */
export function PeoplePicker({ value, onChange, className, block = false }: { value: number; onChange: (n: number) => void; className?: string; block?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 whitespace-nowrap border border-input bg-white text-sm hover:bg-muted',
            block ? 'w-full justify-between rounded-md px-2.5 py-2' : 'rounded-full px-3 py-1.5',
            className,
          )}
        >
          <span className="inline-flex items-center gap-1">{block && <Users className="h-4 w-4 text-muted-foreground" aria-hidden />}人数 {value} 名</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 rounded-lg p-2">
        <div className="grid grid-cols-4 gap-1">
          {PEOPLE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { onChange(n); setOpen(false) }}
              className={cn('rounded-md py-2 text-sm', n === value ? 'bg-foreground font-bold text-background' : 'hover:bg-muted')}
            >
              {n} 名
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground">一緒に予約する人数（自分を含む）</p>
      </PopoverContent>
    </Popover>
  )
}
