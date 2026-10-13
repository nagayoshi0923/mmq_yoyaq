/**
 * 予約完了メール（既定文面）に入れる「キャンセル期限・当日の支払い・マイページ」の案内（点検 2026-10-11 の 31）。
 * 無料で取り消せる期限の考え方は src/lib/cancellationSummary.ts（freeSelfCancelHours）と同じ:
 * 受付期限と「料金がかかり始める時刻」の遅くない方。受付期限 0 は旧運用なので既定 48 時間に読み替える。
 * 店舗が独自の文面を設定している場合は使わない（{cancel_deadline}・{payment_note}・{mypage_url} を書いたときだけ差し込まれる）。
 */

export interface GuideFeeRule {
  hours_before: number
  fee_percentage: number
}

const DEFAULT_DEADLINE_HOURS = 48
const DEFAULT_PAYMENT_DESCRIPTION = 'ご来店時にお支払いください'
const HOUR_MS = 3_600_000
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function freeCancelHours(deadlineHours: unknown, fees: unknown): number {
  const base = typeof deadlineHours === 'number' && Number.isFinite(deadlineHours) && deadlineHours > 0
    ? deadlineHours
    : DEFAULT_DEADLINE_HOURS
  const paid = (Array.isArray(fees) ? fees as GuideFeeRule[] : [])
    .filter(fee => typeof fee?.hours_before === 'number' && fee.hours_before >= 0 && Number(fee.fee_percentage) > 0)
    .map(fee => fee.hours_before)
  return Math.max(base, ...paid)
}

/** 公演の開始時刻（日本時間）。日付・時刻が読めなければ null */
export function performanceStartJst(eventDate: string, startTime: string): Date | null {
  const date = (eventDate || '').slice(0, 10)
  const time = (startTime || '').slice(0, 5)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const at = new Date(`${date}T${time}:00+09:00`)
  return Number.isNaN(at.getTime()) ? null : at
}

/** 「2026年10月20日(火) 13:00」（日本時間） */
export function formatJstDateTime(at: Date): string {
  const jst = new Date(at.getTime() + 9 * HOUR_MS)
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mm = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日(${WEEKDAYS[jst.getUTCDay()]}) ${hh}:${mm}`
}

export interface BookingGuideInput {
  eventDate: string
  startTime: string
  deadlineHours: unknown
  fees: unknown
  paymentDescription?: string | null
  siteUrl?: string | null
  now?: Date
}

export interface BookingGuide {
  /** 「2026年10月20日(火) 13:00 まで、マイページから無料で取り消せます。」など */
  cancelDeadline: string
  /** 当日の支払いの案内 */
  paymentNote: string
  mypageUrl: string
}

export function buildBookingGuide(input: BookingGuideInput): BookingGuide {
  const base = (input.siteUrl || 'https://mmq.game').replace(/\/$/, '')
  const mypageUrl = `${base}/mypage`
  const start = performanceStartJst(input.eventDate, input.startTime)
  let cancelDeadline: string
  if (!start) {
    cancelDeadline = '無料で取り消せる期限は、マイページの予約詳細でご確認ください。'
  } else {
    const deadline = new Date(start.getTime() - freeCancelHours(input.deadlineHours, input.fees) * HOUR_MS)
    const now = input.now ?? new Date()
    cancelDeadline = deadline.getTime() > now.getTime()
      ? `${formatJstDateTime(deadline)} まで、マイページから無料で取り消せます。それ以降の取消はキャンセル料がかかります。`
      : 'このご予約は、無料で取り消せる期限をすでに過ぎています。取消にはキャンセル料がかかります。'
  }
  const custom = input.paymentDescription?.trim()
  const paymentNote = custom && custom !== DEFAULT_PAYMENT_DESCRIPTION
    ? `${custom}（金額は税込です）`
    : '当日、店舗でお支払いください（金額は税込です。現金またはカードがご利用いただけます）。'
  return { cancelDeadline, paymentNote, mypageUrl }
}
