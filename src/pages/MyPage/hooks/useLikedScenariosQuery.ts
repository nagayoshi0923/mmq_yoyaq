import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { myPageLikesReadApi } from '@/lib/api/myPageReadApi'
import { scenarioLikeApi } from '@/lib/api/scenarioWriteApi'
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
      const { data: customer, error: customerError } = await myPageLikesReadApi.findCustomerIdByUserId(userId!)
      if (customerError) throw customerError
      if (!customer) return []

      const { data: likesData, error: likesError } = await myPageLikesReadApi.listLikesByCustomer(customer.id)
      if (likesError) throw likesError
      if (!likesData || likesData.length === 0) return []

      const scenarioMasterIds = likesData
        .map(like => (like as { scenario_master_id?: string }).scenario_master_id ?? like.scenario_id)
        .filter(Boolean)
      const { data: scenariosData, error: scenariosError } = await myPageLikesReadApi.listMastersByIds(scenarioMasterIds)
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
      const { error } = await scenarioLikeApi.removeById(likeId)
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
