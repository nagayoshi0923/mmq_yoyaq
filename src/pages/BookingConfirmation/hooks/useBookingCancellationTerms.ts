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

export function useBookingCancellationTerms(input: {
  organizationSlug?: string
  storeId?: string
  eventId: string
  eventDate: string
  startTime: string
}): BookingCancellationTerms | null {
  const { data } = useQuery({
    queryKey: ['booking-cancellation-terms', input.organizationSlug ?? '', input.storeId ?? '', input.eventId],
    queryFn: () => fetchPublicCancellationTerms({
      organizationSlug: input.organizationSlug,
      storeId: input.storeId,
      eventId: input.eventId,
    }),
    staleTime: 5 * 60_000,
  })
  if (!data) return null
  let start: Date
  try {
    start = parseJstPerformanceStart(input.eventDate, input.startTime.slice(0, 5))
  } catch {
    return null
  }
  const freeHours = freeSelfCancelHours(data.deadlineHours, data.fees)
  return {
    summary: cancellationSummaryText(data.deadlineHours, data.fees),
    freeDeadlineLabel: formatDeadline(freeSelfCancelDeadline(start, freeHours)),
    freeHoursLabel: hoursBeforeLabel(freeHours),
    insideNoFreeCancelWindow: isInsideNoFreeCancelWindow(start, new Date(), freeHours),
    changeDeadlineLabel: data.changeDeadlineHours != null ? hoursBeforeLabel(data.changeDeadlineHours) : null,
  }
}
