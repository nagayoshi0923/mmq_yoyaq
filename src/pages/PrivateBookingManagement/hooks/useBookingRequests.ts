import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger, privateBookingTrace } from '@/utils/logger'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { getPrivateBookingDisplayEndTime } from '@/lib/privateBookingScenarioTime'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import type { PrivateBookingRequest } from './usePrivateBookingData'
import { sortGmResponsesByReplyTime } from '../utils/bookingFormatters'
import { shouldIncludeGmResponseRow } from '../utils/gmAvailabilityStatus'
import { resolveStaffProfileGmSlotCount } from '@/lib/gmScenarioMode'

interface UseBookingRequestsProps {
  userId?: string
  userRole?: string
}

/** 貸切管理で扱う status（タブの件数表示のため、常にまとめて取得する） */
const PRIVATE_BOOKING_LIST_STATUSES = [
  'pending',
  'pending_gm',
  'gm_confirmed',
  'pending_store',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
] as const

export const privateBookingKeys = {
  list: (userId: string, userRole: string) => ['private-bookings', userId, userRole] as const,
}

/** 生データ（endTime未計算）を取得する純粋関数 */
async function fetchRawBookingRequests(
  userId: string,
  userRole: string
): Promise<PrivateBookingRequest[]> {
  if (userId == null || userRole == null) {
    privateBookingTrace('ユーザー情報未確定のため取得をスキップ')
    return []
  }

  const isOrgWideAccess = userRole === 'admin' || userRole === 'license_admin'
  let allowedScenarioIds: string[] | null = null

  if (!isOrgWideAccess) {
    privateBookingTrace('スタッフユーザー - 担当シナリオのみ表示')
    const { data: staffData } = await supabase
      .from('staff')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (staffData) {
      const { data: assignments } = await supabase
        .from('staff_scenario_assignments')
        .select('scenario_master_id')
        .eq('staff_id', staffData.id)

      allowedScenarioIds = assignments?.length
        ? assignments.map(a => a.scenario_master_id)
        : []
    } else {
      allowedScenarioIds = []
    }
  } else {
    privateBookingTrace('管理者 / ライセンス管理者 - 組織内の全リクエスト表示')
  }

  const orgId = await getCurrentOrganizationId()
  if (!orgId) {
    logger.warn('📋 貸切リクエスト: organization_id を取得できません')
    return []
  }

  if (allowedScenarioIds !== null && allowedScenarioIds.length === 0) return []

  let query = supabase
    .from('reservations')
    .select(`
      *,
      scenario_masters:scenario_master_id(title, official_duration),
      customers:customer_id(name, phone),
      private_groups:private_group_id(invite_code, scenario_master_id),
      confirmer:staff!reservations_confirmed_by_fkey(name),
      canceller:staff!reservations_cancelled_by_fkey(name)
    `)
    .eq('organization_id', orgId)
    .eq('reservation_source', RESERVATION_SOURCE.WEB_PRIVATE)
    .order('created_at', { ascending: false })

  if (allowedScenarioIds !== null) {
    query = query.in('scenario_master_id', allowedScenarioIds)
  }
  query = query.in('status', [...PRIVATE_BOOKING_LIST_STATUSES])

  const { data, error } = await query
  if (error) {
    logger.error('Supabaseエラー:', error)
    throw error
  }

  const reservationsList = data || []
  privateBookingTrace(`取得: ${reservationsList.length} 件`)

  // グループID一覧
  const privateGroupIds = [
    ...new Set(
      reservationsList
        .map((r: any) => r.private_group_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]

  // バッチ取得（並列）
  const [
    memberRowsResult,
    viewRowsResult,
    allGmResponsesResult,
    allCandidateDatesResult,
  ] = await Promise.all([
    privateGroupIds.length > 0
      ? supabase
          .from('private_group_members')
          .select('group_id')
          .in('group_id', privateGroupIds)
          .eq('status', 'joined')
      : Promise.resolve({ data: [], error: null }),
    (() => {
      const masterIds = [
        ...new Set(
          reservationsList
            .map((r: any) => r.scenario_master_id || r.private_groups?.scenario_master_id)
            .filter(Boolean)
        ),
      ] as string[]
      return masterIds.length > 0
        ? supabase
            .from('organization_scenarios_with_master')
            .select('scenario_master_id, gm_count, player_count_min, player_count_max, duration, weekend_duration, extra_preparation_time, private_booking_time_slots')
            .eq('organization_id', orgId)
            .in('scenario_master_id', masterIds)
        : Promise.resolve({ data: [], error: null })
    })(),
    // ⚠️ 一括 .in() は PostgREST の max_rows (1000) で結果が切られて貸切リクエストの
    //    最初の方の予約しか GM 回答が UI に表示されなくなる。
    //    予約 ID を 100 件ずつチャンク化して並列フェッチし、最後に concat する。
    (async () => {
      if (reservationsList.length === 0) return { data: [] as any[], error: null }
      const ids = reservationsList.map((r: any) => r.id)
      const chunkSize = 100
      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize))
      const results = await Promise.all(
        chunks.map(chunk =>
          supabase
            .from('gm_availability_responses')
            .select('reservation_id, staff_id, gm_name, response_status, available_candidates, selected_candidate_index, notes, notified_at, response_datetime, responded_at, updated_at, created_at, staff:staff_id(name, avatar_color)')
            .in('reservation_id', chunk),
        ),
      )
      const firstError = results.find(r => r.error)?.error ?? null
      const data = results.flatMap(r => r.data || [])
      return { data, error: firstError }
    })(),
    privateGroupIds.length > 0
      ? supabase
          .from('private_group_candidate_dates')
          .select('group_id, id, date, time_slot, start_time, end_time, status')
          .in('group_id', privateGroupIds)
          .order('date', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ])

  // マップ構築
  const joinedMemberCountByGroupId = new Map<string, number>()
  for (const row of memberRowsResult.data || []) {
    const gid = row.group_id as string
    joinedMemberCountByGroupId.set(gid, (joinedMemberCountByGroupId.get(gid) || 0) + 1)
  }

  const gmCountByMasterId = new Map<string, number>()
  const playerRangeByMasterId = new Map<string, { min: number; max: number }>()
  const scenarioTimingByMasterId = new Map<string, { duration: number; weekend_duration: number | null; extra_preparation_time: number; private_booking_time_slots?: unknown }>()
  for (const row of viewRowsResult.data || []) {
    if (!row.scenario_master_id) continue
    gmCountByMasterId.set(row.scenario_master_id, resolveStaffProfileGmSlotCount({ gm_count: row.gm_count }))
    if (typeof row.player_count_min === 'number' && typeof row.player_count_max === 'number' && row.player_count_min > 0 && row.player_count_max >= row.player_count_min) {
      playerRangeByMasterId.set(row.scenario_master_id, { min: row.player_count_min, max: row.player_count_max })
    }
    if (typeof row.duration === 'number' && row.duration > 0) {
      scenarioTimingByMasterId.set(row.scenario_master_id, {
        duration: row.duration,
        weekend_duration: typeof row.weekend_duration === 'number' && row.weekend_duration > 0 ? row.weekend_duration : null,
        extra_preparation_time: typeof row.extra_preparation_time === 'number' ? row.extra_preparation_time : 0,
        private_booking_time_slots: row.private_booking_time_slots ?? null,
      })
    }
  }

  const gmResponsesByReservationId = new Map<string, any[]>()
  for (const gm of allGmResponsesResult.data || []) {
    const rid = gm.reservation_id as string
    if (!gmResponsesByReservationId.has(rid)) gmResponsesByReservationId.set(rid, [])
    gmResponsesByReservationId.get(rid)!.push(gm)
  }

  const candidateDatesByGroupId = new Map<string, any[]>()
  for (const cd of allCandidateDatesResult.data || []) {
    if (cd.status === 'rejected') continue
    const gid = cd.group_id as string
    if (!candidateDatesByGroupId.has(gid)) candidateDatesByGroupId.set(gid, [])
    candidateDatesByGroupId.get(gid)!.push(cd)
  }

  // 組み立て（endTime計算は呼び出し側で行う）
  return reservationsList.map((req: any) => {
    const gmResponses = gmResponsesByReservationId.get(req.id) || []
    const transformedGMResponses = sortGmResponsesByReplyTime(
      gmResponses.filter((gm: any) => shouldIncludeGmResponseRow(gm)).map((gm: any) => ({
        ...gm,
        gm_name: gm.gm_name || gm.staff?.name || '',
      }))
    )

    let candidateDatetimes = req.candidate_datetimes || { candidates: [] }
    const currentCandidates = candidateDatetimes.candidates || []
    const originalCandidates = req.private_group_id
      ? (candidateDatesByGroupId.get(req.private_group_id) || [])
      : []

    if (req.status === 'confirmed' && originalCandidates.length > currentCandidates.length) {
      const confirmedCandidate = currentCandidates.find((c: any) => c.status === 'confirmed')
      const restoredCandidates = originalCandidates.map((cd: any, idx: number) => {
        const isConfirmed = confirmedCandidate &&
          confirmedCandidate.date === cd.date &&
          confirmedCandidate.timeSlot === cd.time_slot
        return {
          order: idx + 1,
          date: cd.date,
          timeSlot: cd.time_slot,
          startTime: cd.start_time || confirmedCandidate?.startTime || '10:00',
          endTime: cd.end_time || confirmedCandidate?.endTime || '13:00',
          status: isConfirmed ? 'confirmed' : 'pending',
        }
      })
      candidateDatetimes = { ...candidateDatetimes, candidates: restoredCandidates }
    }

    const scenarioMasterId = req.scenario_master_id || req.private_groups?.scenario_master_id
    const scenario_timing = scenarioTimingByMasterId.get(scenarioMasterId) ?? {
      duration: typeof req.scenario_masters?.official_duration === 'number' && req.scenario_masters.official_duration > 0
        ? req.scenario_masters.official_duration
        : 180,
      weekend_duration: null,
      extra_preparation_time: 0,
    }

    const pgId = req.private_group_id as string | undefined | null
    const joinedN = pgId ? (joinedMemberCountByGroupId.get(pgId) ?? 0) : undefined

    return {
      id: req.id,
      reservation_number: req.reservation_number || '',
      scenario_master_id: scenarioMasterId,
      required_gm_count: scenarioMasterId ? (gmCountByMasterId.get(scenarioMasterId) ?? 1) : 1,
      scenario_timing,
      scenario_title: req.scenario_masters?.title || req.title || 'シナリオ名不明',
      customer_name: req.customers?.name || '顧客名不明',
      customer_email: req.customer_email || '',
      customer_phone: req.customers?.phone || req.customer_phone || '',
      candidate_datetimes: candidateDatetimes,
      participant_count: req.participant_count || 0,
      joined_member_count: pgId !== undefined && pgId !== null ? joinedN : undefined,
      scenario_player_count_range: scenarioMasterId ? playerRangeByMasterId.get(scenarioMasterId) ?? null : null,
      notes: req.customer_notes || '',
      status: req.status,
      approver_name: req.confirmer?.name,
      // 承認日時: confirmed_at（2026-06-12追加・キャンセル後も残る）を最優先。
      // 過去データで NULL の場合のみ、confirmed の間に限り updated_at で近似
      approved_at: req.confirmed_at ?? (req.status === 'confirmed' ? req.updated_at : undefined),
      canceller_name: req.canceller?.name,
      cancelled_at: req.cancelled_at ?? undefined,
      gm_responses: transformedGMResponses,
      created_at: req.created_at,
      invite_code: req.private_groups?.invite_code || '',
    } as PrivateBookingRequest
  })
}

export function useBookingRequests({ userId, userRole }: UseBookingRequestsProps) {
  const { isCustomHoliday } = useCustomHolidays()
  const queryClient = useQueryClient()

  const enabled = userId != null && userRole != null
  const { data: rawRequests = [], isLoading: loading } = useQuery<PrivateBookingRequest[]>({
    queryKey: enabled ? privateBookingKeys.list(userId!, userRole!) : ['private-bookings-disabled'],
    queryFn: () => fetchRawBookingRequests(userId!, userRole!),
    enabled,
    staleTime: 60 * 1000, // 1分
    refetchInterval: 3 * 60 * 1000, // 3分ごとに自動更新（GM回答をリアルタイムに反映）
  })

  // endTime を isCustomHoliday で補正（サーバーデータと分離してキャッシュを壊さない）
  const requests = useMemo<PrivateBookingRequest[]>(() => {
    return rawRequests.map(req => {
      const candidates = (req.candidate_datetimes?.candidates || []).map((c: any) => ({
        ...c,
        endTime: getPrivateBookingDisplayEndTime(c.startTime, c.date, req.scenario_timing ?? { duration: 180 }, isCustomHoliday),
      }))
      return { ...req, candidate_datetimes: { ...req.candidate_datetimes, candidates } }
    })
  }, [rawRequests, isCustomHoliday])

  const loadRequests = useCallback((force = false) => {
    if (!enabled) return
    if (force) {
      queryClient.invalidateQueries({ queryKey: privateBookingKeys.list(userId!, userRole!) })
    }
  }, [enabled, userId, userRole, queryClient])

  const filterByMonth = useCallback((reqs: PrivateBookingRequest[], date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    return reqs.filter(req => {
      if (!req.candidate_datetimes?.candidates?.length) return false
      const d = new Date(req.candidate_datetimes.candidates[0].date)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [])

  return { requests, loading, loadRequests, filterByMonth }
}
