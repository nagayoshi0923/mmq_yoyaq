/**
 * 「日程と場所」: 希望店舗はこの欄だけに出す（点検 44 番: 以前は概要の上と申込内容の箱の 2 か所に出ていた）。
 * - 申込前: 候補日の件数・最有力の日（○△ の数）・回答した人数、希望店舗（主催者は編集）、「日程タブへ ›」
 * - 返事待ち: 申し込んだ候補日と希望店舗
 * - 確定後: 開催日時・集合時刻（開演 10 分前）・店舗名・住所、「カレンダーに登録」「地図を開く」のボタン
 */
import type { ReactNode } from 'react'
import { formatJstMonthDay } from '@/utils/jstDate'
import type { PrivateGroupLinkedReservation } from '@/lib/privateGroupRead'
import type { PrivateBookingPhase } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingMenu'
import { rowShortLabel, rowTally, type AnswerTable } from '../groupPageModel'
import { meetingTime } from '../overviewModel'
import { ScheduleActions } from '@/components/patterns/schedule'
import type { CalendarEventInput } from '@/lib/calendarEvent'
import { AsideLink, OverviewSection } from './OverviewSection'

interface ScheduleVenueSectionProps {
  phase: PrivateBookingPhase
  table: AnswerTable
  preferredStoreNames: string[]
  linkedReservation: PrivateGroupLinkedReservation | null
  confirmed: { date?: string | null; start_time?: string | null; end_time?: string | null; store_name?: string | null } | null | undefined
  /** 確定した店舗の住所（公開情報。分からなければ null） */
  venueAddress: string | null
  /** 「カレンダーに登録」の中身（確定後だけ） */
  calendarEvent?: CalendarEventInput | null
  /** 希望店舗の編集（主催者で、店舗の返事待ちでないときだけ） */
  onEditStore: (() => void) | null
  /** 日程タブへ（公演後は日程タブが無いので null） */
  onGoDates: (() => void) | null
}

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '')

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <dt className="w-16 shrink-0 text-xs text-muted-foreground pt-0.5">{label}</dt>
      <dd className="flex-1 min-w-0 break-words">{children}</dd>
    </div>
  )
}

export function ScheduleVenueSection({ phase, table, preferredStoreNames, linkedReservation, confirmed, venueAddress, calendarEvent = null, onEditStore, onGoDates }: ScheduleVenueSectionProps) {
  const aside = onGoDates ? <AsideLink onClick={onGoDates} testId="overview-go-dates">日程タブへ ›</AsideLink> : null

  if (phase === 'confirmed' && confirmed?.date) {
    const meet = meetingTime(confirmed.start_time)
    return (
      <OverviewSection label="日程と場所" testId="overview-schedule" title="日程と場所" aside={aside}>
        <dl>
          <Line label="開催">
            <span className="font-bold">{formatJstMonthDay(confirmed.date, true)} {hhmm(confirmed.start_time)}{confirmed.end_time ? `〜${hhmm(confirmed.end_time)}` : ''}</span>
          </Line>
          {meet && <Line label="集合">{meet}（開演 10 分前）</Line>}
          <Line label="店舗">{confirmed.store_name || '—'}</Line>
          {venueAddress && <Line label="住所">{venueAddress}</Line>}
        </dl>
        <ScheduleActions event={calendarEvent} address={venueAddress} stretch className="mt-2" testId="overview-schedule-actions" />
      </OverviewSection>
    )
  }

  if (phase === 'requested' && linkedReservation) {
    const stores = linkedReservation.requested_store_names.length ? linkedReservation.requested_store_names : preferredStoreNames
    return (
      <OverviewSection label="日程と場所" testId="overview-schedule" title="日程と場所" aside={aside}>
        <dl>
          <Line label="申込んだ候補日">
            {linkedReservation.candidates.length ? (
              <ul className="space-y-0.5">
                {linkedReservation.candidates.map((c, i) => (
                  <li key={`${c.date}-${i}`}>{c.date ? formatJstMonthDay(c.date, true) : '—'} {hhmm(c.startTime)}{c.endTime ? `〜${hhmm(c.endTime)}` : ''}</li>
                ))}
              </ul>
            ) : '—'}
          </Line>
          <Line label="希望店舗">{stores.join('・') || '—'}</Line>
        </dl>
        <p className="mt-1 text-xs text-muted-foreground">店舗が日時と会場を決めると、ここに開催日時・住所・集合時刻を出します。</p>
      </OverviewSection>
    )
  }

  const rows = table.rows.filter(r => !r.rejected)
  const best = rows.find(r => r.id === table.bestRowId) ?? null
  return (
    <OverviewSection label="日程と場所" testId="overview-schedule" title="日程と場所" aside={aside}>
      <p className="text-sm">
        {rows.length === 0 ? '候補日はまだありません' : (
          <>
            候補日 {rows.length} 件
            {best && <>・最有力 <strong>{rowShortLabel(best)}</strong>（{rowTally(best)}）</>}
          </>
        )}
      </p>
      {rows.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{table.memberCount}人中 {table.respondedCount}人が回答済み</p>}
      <p className="mt-1.5 text-sm" data-testid="overview-preferred-stores">
        希望店舗: {preferredStoreNames.length > 0 ? preferredStoreNames.join('・') : '未設定'}
        {onEditStore && <button type="button" onClick={onEditStore} className="ml-2 text-xs text-violet-700 hover:underline">編集</button>}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">確定後はここに開催日時・店舗の住所・集合時刻（開演 10 分前）・地図を出します。</p>
    </OverviewSection>
  )
}
