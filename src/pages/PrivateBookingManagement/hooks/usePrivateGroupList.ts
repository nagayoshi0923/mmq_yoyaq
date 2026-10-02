import { readPrivateGroupList } from '@/lib/privateGroupRead'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { getGroupsSurveySettings } from '@/lib/groupSurveySettings'
import { useState, useEffect, useCallback } from 'react'
import { privateBookingMgmtReadApi } from '@/lib/api/privateBookingMgmtReadApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { boundedBatches } from '@/lib/boundedBatches'
import { fetchBookingRows } from '../utils/fetchBookingRows'

export interface PrivateGroupListItem {
  id: string
  invite_code: string
  status: string
  organizer_id: string
  scenario_master_id: string
  created_at: string
  updated_at: string
  reservation_numbers?: string[]
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
      // 各フェーズを待ち合わせ、一覧全体でも同時要求を最大3件に保つ。
      const surveyResult = await getGroupsSurveySettings(groupIds)
      const bookingRows = await boundedBatches(reservationIds, 50, 3, async ids => {
        const result = await privateBookingMgmtReadApi.listPrivateReservationsByIds(orgId, ids)
        if (result.error) throw result.error
        return result.data || []
      })
      // 検索用の予約番号は、取消・再申込前の予約も含めて取得する。
      const historyRows = await boundedBatches(groupIds, 50, 3, ids => fetchBookingRows((from, to) =>
        privateBookingMgmtReadApi.listReservationsByGroupIds(orgId, ids, from, to),
      ))
      const reservationNumbers = new Map<string, string[]>()
      for (const reservation of historyRows) {
        if (!reservation.private_group_id || !reservation.reservation_number) continue
        const numbers = reservationNumbers.get(reservation.private_group_id) || []
        numbers.push(reservation.reservation_number)
        reservationNumbers.set(reservation.private_group_id, numbers)
      }
      const currentReservation = new Map(data.map(g => [g.id, g.reservation_id]))
      const eventIds = [...new Set(bookingRows.map(r => r.schedule_event_id).filter((id): id is string => !!id))]
      const eventRows = await boundedBatches(eventIds, 50, 3, async ids => {
        const result = await privateBookingMgmtReadApi.listEventsByIds(orgId, ids)
        if (result.error) throw result.error
        return result.data || []
      })
      const events = new Map(eventRows.map(event => [event.id, event]))

      // グループIDごとの現在公演日・時間・担当名・店舗IDマップ
      const confirmedDateMap = new Map<string, string>()
      const confirmedTimeMap = new Map<string, string>()
      const confirmedGmNameMap = new Map<string, string>()
      const confirmedStoreIdMap = new Map<string, string>()
      bookingRows.forEach(req => {
        if (!req.private_group_id || currentReservation.get(req.private_group_id) !== req.id) return
        if (!['confirmed', 'gm_confirmed', 'checked_in', 'completed', 'no_show'].includes(req.status)) return
        const event = events.get(req.schedule_event_id)
        if (!event || event.is_cancelled || !event.date || !event.start_time || !event.end_time) return
        confirmedDateMap.set(req.private_group_id, event.date)
        confirmedTimeMap.set(req.private_group_id, `${event.start_time.slice(0, 5)}〜${event.end_time.slice(0, 5)}`)
        confirmedGmNameMap.set(req.private_group_id, (event.gms || []).filter(Boolean).join('・'))
        if (event.store_id) confirmedStoreIdMap.set(req.private_group_id, event.store_id)
      })

      // 店舗名を一括取得（先行フェーズ完了後に実行し、一覧全体の同時要求を最大3件に保つ）
      const storeIds = [...new Set([...confirmedStoreIdMap.values()].filter(Boolean))]
      const storeNameMap = new Map<string, string>()
      if (storeIds.length > 0) {
        const storeRows = await boundedBatches(storeIds, 50, 3, async ids => {
          const result = await privateBookingMgmtReadApi.listStoresByIds(orgId, ids)
          if (result.error) throw result.error
          return result.data || []
        })
        storeRows.forEach((s: { id: string; name?: string | null; short_name?: string | null }) => {
          storeNameMap.set(s.id, s.short_name || s.name || '')
        })
      }

      const groupsWithOrganizer = (data || []).map(g => {
        const scenarioMasters = Array.isArray(g.scenario_masters)
          ? g.scenario_masters[0]
          : g.scenario_masters

        const storeId = confirmedStoreIdMap.get(g.id)
        return {
          ...g,
          reservation_numbers: [...new Set(reservationNumbers.get(g.id) || [])],
          scenario_masters: scenarioMasters || null,
          members: (g.members || []).map(m => ({
            ...m,
            member_name: m.staff_display_name || m.guest_name || null,
          })),
          organizer: { name: g.organizer_display_name || '幹事情報を確認できません' },
          survey_enabled: surveyResult[g.id]?.survey_enabled ?? false,
          confirmed_date: confirmedDateMap.get(g.id),
          confirmed_time: confirmedTimeMap.get(g.id),
          confirmed_gm_name: confirmedGmNameMap.get(g.id),
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
