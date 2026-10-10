/** 「料金」: 1 人あたり・定員分の合計（貸切申込の画面と同じ計算）と支払いの注記 */
import type { PrivateBookingPhase } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingMenu'
import { yenRange, type PriceSummary } from '../overviewModel'
import { OverviewSection } from './OverviewSection'

export function PriceSection({ price, phase }: { price: PriceSummary | null; phase: PrivateBookingPhase }) {
  if (!price) return null
  const varies = price.perPersonMin !== price.perPersonMax
  return (
    <OverviewSection label="料金" testId="overview-price" title="料金">
      <dl className="text-sm">
        <div className="flex justify-between py-0.5">
          <dt>1 人あたり</dt>
          <dd className="tabular-nums">{yenRange(price.perPersonMin, price.perPersonMax)}</dd>
        </div>
        <div className="flex justify-between py-0.5">
          <dt>{price.people} 名の場合の合計</dt>
          <dd className="tabular-nums font-bold">{yenRange(price.totalMin, price.totalMax)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-xs text-muted-foreground leading-snug">
        {varies && phase !== 'confirmed' ? '候補日（平日・土日祝など）によって変わります。確定した日の料金になります。' : ''}
        税込。当日、店舗で現金またはカードでお支払いください。参加人数が定員に満たない場合も定員分の料金になります。
      </p>
    </OverviewSection>
  )
}
