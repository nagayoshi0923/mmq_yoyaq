/** 概要タブの 1 つの欄（白い箱・見出し・右上の導線） */
import type { ReactNode } from 'react'

interface OverviewSectionProps {
  title: ReactNode
  /** 見出しの右（「作品ページを見る ›」「4/6名」など） */
  aside?: ReactNode
  label: string
  testId?: string
  children: ReactNode
}

export function OverviewSection({ title, aside, label, testId, children }: OverviewSectionProps) {
  return (
    <section className="bg-card border border-border rounded-lg p-3" aria-label={label} data-testid={testId}>
      <h2 className="mb-2 flex items-center justify-between gap-2 text-sm font-bold">
        <span className="min-w-0">{title}</span>
        {aside && <span className="shrink-0 text-xs font-normal">{aside}</span>}
      </h2>
      {children}
    </section>
  )
}

/** 見出しの右に置く小さな導線 */
export function AsideLink({ onClick, href, children, testId }: { onClick?: () => void; href?: string; children: ReactNode; testId?: string }) {
  const className = 'text-violet-700 hover:underline'
  if (href) return <a href={href} className={className} data-testid={testId}>{children}</a>
  return <button type="button" onClick={onClick} className={className} data-testid={testId}>{children}</button>
}
