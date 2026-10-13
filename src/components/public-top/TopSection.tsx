import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TopSectionProps {
  id?: string
  title: ReactNode
  aside?: ReactNode
  tone?: 'plain' | 'accent'
  className?: string
  children: ReactNode
}

/** トップページの白い区画（見出し＋右側の小さな文字・リンク） */
export function TopSection({ id, title, aside, tone = 'plain', className, children }: TopSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-4 rounded-lg border p-3 sm:p-4',
        tone === 'accent' ? 'border-violet-200 bg-violet-50' : 'border-border bg-white',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold sm:text-base">{title}</h2>
        {aside && <div className="shrink-0 text-xs text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  )
}
