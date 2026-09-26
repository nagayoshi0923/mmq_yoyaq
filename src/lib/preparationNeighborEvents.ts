import { scheduleApi } from '@/lib/api'
import { addJstDays } from '@/utils/jstDate'
import type { ScheduleEvent } from '@/types/schedule'

/** 月表示の端でも、前後の公演を最新状態で検査する。 */
export async function loadPreparationNeighborEvents(date: string): Promise<ScheduleEvent[]> {
  const rows = await scheduleApi.getByDateRange(addJstDays(date, -2), addJstDays(date, 2))
  return rows.map(row => ({ ...row, venue: row.store_id || row.venue, gms: [] })) as ScheduleEvent[]
}
