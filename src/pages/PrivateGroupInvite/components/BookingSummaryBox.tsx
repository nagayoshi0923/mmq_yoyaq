/**
 * グループ画面の右パネル（スマホは「日程・進捗」シート）の「申込内容」の箱。状態で中身が変わる。
 * - 申込前: 出さない（既存の「候補日程」と回答状況がその役）
 * - 返事待ち: 候補日・希望店舗・人数・予約番号・申込日時・「申込を取り下げる」（主催者のみ）
 * - 確定後: 確定日時・会場・人数・予約番号・「キャンセル」（キャンセル規定つき、主催者のみ）
 * 取り下げ・キャンセルの処理はマイページの「操作」メニューと同じ部品（usePrivateBookingActions）を呼ぶ。
 * embedded: 概要タブの「店舗とのやりとり」の中に置く形。日時・会場・候補日・希望店舗は「日程と場所」に出すので省く（点検 44 番）。
 */
import { useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { formatJstDateJa, formatJstMonthDay, formatJstTime } from '@/utils/jstDate'
import type { PrivateGroupLinkedReservation } from '@/lib/privateGroupRead'
import type { PrivateBookingPhase } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingMenu'
import type { PrivateBookingActions } from '@/pages/MyPage/components/PrivateBookingCards/usePrivateBookingActions'

interface BookingSummaryBoxProps {
  phase: PrivateBookingPhase
  linkedReservation: PrivateGroupLinkedReservation | null
  preferredStoreNames: string[]
  memberCount: number
  confirmedPerformance: { date?: string | null; start_time?: string | null; end_time?: string | null; store_name?: string | null } | null | undefined
  isOrganizer: boolean
  actions: PrivateBookingActions
  embedded?: boolean
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-border last:border-b-0">
      <dt className="w-16 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="flex-1 min-w-0 text-xs text-foreground break-words">{children}</dd>
    </div>
  )
}

const hhmm = (time?: string | null) => (time ? time.slice(0, 5) : '')

export function BookingSummaryBox({ phase, linkedReservation, preferredStoreNames, memberCount, confirmedPerformance, isOrganizer, actions, embedded = false }: BookingSummaryBoxProps) {
  const { preparePolicy } = actions
  useEffect(() => {
    if (isOrganizer && phase === 'confirmed') preparePolicy()
  }, [isOrganizer, phase, preparePolicy])

  if (phase === 'pre_request') return null
  const r = linkedReservation
  const people = r?.participant_count ?? memberCount
  const cancel = actions.cancelAvailability

  const rows = (
    <dl>
      {phase === 'requested' ? (
        <>
          <Row label="状態">店舗の返事待ち</Row>
          {!embedded && (
            <>
              <Row label="候補日">
                {r?.candidates.length ? (
                  <ul className="space-y-0.5">
                    {r.candidates.map((c, i) => (
                      <li key={`${c.date}-${i}`}>
                        {c.date ? formatJstMonthDay(c.date, true) : '-'} {hhmm(c.startTime)}{c.endTime ? `〜${hhmm(c.endTime)}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : '—'}
              </Row>
              <Row label="希望店舗">{(r?.requested_store_names.length ? r.requested_store_names : preferredStoreNames).join('、') || '—'}</Row>
            </>
          )}
        </>
      ) : (
        <>
          <Row label="状態">確定</Row>
          {!embedded && (
            <>
              <Row label="日時">
                {confirmedPerformance?.date
                  ? `${formatJstMonthDay(confirmedPerformance.date, true)} ${hhmm(confirmedPerformance.start_time)}${confirmedPerformance.end_time ? `〜${hhmm(confirmedPerformance.end_time)}` : ''}`
                  : '—'}
              </Row>
              <Row label="会場">{confirmedPerformance?.store_name || '—'}</Row>
            </>
          )}
        </>
      )}
      <Row label="人数">{people}名</Row>
      <Row label="予約番号"><span className="tabular-nums">{r?.reservation_number || '—'}</span></Row>
      {phase === 'requested' && r?.requested_at && (
        <Row label="申込日時">{formatJstDateJa(r.requested_at)} {formatJstTime(r.requested_at)}</Row>
      )}
    </dl>
  )

  const Wrapper = embedded ? 'div' : 'section'
  return (
    <Wrapper className={embedded ? undefined : 'bg-white rounded-lg p-3 border'} aria-label={embedded ? undefined : '申込内容'} data-testid="booking-summary-box">
      {!embedded && <h3 className="font-semibold text-sm mb-1">申込内容</h3>}
      {rows}
      {isOrganizer && phase === 'requested' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => actions.requestDanger('withdraw')}
        >
          申込を取り下げる
        </Button>
      )}
      {isOrganizer && phase === 'confirmed' && (
        <div className="mt-3 space-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            disabled={!cancel.allowed}
            onClick={() => actions.requestDanger('cancel')}
          >
            {cancel.loading ? 'キャンセル（確認中…）' : 'キャンセル'}
          </Button>
          {cancel.reason && <p className="text-xs text-muted-foreground">{cancel.reason}</p>}
        </div>
      )}
    </Wrapper>
  )
}
