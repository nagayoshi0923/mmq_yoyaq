import { useMemo } from 'react'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { ScenarioCard } from './ScenarioCard'
import { groupPerformancesIntoCards, type ScenarioCardData, type ScenarioCardSource } from './scenarioCards'
import { TopSection } from './TopSection'
import type { ScenarioMarks } from './useScenarioMarks'

interface NearlyFullStripProps {
  performances: PublicPerformance[]
  source: ScenarioCardSource
  marks?: ScenarioMarks | null
  /** 見出しの右の小さな文字 */
  aside?: string
  onOpen: (card: ScenarioCardData) => void
}

/**
 * 残りわずか（残席 3 以下または成立間近、日付順の横スクロール）。店舗トップ・全体トップで共通。
 * カードは本番の作品カード（2026-10-13 社長承認の見本）。次回公演の行は、その残りわずかの公演が先頭。
 */
export function NearlyFullStrip({ performances, source, marks, aside = '日付順', onOpen }: NearlyFullStripProps) {
  const cards = useMemo(
    () => groupPerformancesIntoCards(performances, source.upcoming, { highlight: false, meta: source.meta, showOrganization: source.showOrganization }),
    [performances, source],
  )
  if (cards.length === 0) return null
  return (
    <TopSection id="nearly-full" title="残りわずか" aside={aside}>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scroll-row">
        {cards.map((card) => (
          <ScenarioCard key={card.key} card={card} marks={marks} onOpen={onOpen} className="w-[150px] shrink-0" />
        ))}
      </div>
    </TopSection>
  )
}
