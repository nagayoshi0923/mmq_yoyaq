import { Link } from 'react-router-dom'
import { ScenarioCard } from './ScenarioCard'
import type { ScenarioCardData } from './scenarioCards'
import { TopSection } from './TopSection'
import type { ScenarioMarks } from './useScenarioMarks'
import { formatNewArrivalDate, type NewArrivalDate } from './newArrivals'

export interface NewArrivalItem {
  card: ScenarioCardData
  /** 並びに使った日付（リリース日、無ければ掲載登録日。newArrivals.ts） */
  date: NewArrivalDate
}

interface NewArrivalsSectionProps {
  items: NewArrivalItem[]
  /** 見出しの下の一言 */
  lead: string
  /**
   * 「すべて見る ›」の行き先。新作だけの一覧（全体 /scenario?filter=new、組織 /{org}/catalog?filter=new）。
   * 全作品のカタログではない（2026-10-24 社長指摘: 新作一覧が見たいはず）
   */
  allPath: string
  marks?: ScenarioMarks | null
  onOpen: (card: ScenarioCardData) => void
}

/**
 * 新作一覧（リリース日、無ければ掲載登録日の新しい順の横スクロール）。MMQ 全体トップ・店舗トップで共通。
 * カードは残りわずかと同じ本番の作品カード。カードの下にその日付（どちらの日付かを書く）。0 件なら区画ごと出さない。
 */
export function NewArrivalsSection({ items, lead, allPath, marks, onOpen }: NewArrivalsSectionProps) {
  if (items.length === 0) return null
  return (
    <TopSection
      id="new-arrivals"
      title="新作一覧"
      aside={<Link to={allPath} className="font-medium text-booking-primary hover:underline">すべて見る ›</Link>}
    >
      <p className="-mt-1 mb-2 text-xs text-muted-foreground">{lead}</p>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scroll-row" aria-label="新作一覧">
        {items.map(({ card, date }) => (
          <li key={card.key} className="flex w-[150px] shrink-0 flex-col sm:w-[180px]">
            <ScenarioCard card={card} marks={marks} onOpen={onOpen} className="flex-1" />
            <p className="mt-1 ts-10 text-muted-foreground">{formatNewArrivalDate(date)}</p>
          </li>
        ))}
      </ul>
    </TopSection>
  )
}
