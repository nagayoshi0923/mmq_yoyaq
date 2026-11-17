import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface RenewalSectionProps {
  id?: string
  title: ReactNode
  /** 見出しの下の一言 */
  lead?: ReactNode
  /** 見出しの右のリンク（「すべて見る」など） */
  more?: { label: string; to: string }
  /** 黒地（新作の区画） */
  dark?: boolean
  className?: string
  children: ReactNode
}

/**
 * お客様画面の刷新（QW-20261114-001、Figma「プロトタイプ（スマホ全画面）」）の区画。
 * 枠線や角丸の箱にせず、画面の幅いっぱいに見出し → 一言 → 中身を並べる。
 */
export function RenewalSection({ id, title, lead, more, dark, className, children }: RenewalSectionProps) {
  return (
    <section id={id} className={cn('scroll-mt-14 py-7', dark ? 'bg-[#0d0d0d] text-white' : 'bg-transparent', className)}>
      <div className="mx-auto max-w-4xl px-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold tracking-wide">{title}</h2>
          {more && (
            <Link to={more.to} className={cn('shrink-0 text-sm', dark ? 'text-white/85 hover:text-white' : 'text-foreground underline underline-offset-4 hover:opacity-70')}>
              {more.label}
            </Link>
          )}
        </div>
        {lead && <p className={cn('mt-1.5 text-sm', dark ? 'text-white/60' : 'text-muted-foreground')}>{lead}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </section>
  )
}

/** 横に流す一列（右端は画面の外まで続けて、続きがあると分かるように） */
export function RenewalRow({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-1 scroll-row" aria-label={label}>
      {children}
    </ul>
  )
}
