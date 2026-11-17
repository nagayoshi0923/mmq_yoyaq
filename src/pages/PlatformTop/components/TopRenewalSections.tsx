import { Link } from 'react-router-dom'
import { RenewalRow, RenewalSection } from '@/components/renewal/RenewalSection'
import { PosterCard } from '@/components/renewal/PosterCard'
import { durationLabel, playersLabel, seatsLabel } from '@/components/renewal/labels'
import { nearlyFullLabel, newArrivalLabel } from './topRenewalLabels'
import { PRIVATE_PURPLE } from '@/components/renewal/fonts'
import { performanceDetailPath, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import type { ScenarioCardData } from '@/components/public-top/scenarioCards'
import type { NewArrivalDate } from '@/components/public-top/newArrivals'

export interface RenewalNewArrival {
  card: ScenarioCardData
  date: NewArrivalDate
  /** 「クインズワルツ ほか2組織」 */
  organizations: string
}

/** 新作（黒地・縦長の大きな画像の横スクロール）。0 件なら出さない */
export function NewArrivalsRow({ items, allPath, onOpen }: { items: RenewalNewArrival[]; allPath: string; onOpen: (path: string) => void }) {
  if (items.length === 0) return null
  return (
    <RenewalSection id="new-arrivals" title="新作" lead="全国の店舗で、新しく遊べるようになった作品" more={{ label: 'すべて見る', to: allPath }} dark>
      <RenewalRow label="新作">
        {items.map(({ card, date, organizations }) => (
          <li key={card.key} className="w-[290px] shrink-0 snap-start sm:w-[300px]">
            <PosterCard
              dark
              title={card.title}
              imageUrl={card.key_visual_url}
              label={newArrivalLabel(date)}
              meta={[organizations, playersLabel(card.player_count_min, card.player_count_max), durationLabel(card.duration_minutes)].filter(Boolean).join('・')}
              onOpen={() => onOpen(card.path)}
            />
          </li>
        ))}
      </RenewalRow>
    </RenewalSection>
  )
}

/** もうすぐ成立する公演（成立まであと 1〜2 人・残りわずか。日付の早い順の横スクロール）。0 件なら出さない */
export function NearlyFullRow({ performances, onOpen }: { performances: PublicPerformance[]; onOpen: (path: string) => void }) {
  if (performances.length === 0) return null
  return (
    <RenewalSection id="nearly-full" title="もうすぐ成立する公演" lead="あと少しで人数がそろう回・残りわずかの回です（日付の早い順）">
      <RenewalRow label="もうすぐ成立する公演">
        {performances.map((p) => (
          <li key={p.id} className="w-[200px] shrink-0 snap-start">
            <PosterCard
              title={p.title}
              imageUrl={p.key_visual_url}
              label={nearlyFullLabel(p)}
              place={`${p.organization_name}・${p.store_short_name ?? p.store_name}`}
              meta={[playersLabel(p.player_count_min, p.player_count_max), durationLabel(p.duration_minutes)].filter(Boolean).join('・')}
              event={{ date: p.date, start_time: p.start_time, store_name: p.store_short_name ?? p.store_name, seats: seatsLabel(p.available_seats) }}
              onOpen={() => onOpen(performanceDetailPath(p))}
              testId="nearly-full-card"
            />
          </li>
        ))}
      </RenewalRow>
    </RenewalSection>
  )
}

/** テーマで探す（作品のカテゴリのチップ → 全体カタログをそのカテゴリで） */
export function ThemeChips({ genres }: { genres: string[] }) {
  if (genres.length === 0) return null
  return (
    <RenewalSection id="themes" title="テーマで探す" className="pb-2">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-row">
        {genres.map((g) => (
          <Link key={g} to={`/scenario?genre=${encodeURIComponent(g)}`} className="inline-flex h-10 shrink-0 items-center rounded-full border border-gray-300 bg-white px-4 text-sm hover:bg-gray-50">
            {g}
          </Link>
        ))}
      </div>
    </RenewalSection>
  )
}

/** 友だちと貸切で遊ぶ（紫の大きなボタン → 貸切できる作品を探す） */
export function PrivateBookingBlock({ to }: { to: string }) {
  return (
    <RenewalSection id="private-booking" title="友だちと貸切で遊ぶ">
      <p className="text-sm leading-relaxed">4〜8人そろえば、好きな作品を好きな日に。日程の相談から申込まで、このサイトでできます。</p>
      <Link
        to={to}
        className="mt-4 flex h-14 w-full items-center justify-center rounded-[2px] text-base font-bold text-white hover:opacity-90"
        style={{ backgroundColor: PRIVATE_PURPLE }}
      >
        貸切できる作品を探す
      </Link>
    </RenewalSection>
  )
}

/** いちばん下の 2 つの案内 */
export function BottomLinks({ links }: { links: Array<{ label: string; to: string }> }) {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-8 pt-2">
      <ul className="divide-y divide-gray-200 border-y border-gray-200 text-sm">
        {links.map((l) => (
          <li key={l.to}><Link to={l.to} className="block py-3 underline-offset-4 hover:underline">{l.label}</Link></li>
        ))}
      </ul>
    </div>
  )
}
