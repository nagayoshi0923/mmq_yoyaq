/**
 * 予約確認画面のキャンセル規定の要点（点検 20・34）。
 * 予約する公演の店舗の規定から「いつまで無料で取消できるか」と料金の段を作り、
 * 開演までその時間を切っていれば「マイページから取消できない」注意を出す。
 */
import { useQuery } from '@tanstack/react-query'
import { fetchPublicCancellationTerms } from '@/lib/publicCancellationPolicy'
import {
  cancellationSummaryText,
  formatDeadline,
  freeSelfCancelDeadline,
  freeSelfCancelHours,
  hoursBeforeLabel,
  isInsideNoFreeCancelWindow,
} from '@/lib/cancellationSummary'
import { parseJstPerformanceStart } from '@/lib/cancellationPolicy'

export interface BookingCancellationTerms {
  /** 例「公演の48時間前まで無料で取消できます（マイページから）。それ以降のキャンセル料: …」 */
  summary: string
  /** 例「10/27(火) 19:00」 */
  freeDeadlineLabel: string
  /** 例「48時間前」 */
  freeHoursLabel: string
  /** 開演まで無料の期限を切っている（予約後はマイページから取消できない） */
  insideNoFreeCancelWindow: boolean
  /** 人数を変更できる期限（例「24時間前」）。規定に無ければ null */
  changeDeadlineLabel: string | null
}

/**
 * 規定の読込状態（公開前検証 P1）。
 * - loading: 取得中
 * - ready: 店舗の規定を読めた（terms あり）
 * - error: 取得に失敗した／開演日時を解釈できない
 * - fallback: 店舗の規定を読めず既定値しか無い（既定値で案内しない）
 */
export type BookingCancellationTermsStatus = 'loading' | 'ready' | 'error' | 'fallback'

export interface BookingCancellationTermsState {
  status: BookingCancellationTermsStatus
  /** status が ready のときだけ値を持つ */
  terms: BookingCancellationTerms | null
  /** 再取得（error / fallback のときの「再読み込み」） */
  retry: () => void
  /** 再取得中 */
  isRetrying: boolean
}

/**
 * 「予約を確定する」を押せるか（キャンセル規定の観点だけ）。
 * 規定を読めた（ready）ときだけ許可し、48 時間以内の公演は同意のチェックが必要（#1063）。
 */
export function cancellationTermsGate(
  status: BookingCancellationTermsStatus,
  terms: BookingCancellationTerms | null,
  lateCancelAgreed: boolean,
): { canSubmit: boolean; needsLateCancelAgreement: boolean; message: string | null } {
  if (status === 'loading') {
    return { canSubmit: false, needsLateCancelAgreement: false, message: 'キャンセル規定を読み込んでいます…' }
  }
  if (status !== 'ready' || !terms) {
    return { canSubmit: false, needsLateCancelAgreement: false, message: '店舗のキャンセル規定を取得できませんでした。再読み込みしてください' }
  }
  const needsLateCancelAgreement = terms.insideNoFreeCancelWindow && !lateCancelAgreed
  return {
    canSubmit: !needsLateCancelAgreement,
    needsLateCancelAgreement,
    message: needsLateCancelAgreement ? 'キャンセル料についての確認にチェックを入れてください' : null,
  }
}

export function useBookingCancellationTerms(input: {
  organizationSlug?: string
  storeId?: string
  eventId: string
  eventDate: string
  startTime: string
}): BookingCancellationTermsState {
  const { data, isError, refetch, isFetching } = useQuery({
    queryKey: ['booking-cancellation-terms', input.organizationSlug ?? '', input.storeId ?? '', input.eventId],
    queryFn: () => fetchPublicCancellationTerms({
      organizationSlug: input.organizationSlug,
      storeId: input.storeId,
      eventId: input.eventId,
    }),
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const retry = () => { void refetch() }
  const base = { retry, isRetrying: isFetching }
  if (!data) {
    if (isError) return { ...base, status: 'error', terms: null }
    return { ...base, status: 'loading', terms: null }
  }
  if (data.isFallback) return { ...base, status: 'fallback', terms: null }
  let start: Date
  try {
    start = parseJstPerformanceStart(input.eventDate, input.startTime.slice(0, 5))
  } catch {
    return { ...base, status: 'error', terms: null }
  }
  const freeHours = freeSelfCancelHours(data.deadlineHours, data.fees)
  return {
    ...base,
    status: 'ready',
    terms: {
      summary: cancellationSummaryText(data.deadlineHours, data.fees),
      freeDeadlineLabel: formatDeadline(freeSelfCancelDeadline(start, freeHours)),
      freeHoursLabel: hoursBeforeLabel(freeHours),
      insideNoFreeCancelWindow: isInsideNoFreeCancelWindow(start, new Date(), freeHours),
      changeDeadlineLabel: data.changeDeadlineHours != null ? hoursBeforeLabel(data.changeDeadlineHours) : null,
    },
  }
}
