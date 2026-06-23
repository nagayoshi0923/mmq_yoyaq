/**
 * キット移動計画（再設計版）
 *
 * 仕様: docs/design/kit-transfer-planning.md
 * - 目的: 移動「回数」を最小（動かすキット数を最小）
 * - マルチホップ: 原則 1週1回まで
 * - 同住所(kit_group)×時間非重複 は同日使い回し（必要数 = 最大同時数）
 * - 前日必着: 移動(到着)日 T <= 公演日 - 1（当日着禁止）
 * - 固定店舗(kit_fixed)は供給源にしない / 未配置キットは候補外
 * - 解消できない不足は必ず返す（サイレントにしない）
 *
 * ⚠️ 現状は契約（型・シグネチャ）のみ。アルゴリズムは未実装（テスト先行）。
 */
import type { Scenario, Store, StoreTravelTime, KitTransferSuggestion, KitTransferEvent, KitTransferCompletion } from '@/types'
import type { KitState } from './kitOptimizer'

export type { KitState } from './kitOptimizer'

/** 公演1件＝需要の素（時刻つき） */
export interface PlannerDemand {
  date: string // 'YYYY-MM-DD'
  store_id: string
  scenario_master_id: string
  start_time: string // 'HH:MM'
  end_time: string // 'HH:MM'
}

/** 解消できなかった不足 */
export interface KitShortageItem {
  date: string
  store_id: string
  scenario_master_id: string
  needed: number
  available: number
  /**
   * too_late = 公演が近すぎて前日までに運べない（時間切れ）
   * locked_fixed = キットは在るが固定キット(キット番号ごと)で動かせない（固定解除で使用可）
   * no_capacity = 移動はできるが回せるキットが足りない/出せない（台数・手配不能）
   */
  reason: 'too_late' | 'locked_fixed' | 'no_capacity'
  /** locked_fixed のとき、固定キットが在る店舗ID */
  lockedStoreIds?: string[]
}

export interface KitTransferPlan {
  /** 提案する移動。transfer_date は到着日（公演日-1 以前） */
  transfers: KitTransferSuggestion[]
  /** 解消できなかった不足（必ず返す） */
  shortages: KitShortageItem[]
}

/** 前日（YYYY-MM-DD の1日前） */
function prevDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** 同一(拠点グループ・日)の公演群から、時間が重なる最大同時数を求める */
function maxConcurrency(demands: PlannerDemand[]): number {
  if (demands.length === 0) return 0
  const pts: Array<[string, number]> = []
  for (const d of demands) {
    pts.push([d.start_time, 1])
    pts.push([d.end_time, -1])
  }
  // 同時刻は「終了(-1)」を「開始(+1)」より先に処理（接する区間は重複扱いしない）
  pts.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] < b[0] ? -1 : 1))
  let cur = 0
  let max = 0
  for (const [, v] of pts) {
    cur += v
    if (cur > max) max = cur
  }
  return Math.max(1, max)
}

