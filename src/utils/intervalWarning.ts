/**
 * 同日同店舗で連続する公演の間隔が標準インターバル (60 分) 未満の公演 ID を集計する。
 *
 * - キャンセル済み公演は除外
 * - 営業日内で公演を start_time 順に並べ、隣接ペアの (next.start - cur.end) を計算
 * - 60 分未満なら両端の公演 ID を warning セットに追加
 *
 * スケジュールセル左ボーダーの「準備時間不足」赤警告と、UI の警告カウントで使用する。
 */
import { PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES } from '@/lib/privateBookingScenarioTime'

type EventLike = {
  id: string
  date: string
  venue: string
  start_time: string
  end_time: string
  is_cancelled?: boolean
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function computeIntervalWarningEventIds(events: EventLike[]): Set<string> {
  const groups = new Map<string, EventLike[]>()
  for (const e of events) {
    if (e.is_cancelled) continue
    if (!e.date || !e.venue || !e.start_time || !e.end_time) continue
    const key = `${e.date}__${e.venue}`
    const list = groups.get(key)
    if (list) list.push(e)
    else groups.set(key, [e])
  }

  const warnings = new Set<string>()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i]
      const nxt = list[i + 1]
      const gap = timeToMinutes(nxt.start_time) - timeToMinutes(cur.end_time)
      if (gap < PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES) {
        warnings.add(cur.id)
        warnings.add(nxt.id)
      }
    }
  }
  return warnings
}
