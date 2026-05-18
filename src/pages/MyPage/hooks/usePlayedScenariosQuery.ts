import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

export const playedScenariosKeys = {
  played: (email: string) => ['played-scenarios', 'played', email] as const,
  liked: (customerId: string) => ['played-scenarios', 'liked', customerId] as const,
}

interface PlayedScenario {
  scenario: string
  date: string
  venue: string
  gms: string[]
  scenario_id?: string
  key_visual_url?: string
}

export function usePlayedScenariosQuery(email: string | undefined) {
  return useQuery({
    queryKey: playedScenariosKeys.played(email ?? ''),
    enabled: !!email,
    queryFn: async (): Promise<{ scenarios: PlayedScenario[]; customerId: string | null }> => {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, name')
        .eq('email', email!)
        .maybeSingle()
      if (customerError) throw customerError
      if (!customer) {
        logger.log('顧客情報が見つかりません:', email)
        return { scenarios: [], customerId: null }
      }

      const { data: reservations, error: reservationsError } = await supabase
        .from('reservations')
        .select('requested_datetime, title, scenario_id, scenario_master_id')
        .eq('customer_id', customer.id)
        .eq('status', 'confirmed')
        .lte('requested_datetime', new Date().toISOString())
        .order('requested_datetime', { ascending: false })
      if (reservationsError) throw reservationsError

      const scenarios: PlayedScenario[] = []
      if (reservations) {
        for (const reservation of reservations) {
          const reservationDate = new Date(reservation.requested_datetime)
          const dateStr = reservationDate.toISOString().split('T')[0]

          const { data: event, error: eventError } = await supabase
            .from('schedule_events_public')
            .select('scenario, date, venue')
            .eq('date', dateStr)
            .eq('scenario', reservation.title)
            .maybeSingle()

          let keyVisualUrl: string | null = null
          if (reservation.scenario_master_id) {
            const { data: scenarioData } = await supabase
              .from('scenario_masters')
              .select('key_visual_url')
              .eq('id', reservation.scenario_master_id)
              .maybeSingle()
            keyVisualUrl = scenarioData?.key_visual_url ?? null
          }

          if (!eventError && event) {
            scenarios.push({
              scenario: event.scenario,
              date: event.date,
              venue: event.venue,
              gms: [],
              scenario_id: reservation.scenario_master_id || undefined,
              key_visual_url: keyVisualUrl ?? undefined,
            })
          } else {
            scenarios.push({
              scenario: reservation.title,
              date: dateStr,
              venue: '店舗不明',
              gms: [],
              scenario_id: reservation.scenario_master_id || undefined,
              key_visual_url: keyVisualUrl ?? undefined,
            })
          }
        }
      }

      return { scenarios, customerId: customer.id }
    },
  })
}

export function useLikedScenarioIdsQuery(customerId: string | null) {
  return useQuery({
    queryKey: playedScenariosKeys.liked(customerId ?? ''),
    enabled: !!customerId,
    queryFn: async (): Promise<Set<string>> => {
      const { data: likes } = await supabase
        .from('scenario_likes')
        .select('scenario_id')
        .eq('customer_id', customerId!)
      return new Set(likes?.map(l => l.scenario_id) ?? [])
    },
  })
}

export function useToggleLikeMutation(customerId: string | null, organizationId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ scenarioId, isLiked }: { scenarioId: string; isLiked: boolean }) => {
      if (isLiked) {
        const { error } = await supabase
          .from('scenario_likes')
          .delete()
          .eq('customer_id', customerId!)
          .eq('scenario_id', scenarioId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('scenario_likes')
          .insert({ customer_id: customerId!, scenario_id: scenarioId, organization_id: organizationId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playedScenariosKeys.liked(customerId ?? '') })
    },
    onError: (error) => {
      logger.error('いいね切り替えエラー:', error)
      showToast.error('操作に失敗しました')
    },
  })
}
