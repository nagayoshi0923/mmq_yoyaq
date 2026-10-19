/**
 * 「料金」: 1 人あたり・合計（貸切申込の画面と同じ計算）と支払いの注記。
 * 合計の書き方は申込シートと同じ「¥5,000 × 8 名 = ¥40,000」。何の人数かを括弧で添える
 * （申込前は「いまの参加人数」、申込後は「申込人数」。2026-10-20 staging 点検: 2 つの人数の意味が分からなかった）。
 */
import type { PrivateBookingPhase } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingMenu'
import { priceFormula, yenRange, type PriceSummary } from '../overviewModel'
import { OverviewSection } from './OverviewSection'

/** 補助文。候補日で料金が変わる注記を先頭に（2026-10-11 社長訂正の文面） */
export function priceNote(varies: boolean, minPlayers: number | null): string {
  return [
    varies ? '候補日（平日・土日祝など）によって変わります。確定した日の料金になります。' : '',
    '税込。当日、店舗で現金またはカードでお支払いください。料金は参加人数分です。',
    minPlayers && minPlayers > 0 ? `参加人数が最低人数（${minPlayers}名）に満たない場合は公演不成立となります。` : '',
  ].join('')
}

interface PriceSectionProps {
  price: PriceSummary | null
  phase: PrivateBookingPhase
  minPlayers: number | null
  /** price.people が申込人数（店舗へ送った人数）なら 'requested'、いまの参加人数なら 'current' */
  basis?: 'current' | 'requested'
  /** いまの参加人数（申込人数と違うときに添える） */
  currentPeople?: number
}

export function PriceSection({ price, phase, minPlayers, basis = 'current', currentPeople }: PriceSectionProps) {
  if (!price) return null
  const varies = price.perPersonMin !== price.perPersonMax && phase !== 'confirmed'
  const shortBy = minPlayers && minPlayers > price.people ? minPlayers - price.people : 0
  const totalLabel = basis === 'requested' ? `合計（申込人数 ${price.people} 名）` : `合計（いまの参加人数 ${price.people} 名）`
  const differs = basis === 'requested' && currentPeople != null && currentPeople !== price.people
  return (
    <OverviewSection label="料金" testId="overview-price" title="料金">
      <dl className="text-sm">
        <div className="flex justify-between py-0.5">
          <dt>1 人あたり</dt>
          <dd className="tabular-nums">{yenRange(price.perPersonMin, price.perPersonMax)}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-2 py-0.5">
          <dt>{totalLabel}</dt>
          <dd className="tabular-nums font-bold" data-testid="overview-price-total">{priceFormula(price)}</dd>
        </div>
        {differs && (
          <div className="text-right text-xs text-muted-foreground" data-testid="overview-price-current">
            いまの参加人数は {currentPeople} 名です。当日の人数が変わる場合は店舗にご連絡ください。
          </div>
        )}
        {shortBy > 0 && (
          <div className="text-right text-xs text-muted-foreground" data-testid="overview-price-short">あと {shortBy} 名で成立</div>
        )}
      </dl>
      <p className="mt-1 text-xs text-muted-foreground leading-snug">{priceNote(varies, minPlayers)}</p>
    </OverviewSection>
  )
}
