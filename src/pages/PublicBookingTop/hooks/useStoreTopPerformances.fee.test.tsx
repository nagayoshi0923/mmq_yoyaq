// @vitest-environment jsdom
// 店舗トップの公演の料金: 組織の独自休日を読めたときだけ平日の公演の料金を出す（2026-10-25 社長報告・Codex レビュー）
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
const holidays = vi.hoisted(() => ({ state: { isLoading: false, error: null as string | null, list: [] as string[] } }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/hooks/useCustomHolidays', () => ({
  useCustomHolidays: () => ({ isLoading: holidays.state.isLoading, error: holidays.state.error, isCustomHoliday: (d: string) => holidays.state.list.includes(d) }),
}))
import { useStoreTopPerformances } from './useStoreTopPerformances'

const scenario = { id: 'sc1', title: '架空の作品', player_count_min: 4, player_count_max: 8, participation_fee: 4500,
  participation_costs: [{ time_slot: 'normal', amount: 4500, type: 'fixed' }, { time_slot: 'weekend', amount: 5000, type: 'fixed' }] }
const ev = (date: string) => ({ id: date, date, start_time: '19:00:00', end_time: '22:00:00', store_id: null, current_participants: 0, max_participants: 8, organization_id: 'o1', scenario_master_id: 'sc1', category: 'open', scenario_data: scenario })

function fees(): Record<string, number | null> {
  let out: Record<string, number | null> = {}
  function Probe() {
    const { performances } = useStoreTopPerformances({ allEvents: [ev('2026-10-20'), ev('2026-10-21'), ev('2026-10-25')] as never, stores: [], organizationId: 'o1', organizationSlug: 'aaa', organizationName: '架空の組織', nowMs: 0 })
    out = Object.fromEntries(performances.map((p) => [p.date, p.fee]))
    return null
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); const root = createRoot(host)
  act(() => root.render(<Probe />)); act(() => root.unmount())
  return out
}

describe('店舗トップの公演の料金', () => {
  it('独自休日を読めたら、平日は平日・独自休日と日曜は土日祝の料金', () => {
    holidays.state = { isLoading: false, error: null, list: ['2026-10-21'] }
    expect(fees()).toEqual({ '2026-10-20': 4500, '2026-10-21': 5000, '2026-10-25': 5000 })
  })
  it('読み込み中・読み込めなかったときは平日の公演の料金を出さない（土日は確定）', () => {
    holidays.state = { isLoading: true, error: null, list: [] }
    expect(fees()).toEqual({ '2026-10-20': null, '2026-10-21': null, '2026-10-25': 5000 })
    holidays.state = { isLoading: false, error: '休日設定を取得できません', list: [] }
    expect(fees()).toEqual({ '2026-10-20': null, '2026-10-21': null, '2026-10-25': 5000 })
  })
})
