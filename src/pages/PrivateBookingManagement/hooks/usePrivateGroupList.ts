import { readPrivateGroupList } from '@/lib/privateGroupRead'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { getGroupsSurveySettings } from '@/lib/groupSurveySettings'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { boundedBatches } from '@/lib/boundedBatches'

export interface PrivateGroupListItem {
  id: string
  invite_code: string
  status: string
  organizer_id: string
  scenario_master_id: string
  created_at: string
  updated_at: string
  survey_enabled?: boolean
  confirmed_date?: string         // 確定した公演日（YYYY-MM-DD）
  confirmed_time?: string         // 確定した公演時間（HH:MM〜HH:MM）
  confirmed_gm_name?: string      // 確定したGM名
  confirmed_store_name?: string   // 確定した店舗名
  confirmed_warning?: string
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
    member_name?: string | null
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

      const data = await readPrivateGroupList('staff', orgId)

      const groupIds = (data || []).map(g => g.id)

      const reservationIds = [...new Set(data.map(g => g.reservation_id).filter((id): id is string => !!id))]
      // 表示名は認可済みsnapshotに含まれる。顧客テーブルを再取得しない。
      const [
        surveyResult,
        bookingRows,
      ] = await Promise.all([
        getGroupsSurveySettings(groupIds),
        boundedBatches(reservationIds, 50, 3, async ids => {
          const result = await supabase
              .from('reservations')
              .select('id, private_group_id, candidate_datetimes, gm_staff, store_id, schedule_event_id, status')
              .eq('organization_id', orgId)
              .in('id', ids)
              .eq('reservation_source', RESERVATION_SOURCE.WEB_PRIVATE)
          if (result.error) throw result.error
          return result.data || []
        }),
      ])
      const currentReservation = new Map(data.map(g => [g.id, g.reservation_id]))
      const eventIds = [...new Set(bookingRows.map(r => r.schedule_event_id).filter((id): id is string => !!id))]
      const eventRows = await boundedBatches(eventIds, 50, 3, async ids => {
        const result = await supabase.from('schedule_events').select('id, date, start_time, end_time, store_id, is_cancelled')
          .eq('organization_id', orgId).in('id', ids)
        if (result.error) throw result.error
        return result.data || []
      })
      const events = new Map(eventRows.map(event => [event.id, event]))

      // グループIDごとの確定公演日・時間・GMスタッフID・店舗IDマップ
      const confirmedDateMap = new Map<string, string>()
      const confirmedTimeMap = new Map<string, string>()
      const confirmedGmStaffIdMap = new Map<string, string>()
      const confirmedStoreIdMap = new Map<string, string>()
      bookingRows.forEach(req => {
        if (!req.private_group_id || currentReservation.get(req.private_group_id) !== req.id) return
        if (!['confirmed', 'gm_confirmed', 'checked_in', 'completed'].includes(req.status)) return
        const event = events.get(req.schedule_event_id)
        if (!event || event.is_cancelled) return
        confirmedDateMap.set(req.private_group_id, event.date)
        confirmedTimeMap.set(req.private_group_id, `${event.start_time.slice(0, 5)}〜${event.end_time.slice(0, 5)}`)
        if (req.gm_staff) confirmedGmStaffIdMap.set(req.private_group_id, req.gm_staff)
        if (event.store_id) confirmedStoreIdMap.set(req.private_group_id, event.store_id)
      })

      // GMスタッフ名・店舗名を一括取得
      const gmStaffIds = [...new Set([...confirmedGmStaffIdMap.values()].filter(Boolean))]
      const storeIds = [...new Set([...confirmedStoreIdMap.values()].filter(Boolean))]
      const gmNameMap = new Map<string, string>()
      const storeNameMap = new Map<string, string>()

      await Promise.all([
        gmStaffIds.length > 0
          ? boundedBatches(gmStaffIds, 50, 3, async ids => {
              const result = await supabase.from('staff').select('id, display_name, name').eq('organization_id', orgId).in('id', ids)
              if (result.error) throw result.error
              return result.data || []
            }).then(staffRows => {
              (staffRows || []).forEach((s: any) => {
                gmNameMap.set(s.id, s.display_name || s.name || '')
              })
            })
          : Promise.resolve(),
        storeIds.length > 0
          ? boundedBatches(storeIds, 50, 3, async ids => {
              const result = await supabase.from('stores').select('id, name, short_name').eq('organization_id', orgId).in('id', ids)
              if (result.error) throw result.error
              return result.data || []
            }).then(storeRows => {
              (storeRows || []).forEach((s: any) => {
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
        const organizer = g.members?.find(m => m.user_id === g.organizer_id && m.is_organizer)
          || g.members?.find(m => m.user_id === g.organizer_id)
        return {
          ...g,
          scenario_masters: scenarioMasters || null,
          members: (g.members || []).map(m => ({
            ...m,
            member_name: m.staff_display_name || m.guest_name || null,
          })),
          organizer: { name: organizer?.staff_display_name || organizer?.guest_name || '幹事情報を確認できません' },
          survey_enabled: surveyResult[g.id]?.survey_enabled ?? false,
          confirmed_date: confirmedDateMap.get(g.id),
          confirmed_time: confirmedTimeMap.get(g.id),
          confirmed_gm_name: gmStaffId ? gmNameMap.get(gmStaffId) : undefined,
          confirmed_store_name: storeId ? storeNameMap.get(storeId) : undefined,
          confirmed_warning: g.status === 'confirmed' && !confirmedDateMap.has(g.id)
            ? '現在の予約と公演の対応を確認できません。予約詳細を確認してください。' : undefined,
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
