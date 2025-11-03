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
      .filter(s => s.next_events && s.next_events.length > 0)
      .sort((a, b) => {
        // 最も近い公演日でソート
        const aDate = a.next_events?.[0]?.date
        const bDate = b.next_events?.[0]?.date
        if (!aDate) return 1
        if (!bDate) return -1
        
        // 日付で比較（昇順：早い日付が先）
        const dateCompare = aDate.localeCompare(bDate)
        if (dateCompare !== 0) return dateCompare
        
        // 同じ日付の場合、時刻で比較
        const aTime = a.next_events?.[0]?.time || ''
        const bTime = b.next_events?.[0]?.time || ''
        return aTime.localeCompare(bTime)
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

