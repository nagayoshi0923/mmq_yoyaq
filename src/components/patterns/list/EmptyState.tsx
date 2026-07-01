import { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  /** 文言規約:「該当する◯◯がありません」 */
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/**
 * 空状態の統一表示
 *
 * 一覧・検索結果・タブの「データなし」はすべてこれを使う
 * （デザイン規約: docs/IMPROVEMENT_HANDOFF.md 5.1 / 5.2）。
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('py-12 text-center', className)}>
      {Icon && <Icon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" aria-hidden="true" />}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
