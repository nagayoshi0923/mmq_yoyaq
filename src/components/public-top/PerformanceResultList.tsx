import { useEffect, useState, type ReactNode } from 'react'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { PerformanceResultCard } from './PerformanceResultCard'

interface PerformanceResultListProps {
  performances: PublicPerformance[]
  isLoading?: boolean
  showOrganization?: boolean
  /** 最初に出す件数と「あと N 件を見る」で足す件数 */
  pageSize?: number
  /** 条件が変わったら表示件数を戻すための鍵 */
  resetKey: string
  empty: ReactNode
  onSelect: (performance: PublicPerformance) => void
}

/** 公演の結果一覧（スマホ 1 列・PC 2 列まで）と「あと N 件を見る」 */
export function PerformanceResultList({ performances, isLoading, showOrganization, pageSize = 5, resetKey, empty, onSelect }: PerformanceResultListProps) {
  const [visible, setVisible] = useState(pageSize)
  useEffect(() => { setVisible(pageSize) }, [resetKey, pageSize])

  if (isLoading && performances.length === 0) {
    return (
      <div className="mt-2 grid gap-2 md:grid-cols-2" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[98px] animate-pulse rounded-lg bg-muted" />)}
      </div>
    )
  }
  if (performances.length === 0) return <div className="mt-2 rounded-lg bg-muted/50 p-4 text-center text-sm text-muted-foreground">{empty}</div>

  const rest = performances.length - visible
  return (
    <>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        {performances.slice(0, visible).map((p) => (
          <PerformanceResultCard key={p.id} performance={p} showOrganization={showOrganization} onSelect={onSelect} />
        ))}
      </div>
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + pageSize * 2)}
          className="mt-2 block w-full rounded-md border border-input bg-white px-4 py-2.5 text-sm font-medium hover:bg-muted"
        >
          あと {rest} 件を見る
        </button>
      )}
    </>
  )
}
