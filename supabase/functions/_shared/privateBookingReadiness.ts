/** Web / API / Discord が同じ担当条件で店舗確認待ちを判定する。 */
export interface ReadinessResponse {
  staff_id: string
  response_status?: string | null
  available_candidates?: number[] | null
}
export interface ReadinessAssignment {
  staff_id: string
  scenario_master_id?: string
  can_main_gm?: boolean | null
  can_sub_gm?: boolean | null
}
export interface ReadinessReservation {
  id: string
  organization_id: string
  scenario_master_id: string | null
  candidate_datetimes?: { candidates?: unknown[] } | null
}
export function hasReadyGmTeam(candidateCount: number, required: number, responses: ReadinessResponse[], assignments: ReadinessAssignment[]): boolean {
  const roles = new Map(assignments.map(a => [a.staff_id, a]))
  for (let i = 0; i < candidateCount; i++) {
    const people = [...new Set(responses.filter(r => {
      const status = String(r.response_status ?? '').trim().toLowerCase()
      if (status === 'unavailable' || status === 'all_unavailable') return false
      const selected = r.available_candidates
      return selected?.length ? selected.includes(i) : status === 'available'
    }).map(r => r.staff_id))]
    if (people.some(main => roles.get(main)?.can_main_gm === true &&
      people.filter(other => other !== main && roles.get(other)?.can_sub_gm === true).length >= required - 1)) return true
  }
  return false
}
// Supabase のブラウザ/npm/Edge クライアントに共通するクエリインターフェース。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ReadinessDatabase { from(table: string): any }
export async function readPrivateBookingReadiness(database: ReadinessDatabase, orgId: string, reservations: ReadinessReservation[]): Promise<Record<string, boolean>> {
  if (!orgId || reservations.some(r => r.organization_id !== orgId)) throw new Error('予約の組織を確認できません')
  const result: Record<string, boolean> = {}
  for (let offset = 0; offset < reservations.length; offset += 100) {
    const batch = reservations.slice(offset, offset + 100)
    const scenarioIds = [...new Set(batch.map(r => r.scenario_master_id).filter((id): id is string => !!id))]
    if (batch.some(r => !r.scenario_master_id)) throw new Error('作品を確認できません')
    const {data: scenarios, error: scenarioError} = await database.from('organization_scenarios_with_master')
      .select('scenario_master_id,gm_count').eq('organization_id', orgId).in('scenario_master_id', scenarioIds)
    if (scenarioError) throw scenarioError
    const counts = new Map<string, number>((scenarios || []).map((s: {scenario_master_id: string; gm_count: unknown}) => {
      const n = typeof s.gm_count === 'number' ? s.gm_count : parseInt(String(s.gm_count), 10)
      return [s.scenario_master_id, Number.isFinite(n) && n >= 1 ? Math.min(10, Math.floor(n)) : 1]
    }))
    if (scenarioIds.some(id => !counts.has(id))) throw new Error('作品の必要GM数を確認できません')
    const responses: Array<ReadinessResponse & {reservation_id: string}> = []
    for (let start = 0; ; start += 1000) {
      const {data, error} = await database.from('gm_availability_responses')
        .select('id,reservation_id,staff_id,response_status,available_candidates,staff:staff_id!inner(id)')
        .eq('organization_id', orgId).eq('staff.organization_id', orgId).eq('staff.status', 'active')
        .in('reservation_id', batch.map(r => r.id)).order('id').range(start, start + 999)
      if (error) throw error
      responses.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    const assignments: ReadinessAssignment[] = []
    const staffIds = [...new Set(responses.map(r => r.staff_id))]
    for (let start = 0; start < staffIds.length; start += 100) {
      for (let page = 0; ; page += 1000) {
        const {data, error} = await database.from('staff_scenario_assignments')
          .select('staff_id,scenario_master_id,can_main_gm,can_sub_gm')
          .eq('organization_id', orgId).in('scenario_master_id', scenarioIds).in('staff_id', staffIds.slice(start, start + 100))
          .order('scenario_master_id').order('staff_id').range(page, page + 999)
        if (error) throw error
        assignments.push(...(data || []))
        if (!data || data.length < 1000) break
      }
    }
    for (const r of batch) result[r.id] = hasReadyGmTeam(r.candidate_datetimes?.candidates?.length || 0, counts.get(r.scenario_master_id!)!,
      responses.filter(response => response.reservation_id === r.id), assignments.filter(a => a.scenario_master_id === r.scenario_master_id))
  }
  return result
}

/** 保存済みの承認段階/確定状態は戻さず、現在の作業キューはreadinessから表示する。 */
export function nextGmResponseStatus(current: string, ready: boolean): string {
  return current === 'pending' || current === 'pending_gm' ? (ready ? 'gm_confirmed' : 'pending_gm') : current
}
