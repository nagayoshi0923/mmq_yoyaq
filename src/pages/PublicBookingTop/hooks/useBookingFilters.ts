import { useMemo } from 'react'
import type { ScenarioCard } from './useBookingData'

/**
 * シナリオのフィルタリングロジックを管理するフック
 */
export function useBookingFilters(scenarios: ScenarioCard[], searchTerm: string) {
  /**
   * 検索でフィルタリングされたシナリオ
   */
  const filteredScenarios = useMemo(() => {
    if (!searchTerm) return scenarios
    
    const lowerSearchTerm = searchTerm.toLowerCase()
    return scenarios.filter(scenario => 
      scenario.scenario_title.toLowerCase().includes(lowerSearchTerm) ||
      scenario.author.toLowerCase().includes(lowerSearchTerm) ||
      scenario.genre.some(g => g.toLowerCase().includes(lowerSearchTerm))
    )
  }, [scenarios, searchTerm])

  /**
   * 新作シナリオ（30日以内にリリース）
   */
  const newScenarios = useMemo(() => {
    return filteredScenarios.filter(s => s.is_new)
  }, [filteredScenarios])

  /**
   * 直近公演があるシナリオ（次回公演日でソート）
   */
  const upcomingScenarios = useMemo(() => {
    return filteredScenarios
      .filter(s => s.next_event_date)
      .sort((a, b) => {
        if (!a.next_event_date) return 1
        if (!b.next_event_date) return -1
        return a.next_event_date.localeCompare(b.next_event_date)
      })
  }, [filteredScenarios])

  /**
   * 全シナリオ（タイトル順）
   */
  const allScenarios = useMemo(() => {
    return filteredScenarios.sort((a, b) => 
      a.scenario_title.localeCompare(b.scenario_title, 'ja')
    )
  }, [filteredScenarios])

  return {
    filteredScenarios,
    newScenarios,
    upcomingScenarios,
    allScenarios
  }
}

