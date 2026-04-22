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
  confirmed_date?: string       // 確定した公演日（YYYY-MM-DD）
  confirmed_time?: string       // 確定した公演時間（HH:MM〜HH:MM）
  confirmed_gm_name?: string    // 確定したGM名
  confirmed_store_name?: string // 確定した店舗名
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
        // 確定済み予約の公演日・GM・時間・店舗（reservationsテーブルから取得）
        groupIds.length > 0
          ? supabase
              .from('reservations')
              .select('private_group_id, candidate_datetimes, gm_staff, store_id')
              .in('private_group_id', groupIds)
              .eq('status', 'confirmed')
              .eq('reservation_source', 'web_private')
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

      // グループIDごとの確定公演日・時間・GMスタッフID・店舗IDマップ
      const confirmedDateMap = new Map<string, string>()
      const confirmedTimeMap = new Map<string, string>()
      const confirmedGmStaffIdMap = new Map<string, string>()
      const confirmedStoreIdMap = new Map<string, string>()
      ;(bookingResult.data || []).forEach((req: any) => {
        if (!req.private_group_id) return
        if (req.candidate_datetimes?.candidates) {
          const confirmed = req.candidate_datetimes.candidates.find((c: any) => c.status === 'confirmed')
          if (confirmed?.date) {
            confirmedDateMap.set(req.private_group_id, confirmed.date)
            const start = confirmed.startTime || confirmed.start_time || ''
            const end = confirmed.endTime || confirmed.end_time || ''
            if (start) confirmedTimeMap.set(req.private_group_id, end ? `${start}〜${end}` : start)
          }
        }
        if (req.gm_staff) confirmedGmStaffIdMap.set(req.private_group_id, req.gm_staff)
        if (req.store_id) confirmedStoreIdMap.set(req.private_group_id, req.store_id)
      })

      // GMスタッフ名・店舗名を一括取得
      const gmStaffIds = [...new Set([...confirmedGmStaffIdMap.values()].filter(Boolean))]
      const storeIds = [...new Set([...confirmedStoreIdMap.values()].filter(Boolean))]
      const gmNameMap = new Map<string, string>()
      const storeNameMap = new Map<string, string>()

      await Promise.all([
        gmStaffIds.length > 0
          ? supabase.from('staff').select('id, display_name, name').in('id', gmStaffIds).then(({ data: staffRows }) => {
              ;(staffRows || []).forEach((s: any) => {
                gmNameMap.set(s.id, s.display_name || s.name || '')
              })
            })
          : Promise.resolve(),
        storeIds.length > 0
          ? supabase.from('stores').select('id, name, short_name').in('id', storeIds).then(({ data: storeRows }) => {
              ;(storeRows || []).forEach((s: any) => {
                storeNameMap.set(s.id, s.short_name || s.name || '')
              })
            })
          : Promise.resolve(),
      ])

      const groupsWithOrganizer = (data || []).map(g => {
        const scenarioMasters = Array.isArray(g.scenario_masters)
          ? g.scenario_masters[0]
          : g.scenario_masters

        const gmStaffId = confirmedGmStaffIdMap.get(g.id)
        const storeId = confirmedStoreIdMap.get(g.id)
        return {
          ...g,
          scenario_masters: scenarioMasters || null,
          organizer: organizerMap.get(g.organizer_id) || { name: '不明' },
          survey_enabled: surveyMap.get(g.scenario_master_id) ?? false,
          confirmed_date: confirmedDateMap.get(g.id),
          confirmed_time: confirmedTimeMap.get(g.id),
          confirmed_gm_name: gmStaffId ? gmNameMap.get(gmStaffId) : undefined,
          confirmed_store_name: storeId ? storeNameMap.get(storeId) : undefined,
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
