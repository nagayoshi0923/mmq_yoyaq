import { useState, useMemo } from 'react'
import type { Scenario } from '@/types'
import { useSortableTable } from '@/hooks/useSortableTable'

type ScenarioSortField = 'title' | 'author' | 'duration' | 'player_count' | 'player_count_min' | 'difficulty' | 'participation_fee' | 'status' | 'available_gms' | 'genre'

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

  // ソート済みシナリオ（カスタムソート処理）
  const filteredAndSortedScenarios = useMemo(() => {
    if (!sortState) return filteredScenarios

    return [...filteredScenarios].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortState.field) {
        case 'title':
          aValue = a.title?.toLowerCase() || ''
          bValue = b.title?.toLowerCase() || ''
          break
        case 'author':
          aValue = a.author?.toLowerCase() || ''
          bValue = b.author?.toLowerCase() || ''
          break
        case 'duration':
          aValue = a.duration || 0
          bValue = b.duration || 0
          break
        case 'player_count':
        case 'player_count_min':
          aValue = a.player_count_min || 0
          bValue = b.player_count_min || 0
          break
        case 'difficulty':
          aValue = a.difficulty || 0
          bValue = b.difficulty || 0
          break
        case 'participation_fee':
          aValue = a.participation_fee || 0
          bValue = b.participation_fee || 0
          break
        case 'status':
          aValue = a.status || ''
          bValue = b.status || ''
          break
        case 'available_gms':
          aValue = a.available_gms?.length || 0
          bValue = b.available_gms?.length || 0
          break
        case 'genre':
          aValue = a.genre?.[0]?.toLowerCase() || ''
          bValue = b.genre?.[0]?.toLowerCase() || ''
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortState.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortState.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredScenarios, sortState])

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

