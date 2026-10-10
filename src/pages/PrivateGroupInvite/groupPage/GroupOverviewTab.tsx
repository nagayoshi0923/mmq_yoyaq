/**
 * 概要タブ（刷新 2026-10-11、見本 GroupOverview.dc.html）。上から
 * 作品について → 登場人物 → 日程と場所 → 参加メンバー → 料金 → 店舗とのやりとり → 注意事項とキャンセル規定。
 * 作品の情報は作品ページと同じ公開用の読み取り（useGroupScenarioInfo）。希望店舗は「日程と場所」の 1 か所だけに出す。
 */
import type { ReactNode } from 'react'
import type { PrivateGroup } from '@/types'
import type { PrivateGroupLinkedReservation } from '@/lib/privateGroupRead'
import type { PrivateBookingPhase } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingMenu'
import type { AnswerTable } from './groupPageModel'
import type { GroupScenarioData } from './useGroupScenarioInfo'
import { findStoreByName, priceSummary, publicCharacters } from './overviewModel'
import { ScenarioAboutSection } from './overview/ScenarioAboutSection'
import { CharactersSection } from './overview/CharactersSection'
import { ScheduleVenueSection } from './overview/ScheduleVenueSection'
import { MembersSummarySection } from './overview/MembersSummarySection'
import { PriceSection } from './overview/PriceSection'
import { NoticeSection } from './overview/NoticeSection'
import { OverviewSection } from './overview/OverviewSection'

interface GroupOverviewTabProps {
  group: PrivateGroup
  title: string
  imageUrl: string | null
  playerRange: { min: number | null; max: number | null }
  scenarioData: GroupScenarioData | undefined
  scenarioUrl: string | null
  table: AnswerTable
  phase: PrivateBookingPhase
  inviteCap: number | null
  preferredStores: Array<{ id: string; name: string }>
  linkedReservation: PrivateGroupLinkedReservation | null
  /** 申込内容（BookingSummaryBox の embedded。申込前は null） */
  bookingSummary: ReactNode
  copied: boolean
  onCopyInvite: () => void
  onEditStore: (() => void) | null
  onGoDates: () => void
  onGoMembers: () => void
  onInquiry: () => void
  isCustomHoliday?: (date: string) => boolean
}

export function GroupOverviewTab(props: GroupOverviewTabProps) {
  const {
    group, title, imageUrl, playerRange, scenarioData, scenarioUrl, table, phase, inviteCap, preferredStores, linkedReservation,
    bookingSummary, copied, onCopyInvite, onEditStore, onGoDates, onGoMembers, onInquiry, isCustomHoliday,
  } = props
  const info = scenarioData?.scenario ?? null
  const confirmed = group.confirmed_performance
  const venue = phase === 'confirmed' ? findStoreByName(scenarioData?.stores ?? [], confirmed?.store_name) : null
  const people = info?.playerMax ?? playerRange.max
  const candidates = phase === 'requested'
    ? (linkedReservation?.candidates ?? []).filter(c => c.date).map(c => ({ date: c.date as string, startTime: c.startTime ?? '' }))
    : table.rows.filter(r => !r.rejected).map(r => ({ date: r.date, startTime: r.startTime }))
  const price = priceSummary({
    phase,
    fee: info?.participationFee ?? null,
    costs: info?.participationCosts ?? [],
    people,
    candidates,
    confirmed: confirmed?.date ? { date: confirmed.date, startTime: confirmed.start_time ?? '' } : null,
    savedPerPerson: group.per_person_price ?? null,
    savedTotal: group.total_price ?? null,
    isCustomHoliday,
  })
  // キャンセルポリシーは店舗ごと。確定した店舗、または希望店舗が 1 つならその店舗
  const policyStoreId = venue?.id ?? (preferredStores.length === 1 ? preferredStores[0].id : null)

  return (
    <div className="flex flex-col gap-3" data-testid="group-overview-tab">
      <ScenarioAboutSection title={title} imageUrl={imageUrl} playerRange={playerRange} info={info} scenarioUrl={scenarioUrl} />
      <CharactersSection characters={publicCharacters(info ? info.characters : group.scenario_masters?.characters)} />
      <ScheduleVenueSection
        phase={phase}
        table={table}
        preferredStoreNames={preferredStores.map(s => s.name)}
        linkedReservation={linkedReservation}
        confirmed={confirmed}
        venueAddress={venue?.address ?? null}
        onEditStore={phase === 'pre_request' ? onEditStore : null}
        onGoDates={onGoDates}
      />
      <MembersSummarySection table={table} inviteCap={inviteCap} copied={copied} onCopyInvite={onCopyInvite} onGoMembers={onGoMembers} />
      <PriceSection price={price} phase={phase} />
      <OverviewSection label="店舗とのやりとり" testId="overview-booking" title="店舗とのやりとり">
        {phase === 'pre_request' ? (
          <p className="text-sm text-muted-foreground leading-snug">
            まだ店舗へ申し込んでいません。日程が決まったら、主催者が「この日で申し込む」から申し込めます。申込後はここに申込日・店舗の返事・予約番号を出します。
          </p>
        ) : bookingSummary}
      </OverviewSection>
      <NoticeSection
        orgSlug={scenarioData?.orgSlug ?? null}
        scenarioMasterId={group.scenario_master_id}
        storeId={policyStoreId}
        hasPreReading={info?.hasPreReading ?? false}
        onInquiry={onInquiry}
      />
    </div>
  )
}
