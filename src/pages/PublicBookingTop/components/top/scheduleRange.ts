import { addJstDays } from '@/utils/jstDate'

/** 公演スケジュールの期間の終わり（1 回目は今日から 2 週間、「もっと先」を押すごとに 30 日ずつ足す） */
export function scheduleUntil(today: string, windows: number): string {
  return addJstDays(today, 13 + (windows - 1) * 30)
}