/** from..to（YYYY-MM-DD）の日付配列（両端含む） */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  const [fy, fm, fd] = from.split('-').map(Number)
  const dt = new Date(fy, fm - 1, fd)
  const [ty, tm, td] = to.split('-').map(Number)
  const last = new Date(ty, tm - 1, td).getTime()
  while (dt.getTime() <= last) {
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`)
    dt.setDate(dt.getDate() + 1)
  }
  return out
}

/**
 * キット移動計画を計算する（システムが最適な移動日を決める / マルチホップ対応）。
 *
 * 健全な貪欲法（仕様 docs/design/kit-transfer-planning.md）:
 * - シナリオごとに独立。各キットは軌跡（いつどの拠点に居るか）を持ち、必要に応じ
 *   週内に複数回移動できる（A→B→A 等）。移動は実行可能なものだけ・回数は抑える。
 * - (拠点グループ×日) の必要数 = 時間重複の最大同時数（同住所×非重複は使い回し）。
 * - 公演日順にセルを処理し、その拠点に居るキットで充足。足りなければ移動で補う:
 *     ・前日必着: 到着日 T は today <= T <= 公演日-1
 *     ・移動元はそのキットの最終コミット日より後に出発（公演で使う日は動かさない）
 *     ・移動元拠点が [T, 公演日] に必要とするキットを奪わない（同日コンフリクト防止）
 *     ・固定キット（fixedKitKeys）は動かさない（キット番号ごと）/ 未配置キットは候補外
 * - 充足できない需要は shortages に必ず出す（サイレントにしない）。
 *
 * @param today 'YYYY-MM-DD'。
 * @param fixedKitKeys 動かさないキットの集合。キー = `${scenario_master_id}-${kit_number}`。
 *                     ※固定は「キット番号ごと」。店舗固定(stores.kit_fixed)は使わない。
 */
export function planKitTransfers(
  initialState: KitState,
  demands: PlannerDemand[],
  scenarios: Scenario[],
  stores: Store[],
  today: string,
  fixedKitKeys: Set<string> = new Set(),
  travelTimes: StoreTravelTime[] = [],
  allowedTransferDates: string[] = [],
): KitTransferPlan {
  const scenarioMap = new Map(scenarios.map(s => [s.id, s]))
  const storeMap = new Map(stores.map(s => [s.id, s]))
  const normalizeAddress = (address?: string | null): string => (address || '').trim().replace(/\s+/g, '')
  const groupOf = (storeId: string): string => {
    const store = storeMap.get(storeId)
    if (!store) return storeId
    if (store.kit_group_id) return store.kit_group_id
    const address = normalizeAddress(store.address)
    return address ? `address:${address}` : storeId
  }
  const nameOf = (storeId: string): string => {
    const s = storeMap.get(storeId)
    return s?.short_name || s?.name || storeId
  }
  const normalizePair = (storeAId: string, storeBId: string): string =>
    storeAId < storeBId ? `${storeAId}::${storeBId}` : `${storeBId}::${storeAId}`
  const travelTimeMap = new Map(travelTimes.map(t => [normalizePair(t.store_a_id, t.store_b_id), t.minutes]))
  const travelMinutes = (fromStoreId: string, toStoreId: string): number => {
    if (groupOf(fromStoreId) === groupOf(toStoreId)) return 0
    return travelTimeMap.get(normalizePair(fromStoreId, toStoreId)) ?? 30
  }

  const transfers: KitTransferSuggestion[] = []
  const shortages: KitShortageItem[] = []
  const normalizedAllowedTransferDates = [...new Set(allowedTransferDates)]
    .filter(date => date >= today)
    .sort()
  const getLatestTransferDate = (deadline: string): string | null => {
    if (normalizedAllowedTransferDates.length === 0) {
      return deadline >= today ? deadline : null
    }
    for (let i = normalizedAllowedTransferDates.length - 1; i >= 0; i--) {
      const date = normalizedAllowedTransferDates[i]
      if (date <= deadline) return date
    }
    return null
  }

  const demandsByScenario = new Map<string, PlannerDemand[]>()
  for (const d of demands) {
    const arr = demandsByScenario.get(d.scenario_master_id)
    if (arr) arr.push(d)
    else demandsByScenario.set(d.scenario_master_id, [d])
  }

  for (const [scenarioId, scDemands] of demandsByScenario) {
    const scenario = scenarioMap.get(scenarioId)
    if (!scenario) continue

    // 固定キット判定（キット番号ごと）。固定キットは移動候補から除外する。
    const isFixed = (kn: number): boolean => fixedKitKeys.has(`${scenarioId}-${kn}`)

    // 各キットは軌跡（stints: いつ以降どの拠点/店舗に居るか）を持つ。配置済みのみ候補。
    type Stint = { from: string | null; group: string; store: string }
    const placed = initialState[scenarioId] || {}
    const kits = new Map<number, { stints: Stint[]; assigned: Set<string> }>()
    for (const [knStr, storeId] of Object.entries(placed)) {
      kits.set(Number(knStr), { stints: [{ from: null, group: groupOf(storeId), store: storeId }], assigned: new Set() })
    }

    const posGroup = (k: { stints: Stint[] }, date: string): string => {
      let g = k.stints[0].group
      for (const s of k.stints) if (s.from === null || s.from <= date) g = s.group
      return g
    }
    const posStore = (k: { stints: Stint[] }, date: string): string => {
      let st = k.stints[0].store
      for (const s of k.stints) if (s.from === null || s.from <= date) st = s.store
      return st
    }
    const countAt = (group: string, date: string, exclude?: number): number => {
      let c = 0
      for (const [kn, k] of kits) {
        if (kn === exclude) continue
        if (posGroup(k, date) === group) c++
      }
      return c
    }

    // (拠点グループ×日) セル（needed = 最大同時数）
    const byGroupDate = new Map<string, PlannerDemand[]>()
    for (const d of scDemands) {
      const key = `${groupOf(d.store_id)} ${d.date}`
      const arr = byGroupDate.get(key)
      if (arr) arr.push(d)
      else byGroupDate.set(key, [d])
    }
    const cells = [...byGroupDate.entries()].map(([key, ds]) => {
      const sp = key.indexOf(' ')
      return { group: key.slice(0, sp), date: key.slice(sp + 1), needed: maxConcurrency(ds), demands: ds }
    })
    cells.sort((a, b) => a.date.localeCompare(b.date))

    const neededAt = (group: string, date: string): number => {
      const ds = scDemands.filter(d => groupOf(d.store_id) === group && d.date === date)
      return ds.length ? maxConcurrency(ds) : 0
    }

    for (const cell of cells) {
      const { group: G, date: D, needed } = cell
      const toStoreId = cell.demands[0].store_id
      const chosen: number[] = []

      // pass1: 既にその拠点に居る空きキット（移動不要）
      for (const [kn, k] of kits) {
        if (chosen.length >= needed) break
        if (k.assigned.has(D)) continue
        if (posGroup(k, D) === G) chosen.push(kn)
      }

      // pass2: 他拠点から移動して補う
      if (chosen.length < needed) {
        const arrivalDeadline = prevDate(D) // 前日必着（到着日の上限）
        const arrival = getLatestTransferDate(arrivalDeadline)
        const candidates: Array<{ kn: number; fromStore: string }> = []
        if (arrival) {
          for (const [kn, k] of kits) {
            if (chosen.includes(kn)) continue
            if (k.assigned.has(D)) continue
            if (posGroup(k, D) === G) continue
            const curStore = posStore(k, D)
            if (isFixed(kn)) continue // 固定キットは動かさない（キット番号ごと）
            const curGroup = posGroup(k, D)
            // 出発は最終コミット日より後（公演で使う日は動かさない）
            let lastAssigned: string | null = null
            for (const ad of k.assigned) if (lastAssigned === null || ad > lastAssigned) lastAssigned = ad
            if (lastAssigned !== null && !(arrival > lastAssigned)) continue
            // 移動元拠点を [arrival, D] のコミットで割らない（同日コンフリクト防止）
            let breaksSource = false
            for (const probe of datesBetween(arrival, D)) {
              const nd = neededAt(curGroup, probe)
              if (nd > 0 && countAt(curGroup, probe, kn) < nd) { breaksSource = true; break }
            }
            if (breaksSource) continue
            candidates.push({ kn, fromStore: curStore })
          }
          // tie-break: 店舗間移動時間が短い候補を優先。未入力は暫定30分。
          const destRegion = storeMap.get(toStoreId)?.region || ''
          candidates.sort((a, b) => {
            const minutesA = travelMinutes(a.fromStore, toStoreId)
            const minutesB = travelMinutes(b.fromStore, toStoreId)
            if (minutesA !== minutesB) return minutesA - minutesB
            const ra = (storeMap.get(a.fromStore)?.region || '') === destRegion && destRegion !== '' ? 0 : 1
            const rb = (storeMap.get(b.fromStore)?.region || '') === destRegion && destRegion !== '' ? 0 : 1
            if (ra !== rb) return ra - rb
            return (storeMap.get(a.fromStore)?.display_order ?? 999) - (storeMap.get(b.fromStore)?.display_order ?? 999)
          })
          for (const c2 of candidates) {
            if (chosen.length >= needed) break
            const k = kits.get(c2.kn)!
            transfers.push({
              scenario_master_id: scenarioId,
              scenario_title: scenario.title,
              kit_number: c2.kn,
              from_store_id: c2.fromStore,
              from_store_name: nameOf(c2.fromStore),
              to_store_id: toStoreId,
              to_store_name: nameOf(toStoreId),
              transfer_date: arrival,
              performance_date: D,
              reason: `${D} に ${nameOf(toStoreId)} で公演`,
            })
            k.stints.push({ from: arrival, group: G, store: toStoreId })
            chosen.push(c2.kn)
          }
        }
      }

      for (const kn of chosen) kits.get(kn)!.assigned.add(D)
      if (chosen.length < needed) {
        let reason: 'too_late' | 'locked_fixed' | 'no_capacity'
        let lockedStoreIds: string[] | undefined
        if (prevDate(D) < today) {
          // 前日(到着上限)が今日より前＝もう運べない＝時間切れ
          reason = 'too_late'
        } else {
          // 固定キットが在って出せないか（キット番号ごと）。在る店舗を記録。
          const locked = new Set<string>()
          for (const [kn, k] of kits) {
            if (k.assigned.has(D)) continue
            if (posGroup(k, D) === G) continue
            if (isFixed(kn)) locked.add(posStore(k, D))
          }
          if (locked.size > 0) {
            reason = 'locked_fixed'
            lockedStoreIds = [...locked]
          } else {
            reason = 'no_capacity'
          }
        }
        shortages.push({
          date: D,
          store_id: toStoreId,
          scenario_master_id: scenarioId,
          needed,
          available: chosen.length,
          reason,
          ...(lockedStoreIds ? { lockedStoreIds } : {}),
        })
      }
    }
  }

  return { transfers, shortages }
}

// ── 持ち越しの責任追及（未実行の確定移動） ─────────────────────────

export interface OverdueTransfer {
  event: KitTransferEvent
  /** 予定日(transfer_date)からの超過日数（today - transfer_date） */
  daysOverdue: number
  /** not_started=回収もまだ / picked_up_only=回収済みだが未設置 */
  state: 'not_started' | 'picked_up_only'
}

function daysBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split('-').map(Number)
  const [ty, tm, td] = toDate.split('-').map(Number)
  const a = new Date(fy, fm - 1, fd).getTime()
  const b = new Date(ty, tm - 1, td).getTime()
  return Math.round((b - a) / 86400000)
}

/**
 * 未実行の確定移動（持ち越し）を検出する。
 * 未実行 = status='pending' かつ transfer_date < today かつ 設置未完了
 * （対応する completion に delivered_at が無い）。
 * 確定者(created_by)・回収者(picked_up_by)は event/completion 側に入っているので
 * 呼び出し側で名前解決して表示する。
 */
export function findOverdueTransfers(
  events: KitTransferEvent[],
  completions: KitTransferCompletion[],
  today: string,
): OverdueTransfer[] {
  const out: OverdueTransfer[] = []
  for (const ev of events) {
    if (ev.status !== 'pending') continue
    if (!(ev.transfer_date < today)) continue // 予定日が未来/今日は対象外

    // 同シナリオ・同キット・同 from→to の完了記録を突き合わせ
    const matches = completions.filter(
      c =>
        (c.scenario_master_id === ev.scenario_master_id ||
          (!!ev.org_scenario_id && c.org_scenario_id === ev.org_scenario_id)) &&
        c.kit_number === ev.kit_number &&
        c.from_store_id === ev.from_store_id &&
        c.to_store_id === ev.to_store_id,
    )
    if (matches.some(c => c.delivered_at != null)) continue // 設置完了済み＝未実行ではない

    const pickedUp = matches.some(c => c.picked_up_at != null)
    out.push({
      event: ev,
      daysOverdue: daysBetween(ev.transfer_date, today),
      state: pickedUp ? 'picked_up_only' : 'not_started',
    })
  }
  // 超過日数が大きい順
  out.sort((a, b) => b.daysOverdue - a.daysOverdue)
  return out
}
