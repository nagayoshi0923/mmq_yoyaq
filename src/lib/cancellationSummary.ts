/**
 * お客様向けのキャンセル規定の要点（予約確認画面・予約詳細・取消確認で共通）。
 * 「いつまで無料で取消できるか」「その後は何%か」を、マイページの取消判定
 * （evaluateCustomerSelfCancel: 料率 0% かつ受付期限前）と同じ考え方で出す。
 */
import { DEFAULT_OPEN_CANCEL_DEADLINE_HOURS } from '@/constants/cancellationPolicyDefaults'
import type { CancellationFeeRule } from '@/types'
import { formatJstMonthDay, formatJstTime } from '@/utils/jstDate'

const HOUR_MS = 3_600_000

/** 「48時間前」「開演時刻」 */
export function hoursBeforeLabel(hours: number): string {
  if (hours <= 0) return '開演時刻'
  if (hours >= 72 && hours % 24 === 0) return `${hours / 24}日前`
  return `${hours}時間前`
}

/**
 * 無料で（マイページから）取消できるのは公演の何時間前まで。
 * 受付期限と「料金がかかり始める時刻」の遅くない方。期限 0 は旧運用なので既定値に読み替える。
 */
export function freeSelfCancelHours(
  deadlineHours: number | null | undefined,
  fees: readonly CancellationFeeRule[] | null | undefined,
): number {
  const base = deadlineHours != null && deadlineHours > 0 ? deadlineHours : DEFAULT_OPEN_CANCEL_DEADLINE_HOURS
  const paid = (fees ?? [])
    .filter(fee => fee.hours_before >= 0 && fee.fee_percentage > 0)
    .map(fee => fee.hours_before)
  return Math.max(base, ...paid)
}

/** 無料で取消できる期限の時刻（開演 − freeHours） */
export function freeSelfCancelDeadline(performanceStart: Date, freeHours: number): Date {
  return new Date(performanceStart.getTime() - freeHours * HOUR_MS)
}

/** 「10/27(火) 19:00」 */
export function formatDeadline(at: Date): string {
  return `${formatJstMonthDay(at, true)} ${formatJstTime(at)}`
}

/** 「48時間前から 50%、24時間前から 100%、開演後・無断は 100%」。料金の段が無ければ空 */
export function feeStepsText(fees: readonly CancellationFeeRule[] | null | undefined): string {
  const steps = (fees ?? [])
    .filter(fee => fee.hours_before >= 0 && fee.fee_percentage > 0)
    .sort((a, b) => b.hours_before - a.hours_before)
  const parts = steps.map(fee => `${hoursBeforeLabel(fee.hours_before)}から ${fee.fee_percentage}%`)
  const noShow = (fees ?? []).find(fee => fee.hours_before < 0 && fee.fee_percentage > 0)
  if (noShow) parts.push(`開演後・無断は ${noShow.fee_percentage}%`)
  return parts.join('、')
}

/** 予約確認画面の 1 行（例「公演の48時間前まで無料で取消できます。それ以降のキャンセル料: 48時間前から 50%、24時間前から 100%、開演後・無断は 100%」） */
export function cancellationSummaryText(
  deadlineHours: number | null | undefined,
  fees: readonly CancellationFeeRule[] | null | undefined,
): string {
  const free = freeSelfCancelHours(deadlineHours, fees)
  const steps = feeStepsText(fees)
  const head = `公演の${hoursBeforeLabel(free)}まで無料で取消できます（マイページから）。`
  return steps ? `${head}それ以降のキャンセル料: ${steps}。` : head
}

/** いま予約すると、もうマイページから無料で取消できない（開演まで freeHours を切っている） */
export function isInsideNoFreeCancelWindow(performanceStart: Date, now: Date, freeHours: number): boolean {
  return performanceStart.getTime() - now.getTime() <= freeHours * HOUR_MS
}
