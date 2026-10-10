/** 「料金」: 1 人あたり・いまの参加人数分の合計（貸切申込の画面と同じ計算）と支払いの注記 */
import type { PrivateBookingPhase } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingMenu'
import { yenRange, type PriceSummary } from '../overviewModel'
import { OverviewSection } from './OverviewSection'

/** 補助文。候補日で料金が変わる注記を先頭に（2026-10-11 社長訂正の文面） */
export function priceNote(varies: boolean, minPlayers: number | null): string {
  return [
    varies ? '候補日（平日・土日祝など）によって変わります。確定した日の料金になります。' : '',
    '税込。当日、店舗で現金またはカードでお支払いください。料金は参加人数分です。',
    minPlayers && minPlayers > 0 ? `参加人数が最低人数（${minPlayers}名）に満たない場合は公演不成立となります。` : '',
  ].join('')
}

export function PriceSection({ price, phase, minPlayers }: { price: PriceSummary | null; phase: PrivateBookingPhase; minPlayers: number | null }) {
  if (!price) return null
  const varies = price.perPersonMin !== price.perPersonMax && phase !== 'confirmed'
  const shortBy = minPlayers && minPlayers > price.people ? minPlayers - price.people : 0
  return (
    <OverviewSection label="料金" testId="overview-price" title="料金">
      <dl className="text-sm">
        <div className="flex justify-between py-0.5">
          <dt>1 人あたり</dt>
          <dd className="tabular-nums">{yenRange(price.perPersonMin, price.perPersonMax)}</dd>
        </div>
        <div className="flex justify-between py-0.5">
          <dt>いまの参加人数 {price.people} 名の合計</dt>
          <dd className="tabular-nums font-bold">{yenRange(price.totalMin, price.totalMax)}</dd>
        </div>
        {shortBy > 0 && (
          <div className="text-right text-xs text-muted-foreground" data-testid="overview-price-short">あと {shortBy} 名で成立</div>
        )}
      </dl>
      <p className="mt-1 text-xs text-muted-foreground leading-snug">{priceNote(varies, minPlayers)}</p>
    </OverviewSection>
  )
}
