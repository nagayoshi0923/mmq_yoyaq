import { useMemo, type ReactNode } from 'react'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { ScenarioCard } from './ScenarioCard'
import { groupPerformancesIntoCards, type ScenarioCardData, type ScenarioCardSource } from './scenarioCards'
import type { ScenarioMarks } from './useScenarioMarks'

interface PerformanceResultListProps {
  performances: PublicPerformance[]
  source: ScenarioCardSource
  marks?: ScenarioMarks | null
  isLoading?: boolean
  empty: ReactNode
  onOpen: (card: ScenarioCardData) => void
}

/**
 * 空いている公演を探すの結果。本番の作品カードを 2 列で（PC は 4 列）。
 * 同じ作品で複数の公演が該当したら 1 枚にまとめ、該当の公演の行に薄く色を付ける（2026-10-13 社長承認の見本）。
 * 該当する作品カードは全部並べる（「あと N 件を見る」の折りたたみは 2026-10-13 社長指示で外した。
 * 件数が多くても画像は遅延読み込み〔ScenarioCardImage の loading="lazy"〕なので、見えるところから読む）。
 */
export function PerformanceResultList({ performances, source, marks, isLoading, empty, onOpen }: PerformanceResultListProps) {
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

  return (
    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
      {cards.map((card) => (
        <ScenarioCard key={card.key} card={card} marks={marks} onOpen={onOpen} />
      ))}
    </div>
  )
}
