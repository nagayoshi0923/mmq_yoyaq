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
  survey_enabled?: boolean
  confirmed_date?: string  // 確定した公演日（YYYY-MM-DD）
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

      const groupIds = (data || []).map(g => g.id)
      const scenarioMasterIds = [...new Set((data || []).map(g => g.scenario_master_id).filter(Boolean))]

      // 主催者情報・survey_enabled・確定日を並列取得
      const [
        customersResult,
        surveyResult,
        bookingResult,
      ] = await Promise.all([
        // 主催者情報
        (async () => {
          const organizerIds = [...new Set((data || []).map(g => g.organizer_id).filter(Boolean))]
          if (organizerIds.length === 0) return { data: [] }
          return supabase.from('customers').select('user_id, name, nickname').in('user_id', organizerIds)
        })(),
        // シナリオのsurvey_enabled
        scenarioMasterIds.length > 0
          ? supabase
              .from('organization_scenarios_with_master')
              .select('scenario_master_id, survey_enabled')
              .eq('organization_id', orgId)
              .in('scenario_master_id', scenarioMasterIds)
          : Promise.resolve({ data: [] }),
        // 確定済み予約の公演日（confirmed_date）
        groupIds.length > 0
          ? supabase
              .from('private_booking_requests')
              .select('private_group_id, candidate_datetimes')
              .in('private_group_id', groupIds)
              .eq('status', 'confirmed')
          : Promise.resolve({ data: [] }),
      ])

      const organizerMap = new Map<string, { name: string; nickname?: string }>()
      ;(customersResult.data || []).forEach((c: any) => {
        organizerMap.set(c.user_id, { name: c.name, nickname: c.nickname || undefined })
      })

      const surveyMap = new Map<string, boolean>()
      ;(surveyResult.data || []).forEach((s: any) => {
        surveyMap.set(s.scenario_master_id, s.survey_enabled ?? false)
      })

      // グループIDごとの確定公演日マップ
      const confirmedDateMap = new Map<string, string>()
      ;(bookingResult.data || []).forEach((req: any) => {
        if (!req.private_group_id || !req.candidate_datetimes?.candidates) return
        const confirmed = req.candidate_datetimes.candidates.find((c: any) => c.status === 'confirmed')
        if (confirmed?.date) {
          confirmedDateMap.set(req.private_group_id, confirmed.date)
        }
      })

      const groupsWithOrganizer = (data || []).map(g => {
        const scenarioMasters = Array.isArray(g.scenario_masters)
          ? g.scenario_masters[0]
          : g.scenario_masters

        return {
          ...g,
          scenario_masters: scenarioMasters || null,
          organizer: organizerMap.get(g.organizer_id) || { name: '不明' },
          survey_enabled: surveyMap.get(g.scenario_master_id) ?? false,
          confirmed_date: confirmedDateMap.get(g.id),
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
