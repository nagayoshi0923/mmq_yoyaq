import { useMemo } from 'react'
import type { Staff } from '@/types'

interface UseStaffFiltersProps {
  staff: Staff[]
  searchTerm: string
  statusFilter: string
}

/**
 * スタッフのフィルタリングロジックを管理するフック
 */
export function useStaffFilters({ staff, searchTerm, statusFilter }: UseStaffFiltersProps) {
  /**
   * フィルタリングされたスタッフリスト
   */
  const filteredStaff = useMemo(() => {
    console.log('🔍 フィルタリング開始:', { 
      総スタッフ数: staff.length, 
      検索ワード: searchTerm, 
      ステータスフィルタ: statusFilter,
      スタッフサンプル: staff[0]
    })
    
    const filtered = staff.filter(member => {
      // 検索条件: 名前またはLINE名に部分一致
      const matchesSearch = !searchTerm || 
        (member.name && member.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (member.line_name && member.line_name.toLowerCase().includes(searchTerm.toLowerCase()))
      
      // ステータスフィルタ: 'all' または一致するステータス
      const matchesStatus = statusFilter === 'all' || member.status === statusFilter
      
      console.log(`📝 ${member.name}:`, { matchesSearch, matchesStatus, status: member.status })
      
      return matchesSearch && matchesStatus
    })
    
    console.log('✅ フィルタリング結果:', filtered.length, '件')
    return filtered
  }, [staff, searchTerm, statusFilter])

  /**
   * ステータス別のカウント
   */
  const statusCounts = useMemo(() => {
    return {
      all: staff.length,
      active: staff.filter(s => s.status === 'active').length,
      inactive: staff.filter(s => s.status === 'inactive').length,
      'on-leave': staff.filter(s => s.status === 'on-leave').length
    }
  }, [staff])

  /**
   * フィルタリング結果のサマリー
   */
  const filterSummary = useMemo(() => {
    return {
      total: staff.length,
      filtered: filteredStaff.length,
      hasActiveFilters: searchTerm !== '' || statusFilter !== 'all'
    }
  }, [staff.length, filteredStaff.length, searchTerm, statusFilter])

  return {
    filteredStaff,
    statusCounts,
    filterSummary
  }
}

