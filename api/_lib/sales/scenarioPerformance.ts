// api/sales.ts の 'handleScenarioPerformance' ハンドラを切り出したもの（整備 Phase 3、#774）。ロジックの変更なし。
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { isInternalLicenseReportablePerformance } from '../../../src/lib/licensePerformance.js'
import { getStartEnd, getStoreIds, SCHEDULE_EVENT_SALES_SELECT_FIELDS } from '../sales/common.js'
import type { ScheduleEvent } from '../sales/types.js'

// ─── シナリオ別公演数 (getScenarioPerformance 相当) ─────────────────────────
export async function handleScenarioPerformance(req: VercelRequest, res: VercelResponse, orgId: string) {
  const range = getStartEnd(req)
  if (!range) return res.status(400).json({ error: 'start / end クエリパラメータが必要です' })
  const { start, end } = range
  const storeIds = getStoreIds(req)
  const licenseReportableOnly = req.query.license_reportable === 'true' || req.query.license_reportable === '1'

  let query = db!
    .from('schedule_events')
    .select(SCHEDULE_EVENT_SALES_SELECT_FIELDS)
    .eq('organization_id', orgId)
    .gte('date', start)
    .lte('date', end)
    .eq('is_cancelled', false)

  if (storeIds && storeIds.length > 0) {
    query = query.in('store_id', storeIds)
  }

  const { data: events, error } = await query

  if (error) {
    console.error('[sales] scenario-performance events error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  if (!events || events.length === 0) {
    return res.status(200).json([])
  }

  const { data: scenarios, error: scenariosError } = await db!
    .from('organization_scenarios_with_master')
    .select('id, title, author, license_amount, gm_test_license_amount, gm_costs')
    .eq('organization_id', orgId)

  if (scenariosError) {
    console.error('[sales] scenario-performance scenarios error:', scenariosError)
  }

  type Scenario = { id: string; title: string; author: string | null }
  const scenarioMap = new Map<string, Scenario>()
  ;(scenarios as Scenario[] | null | undefined)?.forEach(s => {
    scenarioMap.set(s.title, s)
  })

  const performanceMap = new Map<string, {
    id: string
    title: string
    author: string | null
    category: 'open' | 'gmtest'
    events: number
    stores: Set<string>
  }>()

  ;(events as ScheduleEvent[]).forEach(event => {
    let scenarioInfo: Scenario | null = null
    const scenarioKey = event.scenario_master_id
    if (scenarioKey && scenarios) {
      const found = (scenarios as Scenario[]).find(s => s.id === scenarioKey)
      scenarioInfo = found ?? null
    } else if (event.scenario) {
      scenarioInfo = scenarioMap.get(event.scenario) ?? null
    }

    if (!scenarioInfo && event.scenario) {
      scenarioInfo = {
        id: event.scenario,
        title: event.scenario,
        author: '不明',
      }
    }

    if (scenarioInfo) {
      if (
        licenseReportableOnly
        && !isInternalLicenseReportablePerformance({
          category: event.category,
          // 判定は管理用接頭辞を保持する schedule_events.scenario を使う。
          // scenario_master_id 紐付け時の scenarioInfo.title はマスタ正式名で接頭辞が消える。
          scenarioTitle: event.scenario,
        })
      ) return

      const category = event.category || 'open'
      const isGMTest = category === 'gmtest'
      const key = isGMTest ? `${scenarioInfo.id}_gmtest` : scenarioInfo.id

      if (performanceMap.has(key)) {
        const existing = performanceMap.get(key)!
        existing.events += 1
        if (event.venue) {
          existing.stores.add(event.venue)
        }
      } else {
        performanceMap.set(key, {
          id: scenarioInfo.id,
          title: scenarioInfo.title,
          author: scenarioInfo.author,
          category: isGMTest ? 'gmtest' : 'open',
          events: 1,
          stores: new Set(event.venue ? [event.venue] : []),
        })
      }
    }
  })

  const result = Array.from(performanceMap.values()).map(item => ({
    ...item,
    stores: Array.from(item.stores),
  }))

  return res.status(200).json(result)
}
