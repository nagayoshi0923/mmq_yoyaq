/**
 * staff_scenario_assignments の can_main_gm / can_sub_gm から一覧表示用のモードへ集約する
 */

/** JSON/数値として返りうる gm_count を 1..10 に正規化（取れなければ 0） */
function parseGmCountField(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.min(10, Math.floor(value))
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = parseInt(value, 10)
    if (Number.isFinite(n) && n >= 1) return Math.min(10, n)
  }
  return 0
}

/**
 * 担当作品ページで「メイン／サブを分けるか」の判定用。
 *
 * **organization_scenarios.gm_count（シナリオ編集の「必要GM数」）のみを使う。**
 * 1 人GMでも gm_costs が 2 行（メイン／サブ報酬など）のデータがあり、
 * 件数から推定すると誤って 2 人体制になる。
 *
 * gm_count が未設定のときは 1 人体制扱い。2 人GMの作品はシナリオ編集で必要GM数を保存すること。
 */
export function resolveStaffProfileGmSlotCount(row: { gm_count?: unknown }): number {
  const fromCount = parseGmCountField(row.gm_count)
  if (fromCount >= 1) {
    return fromCount
  }
  return 1
}
export type GmScenarioMode = 'main_only' | 'sub_only' | 'main_and_sub'

type AssignmentLike = {
  can_main_gm?: boolean | null
  can_sub_gm?: boolean | null
  scenarios?: { id: string } | null
}

export function buildGmScenarioModesFromAssignments(
  assignments: AssignmentLike[]
): Record<string, GmScenarioMode> {
  const agg = new Map<string, { main: boolean; sub: boolean }>()

  for (const a of assignments) {
    const sid = a.scenarios?.id
    if (!sid) continue
    const cur = agg.get(sid) || { main: false, sub: false }
    cur.main ||= a.can_main_gm === true
    cur.sub ||= a.can_sub_gm === true
    agg.set(sid, cur)
  }

  const map: Record<string, GmScenarioMode> = {}
  for (const [sid, { main, sub }] of agg) {
    if (!main && !sub) continue
    if (main && sub) map[sid] = 'main_and_sub'
    else if (main) map[sid] = 'main_only'
    else map[sid] = 'sub_only'
  }
  return map
}

export function gmScenarioModeLabel(mode: GmScenarioMode | undefined): string {
  switch (mode) {
    case 'sub_only':
      return 'サブGM可'
    case 'main_and_sub':
      return 'メイン・サブ両方'
    case 'main_only':
    default:
      return 'メインGM可'
  }
}

export function gmScenarioBadgeClassNames(mode: GmScenarioMode | undefined): string {
  switch (mode) {
    case 'sub_only':
      return 'bg-teal-50 text-teal-800 border-teal-200'
    case 'main_and_sub':
      return 'bg-violet-50 text-violet-800 border-violet-200'
    case 'main_only':
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200'
  }
}

/** シナリオ一覧の担当GMバッジ1件分 */
export type GmListBadgeEntry = {
  name: string
  mode: GmScenarioMode
  /** サブのみのときは「サブ＋名前」 */
  displayLabel: string
}

function staffNameFromStaffJoin(staff: unknown): string | null {
  if (staff == null) return null
  if (Array.isArray(staff)) {
    const first = staff[0]
    const n =
      first && typeof first === 'object' && first !== null && 'name' in first
        ? (first as { name?: unknown }).name
        : null
    return typeof n === 'string' && n.trim() ? n.trim() : null
  }
  if (typeof staff === 'object' && staff !== null && 'name' in staff) {
    const n = (staff as { name?: unknown }).name
    return typeof n === 'string' && n.trim() ? n.trim() : null
  }
  return null
}

export type GmAssignmentRowForList = {
  scenario_master_id: string
  can_main_gm?: boolean | null
  can_sub_gm?: boolean | null
  staff?: unknown
}

/**
 * staff_scenario_assignments を organization 内で IN 取得した行から、
 * scenario_master_id → 一覧表示用バッジ配列（名前順）を組み立てる。
 */
export function buildGmListBadgeMap(rows: GmAssignmentRowForList[]): Map<string, GmListBadgeEntry[]> {
  const map = new Map<string, GmListBadgeEntry[]>()
  for (const row of rows) {
    if (!row.scenario_master_id) continue
    const name = staffNameFromStaffJoin(row.staff)
    if (!name) continue
    const main = row.can_main_gm === true
    const sub = row.can_sub_gm === true
    if (!main && !sub) continue
    let mode: GmScenarioMode
    if (main && sub) mode = 'main_and_sub'
    else if (main) mode = 'main_only'
    else mode = 'sub_only'
    const displayLabel = mode === 'sub_only' ? `サブ${name}` : name
    const list = map.get(row.scenario_master_id) || []
    list.push({ name, mode, displayLabel })
    map.set(row.scenario_master_id, list)
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, 'ja'))
  }
  return map
}
