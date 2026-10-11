/**
 * 貸切グループから店舗へ予約リクエストを送るときの判断（画面から切り出した純粋な関数）。
 * 画面（index.tsx の handleSubmitBooking）は、ここで決めた内容で通信と表示だけを行う。
 */
import { addJstDays, toJstYmd } from '@/utils/jstDate'
import { checkTimeOverlapWithPreparation } from '@/utils/eventOperationUtils'
import { getPrivateBookingCandidateBlockedState, type PrivateBookingBlockedSlotRow } from '@/lib/privateBookingBlockedSlotAvailability'
import { timeStrToMinutes } from '@/lib/privateBookingSlotAvailability'
import { getPrivateBookingDisplayEndTime, type ScenarioTimingFromDb } from '@/lib/privateBookingScenarioTime'

export interface BookingCandidate {
  id: string
  date: string
  time_slot: string
  start_time: string
  end_time: string
  status?: string | null
}

export interface AvailabilityEventRow {
  id: string
  date: string
  store_id: string
  start_time: string
  end_time: string
}

/** 申請に含める候補（選んだ順＝優先順のまま。却下済み・見つからない id は除く） */
export function selectBookableCandidates<T extends BookingCandidate>(candidates: T[] | undefined, orderedIds: ReadonlyArray<string>): T[] {
  return orderedIds
    .map(id => candidates?.find(cd => cd.id === id))
    .filter((cd): cd is T => Boolean(cd) && cd!.status !== 'rejected')
}

/** 締切日数を数値として読めたときだけ返す（読めないときは止めず、DB の確認に任せる） */
export function parseDeadlineDays(result: { data: unknown; error: unknown }): number | null {
  return !result.error && typeof result.data === 'number' && Number.isInteger(result.data) && result.data >= 0
    ? result.data
    : null
}

/** 受付締切（公演日の何日前まで）を過ぎた候補（#506） */
export function findPastDeadlineCandidates<T extends BookingCandidate>(candidates: T[], deadlineDays: number | null, now: Date = new Date()): T[] {
  const earliestDate = deadlineDays === null ? null : addJstDays(toJstYmd(now), deadlineDays)
  return earliestDate === null ? [] : candidates.filter((candidate) => candidate.date < earliestDate)
}

/** 締切を過ぎた候補を知らせる文 */
export function pastDeadlineMessage(candidates: BookingCandidate[], deadlineDays: number | null): string {
  const labels = candidates.map((candidate) => candidate.date.slice(5).replace('-', '/')).join('、')
  return `${labels} は貸切の受付締切（公演日の${deadlineDays}日前まで）を過ぎています。この日程を外して申し込んでください`
}

/**
 * どの希望店舗でも受けられない候補（受付停止中、または既存公演と準備時間込みで重なる）。
 * 時刻が読めない候補・公演は、受けられない側に倒す。
 */
export function findUnavailableCandidates<T extends BookingCandidate>(
  candidates: T[],
  requestedStoreIds: string[],
  blockedRows: PrivateBookingBlockedSlotRow[],
  eventRows: AvailabilityEventRow[],
  scenarioTiming: Pick<ScenarioTimingFromDb, 'preparation_minutes_by_event' | 'preparation_minutes_by_store'>,
): T[] {
  return candidates.filter((candidate) => {
    const blockedState = getPrivateBookingCandidateBlockedState(
      { date: candidate.date, timeSlot: candidate.time_slot },
      requestedStoreIds,
      blockedRows
    )
    const start = timeStrToMinutes(candidate.start_time)
    const end = timeStrToMinutes(candidate.end_time)
    if (start == null || end == null) return true
    return !blockedState.availableStoreIds.some((storeId) =>
      !eventRows.some((event) => {
        if (event.store_id !== storeId) return false
        const eventStart = timeStrToMinutes(event.start_time)
        const eventEnd = timeStrToMinutes(event.end_time)
        if (eventStart == null || eventEnd == null) return true
        return checkTimeOverlapWithPreparation(event.start_time, event.end_time, candidate.start_time, candidate.end_time, scenarioTiming.preparation_minutes_by_event?.[event.id] ?? 60, scenarioTiming.preparation_minutes_by_store?.[storeId] ?? 60, event.date, candidate.date).overlap
      })
    )
  })
}

/** 予約番号（YYMMDD-ランダム4文字） */
export function generateReservationNumber(now: Date = new Date(), random: () => number = Math.random): string {
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
  const randomStr = random().toString(36).substring(2, 6).toUpperCase()
  return `${dateStr}-${randomStr}`
}

/** 申込に保存する候補日時（並び＝優先順。order は 1 から。終了は営業枠ではなくシナリオ公演時間）と希望店舗 */
export function buildCandidateDatetimes(
  candidates: BookingCandidate[],
  stores: Array<{ id: string; name: string }>,
  scenarioTiming: ScenarioTimingFromDb,
  isCustomHoliday: (d: string) => boolean,
) {
  return {
    candidates: candidates.map((cd, index) => ({
      order: index + 1,
      date: cd.date,
      timeSlot: cd.time_slot,
      startTime: cd.start_time,
      endTime: getPrivateBookingDisplayEndTime(cd.start_time, cd.date, scenarioTiming, isCustomHoliday),
      status: 'pending'
    })),
    requestedStores: stores.map(store => ({
      storeId: store.id,
      storeName: store.name,
      storeShortName: store.name
    }))
  }
}

/** 予約リクエスト作成の失敗を、お客様向けの文にする */
export function bookingRequestErrorMessage(rpcError: { code?: string; message?: string }): string {
  if (rpcError.code === 'P0001') return 'シナリオが見つかりません'
  if (rpcError.code === 'P0025') return '参加人数が作品の対応人数の範囲外です。作品の人数をご確認ください'
  if (rpcError.code === 'P0051') return '作品の対応人数が未設定です。店舗へお問い合わせください'
  if (rpcError.code === 'P0026') return '組織情報が見つかりません'
  if (rpcError.code === 'P0030' || (rpcError.message && rpcError.message.includes('conflict'))) return '候補日時に既存の公演との競合があります。日時と希望店舗を再選択してください。'
  if (rpcError.code === 'P0040') return '候補日時が現在受付停止中です。日時と希望店舗を再選択してください。'
  if (rpcError.code === 'P0041' || rpcError.code === 'P0042') return '候補日時または希望店舗が正しくありません。再選択してください。'
  if (rpcError.code === 'P0045') return '貸切の受付締切を過ぎた候補日があります。その日程を外して、もう一度お試しください。'
  if (rpcError.code === 'P0047') return '貸切リクエストはグループから申し込んでください。画面を開き直してから、もう一度お試しください。'
  if (rpcError.code === 'P0044') return 'この作品は現在貸切リクエストを受け付けていません'
  if (rpcError.code === 'P0054') return '作品の公演期間外の候補日があります。その日程を外して、もう一度お試しください。'
  if (rpcError.message) return rpcError.message
  return '貸切リクエストの送信に失敗しました'
}
