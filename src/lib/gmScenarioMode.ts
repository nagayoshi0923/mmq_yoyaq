/**
 * staff_scenario_assignments の can_main_gm / can_sub_gm から一覧表示用のモードへ集約する
 */
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
