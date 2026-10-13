/**
 * 使い方ガイド（/guide）と貸切の流れ（/guide/private）で共通の見た目の部品。
 */
import type { ReactNode } from 'react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

export function StepHeading({ n, title, lead }: { n: number | string; title: string; lead?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
        style={{ backgroundColor: THEME.primary }}
      >
        {n}
      </div>
      <div className="min-w-0">
        <h2>{title}</h2>
        {lead && <p className="ts-muted mt-0.5">{lead}</p>}
      </div>
    </div>
  )
}

export function Section({ children, id, tinted = false }: { children: ReactNode; id?: string; tinted?: boolean }) {
  return (
    <section id={id} className={`scroll-mt-4 ${tinted ? 'bg-violet-50/60' : ''}`}>
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-10 space-y-4">{children}</div>
    </section>
  )
}

export function SubStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center ts-label">{n}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  )
}

export function Body({ children }: { children: ReactNode }) {
  return <p className="ts-body text-muted-foreground leading-relaxed">{children}</p>
}

export function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="ts-label">Q. {q}</h3>
      <p className="ts-body text-muted-foreground leading-relaxed">{children}</p>
    </div>
  )
}
