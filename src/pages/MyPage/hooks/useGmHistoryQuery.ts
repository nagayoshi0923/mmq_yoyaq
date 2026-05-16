import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export const gmHistoryKeys = {
  staffInfo: (email: string) => ['gm-history', 'staff', email] as const,
  playedScenarios: (staffName: string) => ['gm-history', 'played', staffName] as const,
}

export function useStaffInfoQuery(email: string | undefined) {
  return useQuery({
    queryKey: gmHistoryKeys.staffInfo(email ?? ''),
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('id, organization_id, name, email, experience')
        .eq('email', email!)
        .maybeSingle()
      if (error) {
        logger.error('スタッフ情報取得エラー:', error)
        throw error
      }
      return data
    },
  })
}

export function useGmPlayedScenariosQuery(staffName: string | undefined) {
  return useQuery({
    queryKey: gmHistoryKeys.playedScenarios(staffName ?? ''),
    enabled: !!staffName,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_events_staff_view')
        .select('scenario, date, venue')
        .contains('gms', [staffName!])
        .eq('is_cancelled', false)
        .lte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: false })
      if (error) {
        logger.error('体験済みシナリオ取得エラー:', error)
        throw error
      }
      const scenarioMap = new Map<string, number>()
      data?.forEach((event) => {
        scenarioMap.set(event.scenario, (scenarioMap.get(event.scenario) ?? 0) + 1)
      })
      return Array.from(scenarioMap.entries()).map(([scenario, count]) => ({ scenario, count }))
    },
  })
}
