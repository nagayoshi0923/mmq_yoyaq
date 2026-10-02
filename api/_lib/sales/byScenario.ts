// api/sales.ts の 'handleByScenario' ハンドラを切り出したもの（整備 Phase 3、#774）。ロジックの変更なし。
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { getStartEnd, STORE_AND_SCENARIO_NESTED_SELECT } from '../sales/common.js'

// ─── シナリオ別売上 (getSalesByScenario 相当) ────────────────────────────────
export async function handleByScenario(req: VercelRequest, res: VercelResponse, orgId: string) {
  const range = getStartEnd(req)
  if (!range) return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  const { start, end } = range

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('schedule_events')
    .select(STORE_AND_SCENARIO_NESTED_SELECT)
    .eq('organization_id', orgId)
    .gte('date', start)
    .lte('date', end)
    .eq('is_cancelled', false)

  if (error) {
    console.error('[sales] by-scenario error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}
