import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ListSkeletonProps {
  rows?: number
  /** row=アバター付き行 / card=カード縦積み / table=ヘッダー+行 */
  variant?: 'row' | 'card' | 'table'
  className?: string
}

/**
 * 一覧ロード中の統一スケルトン
 *
 * ページ毎の自作スケルトン・「読み込み中...」テキスト・単独スピナーの置き換え先。
 */
export function ListSkeleton({ rows = 5, variant = 'row', className }: ListSkeletonProps) {
  if (variant === 'table') {
    return (
      <div className={cn('space-y-2', className)} aria-busy="true">
        <Skeleton className="h-9 w-full rounded-lg" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className={cn('space-y-2', className)} aria-busy="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-14 items-center gap-3 rounded-lg border px-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-14" />
        </div>
      ))}
    </div>
  )
}
