/**
 * organization_scenarios_with_master ビューからカテゴリ・作者の選択肢を取得するフック
 * 
 * scenarios テーブルではなく、override 反映済みのビューを使用するため、
 * 組織が上書きした作者名・カテゴリ名が正しく反映される。
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { useMemo } from 'react'

export const orgOptionsKeys = {
  all: ['org-scenarios-options'] as const,
}

export function useOrgScenariosForOptions() {
  const { data = [] } = useQuery({
    queryKey: orgOptionsKeys.all,
    queryFn: async () => {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return []

      // 必要最小限のフィールドのみ取得（author と genre だけ）
      const { data, error } = await supabase
        .from('organization_scenarios_with_master')
        .select('author, genre')
        .eq('organization_id', orgId)

      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60 * 1000, // 5分キャッシュ
  })

  const authors = useMemo(() => {
    const set = new Set<string>()
    data.forEach((s: any) => {
      if (s.author) set.add(s.author)
    })
    return Array.from(set)
  }, [data])

  const genres = useMemo(() => {
    const set = new Set<string>()
    data.forEach((s: any) => {
      if (s.genre && Array.isArray(s.genre)) {
        s.genre.forEach((g: string) => { if (g) set.add(g) })
      }
    })
    return Array.from(set)
  }, [data])

  return { authors, genres }
}
