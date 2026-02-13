/**
 * organization_categories / organization_authors テーブルから
 * カテゴリ・作者の選択肢を取得するフック
 * 
 * 正規化テーブルから sort_order 順で取得するため、
 * 設定画面で管理した並び順がプルダウンに反映される。
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { useMemo } from 'react'

export const orgOptionsKeys = {
  all: ['org-scenarios-options'] as const,
  categories: ['org-categories'] as const,
  authors: ['org-authors'] as const,
}

export function useOrgScenariosForOptions() {
  // カテゴリ取得（sort_order 順）
  const { data: categoriesData = [] } = useQuery({
    queryKey: orgOptionsKeys.categories,
    queryFn: async () => {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return []

      const { data, error } = await supabase
        .from('organization_categories')
        .select('id, name, sort_order')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60 * 1000, // 5分キャッシュ
  })

  // 作者取得（sort_order 順）
  const { data: authorsData = [] } = useQuery({
    queryKey: orgOptionsKeys.authors,
    queryFn: async () => {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return []

      const { data, error } = await supabase
        .from('organization_authors')
        .select('id, name, sort_order')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  const genres = useMemo(() => {
    return categoriesData.map((c: any) => c.name as string)
  }, [categoriesData])

  const authors = useMemo(() => {
    return authorsData.map((a: any) => a.name as string)
  }, [authorsData])

  return { authors, genres }
}
