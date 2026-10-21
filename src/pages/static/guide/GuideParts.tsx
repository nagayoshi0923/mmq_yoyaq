/**
 * 使い方ガイド（/guide）と貸切の流れ（/guide/private）で共通の見た目の部品。
 */
import type { MouseEvent, ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
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

export type GuideEntry = {
  title: string
  description: string
  icon: ReactNode
  /** ほかのページへ行くとき */
  to?: string
  /** 同じページの節へスクロールするとき（要素の id） */
  scrollToId?: string
  testId?: string
}

function scrollToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id)
  if (!target) return
  event.preventDefault()
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** ヒーローのすぐ下に置く入口（PC は横並び、スマホは縦並び）。予約の流れと貸切の流れを行き来できるようにする */
export function GuideEntryLinks({ entries }: { entries: ReadonlyArray<GuideEntry> }) {
  const cols = entries.length > 1 ? 'sm:grid-cols-2' : ''
  return (
    <nav aria-label="ご案内の入口" className="max-w-3xl mx-auto px-4 pt-6 md:pt-8">
      <ul className={`grid gap-3 ${cols}`}>
        {entries.map(entry => {
          const inner = (
            <Card className="h-full p-4 flex items-center gap-3 transition-colors hover:border-violet-300 hover:bg-violet-50/60">
              <span
                className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white"
                style={{ backgroundColor: THEME.primary }}
                aria-hidden="true"
              >
                {entry.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{entry.title}</span>
                <span className="block ts-muted mt-0.5">{entry.description}</span>
              </span>
              <ArrowRight className="w-5 h-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            </Card>
          )
          return (
            <li key={entry.title}>
              {entry.to ? (
                <Link to={entry.to} className="block h-full" data-testid={entry.testId}>{inner}</Link>
              ) : (
                <a
                  href={`#${entry.scrollToId}`}
                  className="block h-full"
                  data-testid={entry.testId}
                  onClick={event => entry.scrollToId && scrollToSection(event, entry.scrollToId)}
                >
                  {inner}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
