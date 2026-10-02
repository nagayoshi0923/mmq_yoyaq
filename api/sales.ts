import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleSalaryReportData } from './_lib/salaryReportData.js'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError } from './_lib/auth.js'
import { setCors } from './_lib/sales/common.js'
import { handleByPeriod } from './_lib/sales/byPeriod.js'
import { handleByStore } from './_lib/sales/byStore.js'
import { handleByScenario } from './_lib/sales/byScenario.js'
import { handleAuthorPerformanceCount } from './_lib/sales/authorPerformanceCount.js'
import { handleStores } from './_lib/sales/stores.js'
import { handleScenarioPerformance } from './_lib/sales/scenarioPerformance.js'
import { handleOpenEventAnalysis } from './_lib/sales/openEventAnalysis.js'
import { handleScheduleExport } from './_lib/sales/scheduleExport.js'
import { handleAnnualAnalysis } from './_lib/sales/annualAnalysis.js'

// 売上 API の入口。type ごとのハンドラは api/_lib/sales/ に 1 ファイルずつ置く（整備 Phase 3、#774）。
// 売上に数える規則は api/_lib/sales/revenue.ts。getReservationRevenue はテストが ./sales から import するため再エクスポートする。
export { getReservationRevenue } from './_lib/sales/revenue.js'

// NOTE: schedule_events_staff_view ではなく schedule_events を直接参照する。
// 理由: スタッフ向けビューは `WHERE is_staff_or_admin()` で auth.uid() を見るが、
// この API ハンドラは service role で実行されるため auth.uid() が NULL になり
// ビュー越しでは常に 0 件しか返らない。本ハンドラは requireStaff(user) で既に
// スタッフ権限を確認しているので、ビューの追加チェックは不要。

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  const type = req.query.type as string | undefined
  if (!type) {
    return res.status(400).json({ error: 'type クエリパラメータが必要です' })
  }

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    switch (type) {
      case 'salary-history':
      case 'salary-inputs':
      case 'sales-cost-inputs':
        return await handleSalaryReportData(req, res, user.orgId)
      case 'by-period':
        return await handleByPeriod(req, res, user.orgId)
      case 'by-store':
        return await handleByStore(req, res, user.orgId)
      case 'by-scenario':
        return await handleByScenario(req, res, user.orgId)
      case 'author-performance-count':
        return await handleAuthorPerformanceCount(req, res, user.orgId)
      case 'stores':
        return await handleStores(res, user.orgId)
      case 'scenario-performance':
        return await handleScenarioPerformance(req, res, user.orgId)
      case 'open-event-analysis':
        return await handleOpenEventAnalysis(req, res, user.orgId)
      case 'schedule-export':
        return await handleScheduleExport(req, res, user.orgId)
      case 'annual-analysis':
        return await handleAnnualAnalysis(req, res, user.orgId)
      default:
        return res.status(400).json({ error: `未対応の type: ${type}` })
    }
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[sales] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// ─── 共通ヘルパ ─────────────────────────────────────────────────────────────
