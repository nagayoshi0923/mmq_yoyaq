// api/sales.ts の 'handleAnnualAnalysis' ハンドラを切り出したもの（整備 Phase 3、#774）。ロジックの変更なし。
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { getStoreIds } from '../sales/common.js'
import { SALES_RESERVATION_STATUSES } from '../sales/revenue.js'

// ─── 年間分析 (useAnnualAnalysis 相当) ──────────────────────────────────────
// クライアント側 useAnnualAnalysis.ts のロジックをそのまま移植。
// status の扱い（confirmed / gm_confirmed / checked_in のみ集計。pending は数えない、#721）・payment_method==='staff' 除外・
// venue_rental の売上フォールバック(12000)・月キーの date.substring による生成、
// いずれも変更しない。
type AnnualEventRow = {
  id: string
  date: string
  category: string | null
  venue_rental_fee: number | null
}

type AnnualReservationRow = {
  schedule_event_id: string
  final_price: number | null
  payment_method: string | null
}

export async function handleAnnualAnalysis(req: VercelRequest, res: VercelResponse, orgId: string) {
  const storeIds = getStoreIds(req)
  const startYearParam = req.query.start_year as string | undefined
  const startYear = startYearParam ? parseInt(startYearParam, 10) : 2022
  if (!Number.isFinite(startYear)) {
    return res.status(400).json({ error: 'start_year が不正です' })
  }

  const currentYear = new Date().getFullYear()
  const startDate = `${startYear}-01-01`
  const endDate = `${currentYear}-12-31`

  // schedule_events をページネーション付きで取得（サーバ内取得なので全件ページングしてよい）
  const allEvents: AnnualEventRow[] = []
  const pageSize = 1000
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db!
      .from('schedule_events')
      .select('id, date, category, venue_rental_fee')
      .eq('organization_id', orgId)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
      .order('date')
      .range(from, from + pageSize - 1)

    if (storeIds && storeIds.length > 0) q = q.in('store_id', storeIds)

    const { data, error: qErr } = await q
    if (qErr) {
      console.error('[sales] annual-analysis events error:', qErr)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: qErr.message })
    }
    if (!data || data.length === 0) break
    allEvents.push(...(data as AnnualEventRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }

  // reservations を一括取得（バッチ分割）
  const eventIds = allEvents.map(e => e.id)
  const allReservations: AnnualReservationRow[] = []
  const batchSize = 500
  for (let i = 0; i < eventIds.length; i += batchSize) {
    const batch = eventIds.slice(i, i + batchSize)
    let rFrom = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rq: any = db!
        .from('reservations')
        .select('schedule_event_id, final_price, payment_method')
        .eq('organization_id', orgId)
        .in('schedule_event_id', batch)
        .in('status', SALES_RESERVATION_STATUSES)
        .range(rFrom, rFrom + pageSize - 1)

      const { data: rData, error: rErr } = await rq
      if (rErr) {
        console.error('[sales] annual-analysis reservations error:', rErr)
        return res.status(500).json({ error: 'データ取得に失敗しました', detail: rErr.message })
      }
      if (!rData || rData.length === 0) break
      allReservations.push(...(rData as AnnualReservationRow[]))
      if (rData.length < pageSize) break
      rFrom += pageSize
    }
  }

  // イベントごとの売上を集計（スタッフ予約を除外）
  const revenueByEvent = new Map<string, number>()
  allReservations.forEach(r => {
    if (r.payment_method === 'staff') return
    const prev = revenueByEvent.get(r.schedule_event_id) || 0
    revenueByEvent.set(r.schedule_event_id, prev + (r.final_price || 0))
  })

  // 年月別に集計
  const yearMap = new Map<number, { revenue: number; events: number; monthly: number[]; monthlyEvents: number[] }>()
  for (let y = startYear; y <= currentYear; y++) {
    yearMap.set(y, { revenue: 0, events: 0, monthly: new Array(12).fill(0), monthlyEvents: new Array(12).fill(0) })
  }

  allEvents.forEach(event => {
    const year = parseInt(event.date.substring(0, 4))
    const month = parseInt(event.date.substring(5, 7)) - 1
    const entry = yearMap.get(year)
    if (!entry) return

    let revenue = 0
    if (event.category === 'venue_rental') {
      revenue = event.venue_rental_fee || 12000
    } else if (event.category === 'venue_rental_free') {
      revenue = 0
    } else {
      revenue = revenueByEvent.get(event.id) || 0
    }

    entry.revenue += revenue
    entry.events += 1
    entry.monthly[month] += revenue
    entry.monthlyEvents[month] += 1
  })

  const result: Array<{
    year: number
    totalRevenue: number
    totalEvents: number
    monthlyRevenue: number[]
    monthlyEvents: number[]
    growthRate: number | null
  }> = []
  let prevRevenue: number | null = null

  for (let y = startYear; y <= currentYear; y++) {
    const entry = yearMap.get(y)!
    const growthRate = prevRevenue !== null && prevRevenue > 0
      ? ((entry.revenue - prevRevenue) / prevRevenue) * 100
      : null
    result.push({
      year: y,
      totalRevenue: entry.revenue,
      totalEvents: entry.events,
      monthlyRevenue: entry.monthly,
      monthlyEvents: entry.monthlyEvents,
      growthRate,
    })
    prevRevenue = entry.revenue
  }

  return res.status(200).json(result)
}
