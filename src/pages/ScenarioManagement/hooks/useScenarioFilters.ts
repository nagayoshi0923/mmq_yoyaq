import { useState, useMemo } from 'react'
import type { Scenario } from '@/types'
import { useSortableTable } from '@/hooks/useSortableTable'

type ScenarioSortField = 'title' | 'author' | 'duration' | 'player_count_min' | 'difficulty' | 'participation_fee' | 'status' | 'available_gms'

/**
 * シナリオのフィルタリング・検索・ソート機能を管理するフック
 */
export function useScenarioFilters(scenarios: Scenario[]) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  
  // 並び替え機能
  const { sortState, handleSort, sortData } = useSortableTable<ScenarioSortField>({
    storageKey: 'scenario_sort_state',
    defaultField: 'title',
    defaultDirection: 'desc'
  })

  // フィルタリング済みシナリオ
  const filteredScenarios = useMemo(() => {
    return scenarios.filter((scenario) => {
      const matchesSearch = 
        searchTerm === '' ||
        scenario.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        scenario.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (scenario.description && scenario.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (scenario.genre && scenario.genre.some((g: string) => g.toLowerCase().includes(searchTerm.toLowerCase())))
      
      const matchesStatus = 
        statusFilter === 'all' || 
        scenario.status === statusFilter
      
      return matchesSearch && matchesStatus
    })
  }, [scenarios, searchTerm, statusFilter])

  // ソート済みシナリオ
  const filteredAndSortedScenarios = useMemo(() => {
    return sortData(filteredScenarios)
  }, [filteredScenarios, sortData])

  return {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    sortState,
    handleSort,
    filteredScenarios,
    filteredAndSortedScenarios
  }
}

