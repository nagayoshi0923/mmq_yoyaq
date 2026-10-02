// api/sales.ts の 'handleOpenEventAnalysis' ハンドラを切り出したもの（整備 Phase 3、#774）。ロジックの変更なし。
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { getStartEnd, getStoreIds } from '../sales/common.js'

// ─── オープン公演分析 (getOpenEventAnalysis 相当) ───────────────────────────
export async function handleOpenEventAnalysis(req: VercelRequest, res: VercelResponse, orgId: string) {
  const range = getStartEnd(req)
  if (!range) return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  const { start, end } = range
  const storeIds = getStoreIds(req)
  const includeGmTest = req.query.include_gm_test === 'true' || req.query.include_gm_test === '1'

  const categories = includeGmTest ? ['open', 'gmtest'] : ['open']

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let eventsQuery: any = (db as any)
    .from('schedule_events')
    .select('id, date, start_time, scenario, scenario_master_id, capacity, max_participants, current_participants, is_cancelled, created_at, store_id, category')
    .eq('organization_id', orgId)
    .in('category', categories)
    .gte('date', start)
    .lte('date', end)

  if (storeIds && storeIds.length > 0) {
    eventsQuery = eventsQuery.in('store_id', storeIds)
  }

  const { data: events, error: eventsError } = await eventsQuery.order('date', { ascending: true })

  if (eventsError) {
    console.error('[sales] open-event-analysis events error:', eventsError)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: eventsError.message })
  }
  if (!events || events.length === 0) return res.status(200).json({ events: [], reservations: [] })

  const eventIds = (events as { id: string }[]).map(e => e.id)
  const BATCH_SIZE = 100
  const allReservations: Array<{ id: string; schedule_event_id: string; created_at: string; participant_count: number | null; status: string }> = []

  for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
    const batchIds = eventIds.slice(i, i + BATCH_SIZE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: batch, error: batchError } = await (db as any)
      .from('reservations')
      .select('id, schedule_event_id, created_at, participant_count, status')
      .eq('organization_id', orgId)
      .in('schedule_event_id', batchIds)
      .neq('status', 'cancelled')

    if (batchError) {
      console.error('[sales] open-event-analysis reservations error:', batchError)
    } else if (batch) {
      allReservations.push(...batch)
    }
  }

  return res.status(200).json({ events, reservations: allReservations })
}
