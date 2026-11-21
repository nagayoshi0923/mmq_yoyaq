import { formatDateJST } from '@/utils/dateUtils'

/**
 * 予約番号（YYMMDD-ランダム4文字）。日付は日本時間の今日（2026-11-22 えいきち「日本時間に統一」）。
 * 以前は toISOString（世界標準時）だったため、朝9時前の予約が前日の日付になっていた。
 */
export function generateReservationNumber(now: Date = new Date(), random: () => number = Math.random): string {
  const dateStr = formatDateJST(now).slice(2).replace(/-/g, '')
  const randomStr = random().toString(36).substring(2, 6).toUpperCase()
  return `${dateStr}-${randomStr}`
}
