// トップの公演（オープン）の 1 人あたり料金: 平日・土日祝・組織の独自休日（2026-10-25 社長報告）
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { buildPublicPerformance, type PerformanceEventRow, type PerformanceScenarioRow } from './performanceRows'

const scenario: PerformanceScenarioRow = {
  id: 'sc1', title: '架空の作品', player_count_min: 4, player_count_max: 8, participation_fee: 4500,
  participation_costs: [{ time_slot: 'normal', amount: 4500, type: 'fixed' }, { time_slot: 'gmtest', amount: 4000, type: 'fixed' }, { time_slot: 'weekend', amount: 5000, type: 'fixed' }, { time_slot: 'holiday', amount: 5000, type: 'fixed' }],
}
const org = { id: 'o1', slug: 'aaa', name: '架空の組織' }
const row = (date: string): PerformanceEventRow => ({ id: date, date, start_time: '19:00:00', end_time: '22:00:00', store_id: null, current_participants: 0, max_participants: 8, organization_id: 'o1', scenario_master_id: 'sc1' })

describe('トップの公演の料金', () => {
  it('オープン・平日は平日、日曜・祝日は土日祝の料金', () => {
    expect(buildPublicPerformance(row('2026-10-20'), scenario, null, org, () => false)?.fee).toBe(4500)
    expect(buildPublicPerformance(row('2026-10-25'), scenario, null, org, () => false)?.fee).toBe(5000)
    expect(buildPublicPerformance(row('2026-11-03'), scenario, null, org, () => false)?.fee).toBe(5000)
  })
  it('組織の独自休日（平日）も土日祝の料金', () => {
    expect(buildPublicPerformance(row('2026-10-21'), scenario, null, org, (d) => d === '2026-10-21')?.fee).toBe(5000)
    expect(buildPublicPerformance(row('2026-10-22'), scenario, null, org, (d) => d === '2026-10-21')?.fee).toBe(4500)
  })
  it('独自休日を読み込み中・読み込めなかったときは、平日の公演の料金を出さない（土日・祝日は確定）', () => {
    expect(buildPublicPerformance(row('2026-10-21'), scenario, null, org, null)?.fee).toBeNull()
    expect(buildPublicPerformance(row('2026-10-21'), scenario, null, org, null)).not.toBeNull()
    expect(buildPublicPerformance(row('2026-10-25'), scenario, null, org, null)?.fee).toBe(5000)
    expect(buildPublicPerformance(row('2026-11-03'), scenario, null, org, null)?.fee).toBe(5000)
  })
})
