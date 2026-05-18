import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

export const likedScenariosKeys = {
  all: (userId: string) => ['liked-scenarios', userId] as const,
}

export function useLikedScenariosQuery(userId: string | undefined) {
  return useQuery({
    queryKey: likedScenariosKeys.all(userId ?? ''),
    enabled: !!userId,
    queryFn: async () => {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', userId!)
        .maybeSingle()
      if (customerError) throw customerError
      if (!customer) return []

      const { data: likesData, error: likesError } = await supabase
        .from('scenario_likes')
        .select('id, scenario_id, scenario_master_id, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
      if (likesError) throw likesError
      if (!likesData || likesData.length === 0) return []

      const scenarioMasterIds = likesData
        .map(like => (like as { scenario_master_id?: string }).scenario_master_id ?? like.scenario_id)
        .filter(Boolean)
      const { data: scenariosData, error: scenariosError } = await supabase
        .from('scenario_masters')
        .select('id, title, description, author, official_duration, player_count_min, player_count_max, difficulty, genre, key_visual_url')
        .in('id', scenarioMasterIds)
      if (scenariosError) throw scenariosError

      return likesData.map(like => {
        const masterId = (like as { scenario_master_id?: string }).scenario_master_id ?? like.scenario_id
        const scenario = scenariosData?.find(s => s.id === masterId)
        return {
          id: like.id,
          scenario_id: like.scenario_id,
          created_at: like.created_at,
          scenario: scenario
            ? {
                ...scenario,
                duration: (scenario as { official_duration?: number }).official_duration ?? 0,
                slug: scenario.id,
                rating: 0,
                play_count: 0,
              }
            : {
                id: masterId ?? like.scenario_id,
                slug: masterId ?? like.scenario_id,
                title: '不明',
                description: '',
                author: '',
                duration: 0,
                player_count_min: 0,
                player_count_max: 0,
                difficulty: 0,
                genre: [],
                rating: 0,
                play_count: 0,
              },
        }
      })
    },
  })
}

export function useRemoveLikeMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (likeId: string) => {
      const { error } = await supabase.from('scenario_likes').delete().eq('id', likeId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: likedScenariosKeys.all(userId ?? '') })
    },
    onError: (error) => {
      logger.error('削除エラー:', error)
      showToast.error('削除に失敗しました')
    },
  })
}
