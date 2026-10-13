import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { ScenarioCard } from './ScenarioCard'
import { groupPerformancesIntoCards, type ScenarioCardData, type ScenarioCardSource } from './scenarioCards'
import type { ScenarioMarks } from './useScenarioMarks'

interface PerformanceResultListProps {
  performances: PublicPerformance[]
  source: ScenarioCardSource
  marks?: ScenarioMarks | null
  isLoading?: boolean
  /** 最初に出す枚数（「あと N 件を見る」ではこの 2 倍ずつ足す） */
  pageSize?: number
  /** 条件が変わったら表示件数を戻すための鍵 */
  resetKey: string
  empty: ReactNode
  onOpen: (card: ScenarioCardData) => void
}

/**
 * 空いている公演を探すの結果。本番の作品カードを 2 列で（PC は 4 列）。
 * 同じ作品で複数の公演が該当したら 1 枚にまとめ、該当の公演の行に薄く色を付ける（2026-10-13 社長承認の見本）。
 */
export function PerformanceResultList({ performances, source, marks, isLoading, pageSize = 4, resetKey, empty, onOpen }: PerformanceResultListProps) {
  const [visible, setVisible] = useState(pageSize)
  useEffect(() => { setVisible(pageSize) }, [resetKey, pageSize])
  const cards = useMemo(
    () => groupPerformancesIntoCards(performances, source.upcoming, { highlight: true, meta: source.meta, showOrganization: source.showOrganization }),
    [performances, source],
  )

  if (isLoading && performances.length === 0) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[3/5] animate-pulse bg-muted" />)}
      </div>
    )
  }
  if (cards.length === 0) return <div className="mt-2 rounded-lg bg-muted/50 p-4 text-center text-sm text-muted-foreground">{empty}</div>

  const rest = cards.length - visible
  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        {cards.slice(0, visible).map((card) => (
          <ScenarioCard key={card.key} card={card} marks={marks} onOpen={onOpen} />
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
