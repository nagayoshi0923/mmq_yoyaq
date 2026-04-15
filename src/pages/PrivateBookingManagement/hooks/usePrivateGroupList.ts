import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'

export interface PrivateGroupListItem {
  id: string
  invite_code: string
  status: string
  organizer_id: string
  scenario_master_id: string
  created_at: string
  updated_at: string
  scenario_masters: {
    id: string
    title: string
    key_visual_url?: string
    player_count_max?: number
  } | null
  members: Array<{
    id: string
    user_id: string | null
    guest_name: string | null
    is_organizer: boolean
  }>
  candidate_dates: Array<{
    id: string
    date: string
    time_slot: string
    responses: Array<{
      id: string
      member_id: string
      response: string
    }>
  }>
  organizer?: {
    name: string
    nickname?: string
    email?: string
  }
}

interface UsePrivateGroupListReturn {
  groups: PrivateGroupListItem[]
  loading: boolean
  error: string | null
  loadGroups: () => Promise<void>
}

export function usePrivateGroupList(): UsePrivateGroupListReturn {
  const [groups, setGroups] = useState<PrivateGroupListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        setError('組織情報が取得できません')
        return
      }

      const { data, error: queryError } = await supabase
        .from('private_groups')
        .select(`
          id,
          invite_code,
          status,
          organizer_id,
          scenario_master_id,
          created_at,
          updated_at,
          scenario_masters:scenario_master_id (
            id,
            title,
            key_visual_url,
            player_count_max
          ),
          members:private_group_members (
            id,
            user_id,
            guest_name,
            is_organizer
          ),
          candidate_dates:private_group_candidate_dates (
            id,
            date,
            time_slot,
            responses:private_group_date_responses (
              id,
              member_id,
              response
            )
          )
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })

      if (queryError) {
        throw queryError
      }

      // 主催者情報を取得
      const organizerIds = [...new Set((data || []).map(g => g.organizer_id).filter(Boolean))]
      const organizerMap: Map<string, { name: string; nickname?: string; email?: string }> = new Map()

      if (organizerIds.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('user_id, name, nickname')
          .in('user_id', organizerIds)

        if (customers) {
          customers.forEach(c => {
            organizerMap.set(c.user_id, { name: c.name, nickname: c.nickname || undefined })
          })
        }
      }

      const groupsWithOrganizer = (data || []).map(g => {
        // scenario_mastersが配列の場合は最初の要素を取得
        const scenarioMasters = Array.isArray(g.scenario_masters) 
          ? g.scenario_masters[0] 
          : g.scenario_masters
        
        return {
          ...g,
          scenario_masters: scenarioMasters || null,
          organizer: organizerMap.get(g.organizer_id) || { name: '不明' }
        }
      }) as PrivateGroupListItem[]

      setGroups(groupsWithOrganizer)
    } catch (err: any) {
      logger.error('グループ一覧の取得エラー:', err)
      setError(err.message || 'グループ一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  return { groups, loading, error, loadGroups }
}
