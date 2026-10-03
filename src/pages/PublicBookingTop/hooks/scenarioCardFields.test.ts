import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { scenarioCardId, scenarioCardTitle, type PublicScenarioRow, type ScenarioCard } from './useBookingData'

describe('予約サイトの作品の ID・名前（#775）', () => {
  it('作品カードは scenario_id・scenario_title を使う', () => {
    const card = { scenario_id: 'master-1', scenario_title: '作品A' } as ScenarioCard
    expect(scenarioCardId(card)).toBe('master-1')
    expect(scenarioCardTitle(card)).toBe('作品A')
  })

  it('作品カードに無い作品は、作品一覧の行の id・title を使う（以前は ID が取れず作品ページへ進めなかった）', () => {
    const row = { id: 'master-2', title: '作品B' } as PublicScenarioRow
    expect(scenarioCardId(row)).toBe('master-2')
    expect(scenarioCardTitle(row)).toBe('作品B')
  })
})
