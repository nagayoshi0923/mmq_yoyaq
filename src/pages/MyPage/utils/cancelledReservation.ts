/**
 * キャンセル済みサブタブの表示（仕様: docs/product-spec/マイページ改修_2026-10.md「キャンセル済みサブタブ」）
 *
 * - 理由ラベルは reservations.cancellation_reason で分ける。確信が持てないものは「キャンセル」
 * - 貸切の申込中の取り下げ・却下は候補日を日付として出さない（候補 1 件目が確定日に見えるため）
 */
import { PRIVATE_REQUEST_WITHDRAWN_REASON } from '@/lib/constants/reservationStatus'
import type { Reservation } from '@/types'

export type CancelKind = 'withdrawn' | 'store' | 'customer'

export const CANCEL_KIND_LABELS: Record<CancelKind, { label: string; color: string }> = {
  withdrawn: { label: '取り下げ', color: 'bg-muted text-muted-foreground' },
  store: { label: '店舗都合でキャンセル', color: 'bg-amber-100 text-amber-800' },
  customer: { label: 'キャンセル', color: 'bg-muted text-muted-foreground' },
}

/** 店舗の却下（reject_private_booking_with_notice が保存する理由） */
const STORE_REJECTION_REASON = '貸切リクエストを却下しました'

export function classifyCancellation(reason: string | null | undefined): CancelKind {
  const r = (reason ?? '').trim()
  if (r === PRIVATE_REQUEST_WITHDRAWN_REASON) return 'withdrawn'
  if (r.startsWith('お客様')) return 'customer'
  // 店舗の却下・人数未達や店舗判断による公演中止（スタッフ画面の既定文「…公演を中止させていただく…」を含む）
  if (r === STORE_REJECTION_REASON || r.includes('公演中止') || r.includes('公演を中止')) return 'store'
  return 'customer'
}

function candidateCount(reservation: Reservation): number {
  const cd = reservation.candidate_datetimes as { candidates?: unknown[] } | null | undefined
  return Array.isArray(cd?.candidates) ? cd!.candidates!.length : 0
}

/**
 * 日付欄の代わりに出す文言。日付を出してよいときは null。
 * 貸切で、取り下げ・却下、または公演に結び付く前（schedule_event_id なし）に取り消したものは日付を出さない。
 */
export function cancelledDateReplacement(reservation: Reservation, isPrivate: boolean): string | null {
  if (!isPrivate) return null
  const kind = classifyCancellation(reservation.cancellation_reason)
  const rejected = (reservation.cancellation_reason ?? '').trim() === STORE_REJECTION_REASON
  if (!reservation.schedule_event_id || kind === 'withdrawn' || rejected) {
    const n = candidateCount(reservation)
    return n > 0 ? `候補日 ${n} 件で申込中だったもの` : '日程確定前の申込'
  }
  return null
}
