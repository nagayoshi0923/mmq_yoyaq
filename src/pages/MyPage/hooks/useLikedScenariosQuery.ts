import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { myPageLikesReadApi } from '@/lib/api/myPageReadApi'
import { scenarioLikeApi } from '@/lib/api/scenarioWriteApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { getJstParts, toJstYmd } from '@/utils/jstDate'

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

export interface WishlistNextEvent {
  eventId: string
  date: string
  startTime: string
  venue: string | null
  remaining: number | null
  /** 作品ページの公演選択へ（?event= で公演を選んだ状態で開く） */
  href: string
}

interface UpcomingEventRow {
  id: string
  date: string
  start_time: string
  venue: string | null
  organization_id: string
  scenario_master_id: string | null
  current_participants: number | null
  max_participants: number | null
}

/**
 * 作品ごとの「次の公演」1 件を選ぶ。開始済み（今日の過ぎた時刻）は除き、残席のある最も早い公演。
 * 全部満席なら最も早い公演（残席 0 として出す）。
 */
export function pickNextEvents(rows: UpcomingEventRow[], now: { date: string; time: string }, orgSlugs: Record<string, string>): Record<string, WishlistNextEvent> {
  const byScenario: Record<string, UpcomingEventRow[]> = {}
  for (const row of rows) {
    if (!row.scenario_master_id) continue
    if (row.date < now.date || (row.date === now.date && row.start_time.slice(0, 5) <= now.time)) continue
    ;(byScenario[row.scenario_master_id] ??= []).push(row)
  }
  const result: Record<string, WishlistNextEvent> = {}
  for (const [scenarioId, events] of Object.entries(byScenario)) {
    const remainingOf = (e: UpcomingEventRow) => e.max_participants == null ? null : Math.max(0, e.max_participants - (e.current_participants ?? 0))
    const pick = events.find(e => remainingOf(e) !== 0) ?? events[0]
    const slug = orgSlugs[pick.organization_id]
    const path = slug ? `/${slug}/scenario/${scenarioId}` : `/scenario/${scenarioId}`
    result[scenarioId] = {
      eventId: pick.id,
      date: pick.date,
      startTime: pick.start_time.slice(0, 5),
      venue: pick.venue,
      remaining: remainingOf(pick),
      href: `${path}?event=${encodeURIComponent(pick.id)}`,
    }
  }
  return result
}

/** 遊びたいリストの全作品の「次の公演」を 1 回の取得で読む（作品ごとに問い合わせない） */
export function useWishlistNextEventsQuery(scenarioMasterIds: string[]) {
  const ids = [...new Set(scenarioMasterIds.filter(Boolean))].sort()
  return useQuery({
    queryKey: ['wishlist-next-events', ids] as const,
    enabled: ids.length > 0,
    queryFn: async () => {
      const nowParts = getJstParts(new Date())
      const now = { date: toJstYmd(new Date()), time: nowParts ? `${nowParts.h}:${nowParts.mi}` : '00:00' }
      const { data, error } = await myPageLikesReadApi.listUpcomingPublicEventsForScenarios(ids, now.date)
      if (error) throw error
      const rows = (data ?? []) as UpcomingEventRow[]
      const orgIds = [...new Set(rows.map(r => r.organization_id).filter(Boolean))]
      const orgSlugs: Record<string, string> = {}
      if (orgIds.length > 0) {
        const { data: orgs, error: orgError } = await myPageLikesReadApi.listOrganizationSlugs(orgIds)
        if (orgError) throw orgError
        ;(orgs ?? []).forEach(o => { if (o.slug) orgSlugs[o.id] = o.slug })
      }
      return pickNextEvents(rows, now, orgSlugs)
    },
  })
}
