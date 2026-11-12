// 公演スケジュールの下書き自動作成（QW-20261113-001）の読み取りと固定枠の保存。
// GET  /api/schedule?type=auto-draft-rules（固定枠だけ）
// GET  /api/schedule?type=auto-draft-data&start=&end=&demand_from=&demand_to=
// PATCH /api/schedule?action=auto-draft-rules  { store_id, cells: [{ weekday, time_slot, is_open | null }] }
// すべてログイン中のスタッフの組織（user.orgId）で絞る。固定枠の保存は管理者（admin）のみ。
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { ApiError, type AuthUser } from '../auth.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SLOTS = ['morning', 'afternoon', 'evening'] as const
type Slot = typeof SLOTS[number]

function requireDate(value: unknown, name: string): string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) throw new ApiError(400, `${name} は YYYY-MM-DD で指定してください`)
  return value
}

const EVENT_FIELDS = 'date, store_id, time_slot, start_time, scenario_master_id, category, current_participants, max_participants'

export async function handleAutoDraftData(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const start = requireDate(req.query.start, 'start')
  const end = requireDate(req.query.end, 'end')
  const demandFrom = requireDate(req.query.demand_from, 'demand_from')
  const demandTo = requireDate(req.query.demand_to, 'demand_to')
  if (start > end || demandFrom > demandTo) throw new ApiError(400, '期間の指定が正しくありません')

  const orgId = user.orgId
  const [rules, scenarios, gms, nearby, demand, blocked] = await Promise.all([
    db!.from('schedule_slot_rules').select('store_id, weekday, time_slot, is_open').eq('organization_id', orgId),
    db!.from('organization_scenarios_with_master')
      .select('id, org_scenario_id, title, status, player_count_max, duration, weekend_duration, available_stores, kit_count, scenario_kind, available_from, available_until, created_at')
      .eq('organization_id', orgId)
      .eq('status', 'available'),
    db!.from('staff_scenario_assignments')
      .select('scenario_master_id, staff_id, staff!inner(status, organization_id)')
      .eq('organization_id', orgId)
      .eq('can_main_gm', true)
      .eq('staff.status', 'active')
      .eq('staff.organization_id', orgId),
    db!.from('schedule_events').select(EVENT_FIELDS).eq('organization_id', orgId).eq('is_cancelled', false).gte('date', start).lte('date', end).limit(5000),
    db!.from('schedule_events').select(EVENT_FIELDS).eq('organization_id', orgId).eq('is_cancelled', false).gte('date', demandFrom).lte('date', demandTo).limit(10000),
    db!.from('schedule_blocked_slots').select('date, store_id, time_slot').eq('organization_id', orgId).gte('date', start).lte('date', end),
  ])
  for (const r of [rules, scenarios, gms, nearby, demand, blocked]) {
    if (r.error) {
      console.error('[schedule] auto-draft-data error:', r.error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: r.error.message })
    }
  }

  const staffByScenario = new Map<string, Set<string>>()
  for (const row of (gms.data ?? []) as Array<{ scenario_master_id: string; staff_id: string }>) {
    const set = staffByScenario.get(row.scenario_master_id) ?? new Set<string>()
    set.add(row.staff_id)
    staffByScenario.set(row.scenario_master_id, set)
  }

  return res.status(200).json({
    rules: rules.data ?? [],
    scenarios: scenarios.data ?? [],
    main_gm_counts: Object.fromEntries([...staffByScenario].map(([id, set]) => [id, set.size])),
    nearby_events: nearby.data ?? [],
    demand_events: demand.data ?? [],
    blocked_slots: blocked.data ?? [],
  })
}

export async function handleAutoDraftRulesGet(_req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const { data, error } = await db!.from('schedule_slot_rules').select('store_id, weekday, time_slot, is_open').eq('organization_id', user.orgId)
  if (error) return res.status(500).json({ error: '固定枠を読み込めませんでした', detail: error.message })
  return res.status(200).json({ rules: data ?? [] })
}

export async function handleAutoDraftRules(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (user.role !== 'admin') throw new ApiError(403, '固定枠の変更は管理者だけができます')
  const body = (req.body ?? {}) as { store_id?: unknown; cells?: unknown }
  if (typeof body.store_id !== 'string' || !body.store_id) throw new ApiError(400, 'store_id が必要です')
  if (!Array.isArray(body.cells) || body.cells.length === 0 || body.cells.length > 24) throw new ApiError(400, 'cells が正しくありません')

  const cells = body.cells.map(raw => {
    const c = (raw ?? {}) as { weekday?: unknown; time_slot?: unknown; is_open?: unknown }
    if (typeof c.weekday !== 'number' || !Number.isInteger(c.weekday) || c.weekday < 0 || c.weekday > 7) throw new ApiError(400, 'weekday が正しくありません')
    if (typeof c.time_slot !== 'string' || !SLOTS.includes(c.time_slot as Slot)) throw new ApiError(400, 'time_slot が正しくありません')
    if (c.is_open !== null && typeof c.is_open !== 'boolean') throw new ApiError(400, 'is_open が正しくありません')
    return { weekday: c.weekday, time_slot: c.time_slot as Slot, is_open: c.is_open as boolean | null }
  })

  const { data: store, error: storeError } = await db!
    .from('stores').select('id').eq('id', body.store_id).eq('organization_id', user.orgId).maybeSingle()
  if (storeError) return res.status(500).json({ error: '店舗を確認できませんでした', detail: storeError.message })
  if (!store) throw new ApiError(403, '他組織の店舗は使用できません')

  const now = new Date().toISOString()
  const upserts = cells
    .filter(c => c.is_open !== null)
    .map(c => ({ organization_id: user.orgId, store_id: body.store_id as string, weekday: c.weekday, time_slot: c.time_slot, is_open: c.is_open as boolean, updated_at: now }))
  if (upserts.length > 0) {
    const { error } = await db!.from('schedule_slot_rules').upsert(upserts, { onConflict: 'organization_id,store_id,weekday,time_slot' })
    if (error) return res.status(500).json({ error: '固定枠を保存できませんでした', detail: error.message })
  }
  for (const c of cells.filter(c => c.is_open === null)) {
    const { error } = await db!.from('schedule_slot_rules').delete()
      .eq('organization_id', user.orgId).eq('store_id', body.store_id).eq('weekday', c.weekday).eq('time_slot', c.time_slot)
    if (error) return res.status(500).json({ error: '固定枠を保存できませんでした', detail: error.message })
  }

  const { data, error } = await db!.from('schedule_slot_rules').select('store_id, weekday, time_slot, is_open').eq('organization_id', user.orgId)
  if (error) return res.status(500).json({ error: '固定枠を読み直せませんでした', detail: error.message })
  return res.status(200).json({ rules: data ?? [] })
}
