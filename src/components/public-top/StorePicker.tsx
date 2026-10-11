import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export interface StoreOption {
  id: string
  label: string
}

/** 店舗（複数選択）チップ。何も選ばない＝すべて */
export function StorePicker({ options, value, onChange, primaryColor }: { options: StoreOption[]; value: string[]; onChange: (ids: string[]) => void; primaryColor: string }) {
  const [open, setOpen] = useState(false)
  const selected = value.filter((id) => options.some((o) => o.id === id))
  const label = selected.length === 0
    ? 'すべて'
    : selected.length === 1
      ? options.find((o) => o.id === selected[0])?.label ?? '1 店舗'
      : `${selected.length} 店舗`
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-sm hover:bg-muted',
            selected.length > 0 ? 'border-2 font-bold' : 'border border-input',
          )}
          style={selected.length > 0 ? { borderColor: primaryColor, color: primaryColor } : undefined}
        >
          店舗 {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-lg p-2">
        <button type="button" onClick={() => onChange([])} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
          <Checkbox checked={selected.length === 0} tabIndex={-1} aria-hidden />
          すべての店舗
        </button>
        <div className="my-1 border-t" />
        {options.map((o) => (
          <button key={o.id} type="button" onClick={() => toggle(o.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
            <Checkbox checked={selected.includes(o.id)} tabIndex={-1} aria-hidden />
            {o.label}
          </button>
        ))}
        <button type="button" onClick={() => setOpen(false)} className="mt-1 w-full rounded-md border border-input py-2 text-sm font-medium hover:bg-muted">閉じる</button>
      </PopoverContent>
    </Popover>
  )
}
