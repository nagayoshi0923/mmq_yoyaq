import { readPrivateGroupList } from '@/lib/privateGroupRead'
import { fetchBookingRows, fetchBookingRelatedRows } from '../utils/fetchBookingRows'
import { getGmResponses, getGmReadiness, type GmResponseRow } from '@/lib/gmResponseApi'
import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { privateBookingRequestReadApi } from '@/lib/api/privateBookingMgmtReadApi'
import { privateBookingMgmtReadApi } from '@/lib/api/privateBookingMgmtReadApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger, privateBookingTrace } from '@/utils/logger'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { getPrivateBookingDisplayEndTime } from '@/lib/privateBookingScenarioTime'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import type { PrivateBookingRequest } from './usePrivateBookingData'
import { sortGmResponsesByReplyTime } from '../utils/bookingFormatters'
import { shouldIncludeGmResponseRow } from '../utils/gmAvailabilityStatus'
import { resolveStaffProfileGmSlotCount, type GmScenarioMode } from '@/lib/gmScenarioMode'

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
  gmHistory: (userId: string, userRole: string, ids: string[]) => ['private-bookings-gm-history', userId, userRole, ids] as const,
}

/** 対応中（GM確認・店舗承認）の申込。開いたときに GM 回答を必ず読む対象（#835） */
const ACTIVE_STATUSES = new Set(['pending', 'pending_gm', 'gm_confirmed', 'pending_store'])

/** GM 回答の行を画面表示用に整える（名前の補完と、回答が早い順） */
function toDisplayGmResponses(rows: GmResponseRow[]) {
  return sortGmResponsesByReplyTime(
    rows.filter((gm) => shouldIncludeGmResponseRow(gm)).map((gm) => ({
      ...gm,
      gm_name: gm.gm_name || gm.staff?.name || '',
    }))
  )
}

function groupByReservationId(rows: GmResponseRow[]) {
  const map = new Map<string, GmResponseRow[]>()
  for (const gm of rows) {
    const rid = gm.reservation_id as string
    if (!map.has(rid)) map.set(rid, [])
    map.get(rid)!.push(gm)
  }
  return map
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
    const { data: staffData } = await privateBookingMgmtReadApi.findStaffIdByUserId(userId)

    if (staffData) {
      const { data: assignments } = await privateBookingMgmtReadApi.listAssignedScenarioIds(staffData.id)

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

  const reservationsList = await fetchBookingRows((from, to) => {
    return privateBookingRequestReadApi.listRequestsPage(orgId, allowedScenarioIds, [...PRIVATE_BOOKING_LIST_STATUSES], from, to)
  })
  privateBookingTrace(`取得: ${reservationsList.length} 件`)

  // グループID一覧
  const privateGroupIds = [
    ...new Set(
      reservationsList
        .map((r) => r.private_group_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]

  const relatedGroups = privateGroupIds.length > 0 ? await readPrivateGroupList('staff', orgId, privateGroupIds) : []
  const groupById = new Map(relatedGroups.map(group => [group.id, group]))
  for (const reservation of reservationsList) {
    reservation.private_groups = groupById.get(reservation.private_group_id) || null
  }

  // バッチ取得（並列）
  const [
    memberRowsResult,
    viewRowsResult,
    gmAssignmentsResult,
    allGmResponsesResult,
    allCandidateDatesResult,
    gmReadiness,
  ] = await Promise.all([
    Promise.resolve({ data: relatedGroups.flatMap(group => (group.members || []).filter(member => member.status === 'joined')), error: null }),
    (() => {
      const masterIds = [
        ...new Set(
          reservationsList
            .map((r) => r.scenario_master_id || r.private_groups?.scenario_master_id)
            .filter(Boolean)
        ),
      ] as string[]
      return fetchBookingRelatedRows(masterIds, (batch, from, to) => privateBookingMgmtReadApi.listScenarioViewsForRequests(orgId, batch, from, to))
    })(),
    // 回答したGMのメイン・サブ設定（#827）
    fetchBookingRelatedRows([...new Set(reservationsList
      .map((r) => r.scenario_master_id || r.private_groups?.scenario_master_id)
      .filter(Boolean))] as string[], (batch, from, to) => privateBookingMgmtReadApi.listGmAssignmentsByScenarios(batch, from, to)),
    // 承認済み・却下済みなど過去分の GM 回答は、画面を出した後に別途読む（#835）
    getGmResponses(reservationsList.filter((r) => ACTIVE_STATUSES.has(r.status)).map((r) => r.id)).then(data => ({ data, error: null })),
    Promise.resolve({ data: relatedGroups.flatMap(group => group.candidate_dates || []), error: null }),
    getGmReadiness(reservationsList.filter(r => ['pending', 'pending_gm', 'gm_confirmed', 'pending_store'].includes(r.status)).map(r => r.id)),
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

  const gmResponsesByReservationId = groupByReservationId(allGmResponsesResult.data || [])

  // 作品ごとに、スタッフ → メイン・サブの区分（どちらも付いていない担当は none）
  const gmRoleByScenario = new Map<string, Record<string, GmScenarioMode | 'none'>>()
  for (const row of gmAssignmentsResult.data || []) {
    if (row.organization_id !== orgId) continue // 自組織以外の担当設定は使わない（#856）
    if (!row.scenario_master_id || !row.staff_id) continue
    const roles = gmRoleByScenario.get(row.scenario_master_id) ?? {}
    roles[row.staff_id] = row.can_main_gm && row.can_sub_gm ? 'main_and_sub' : row.can_main_gm ? 'main_only' : row.can_sub_gm ? 'sub_only' : 'none'
    gmRoleByScenario.set(row.scenario_master_id, roles)
  }

  type GroupCandidateDate = { group_id: string; date: string; time_slot: string; start_time?: string | null; end_time?: string | null; status?: string | null }
  const candidateDatesByGroupId = new Map<string, GroupCandidateDate[]>()
  for (const cd of allCandidateDatesResult.data || []) {
    if (cd.status === 'rejected') continue
    const gid = cd.group_id as string
    if (!candidateDatesByGroupId.has(gid)) candidateDatesByGroupId.set(gid, [])
    candidateDatesByGroupId.get(gid)!.push(cd as GroupCandidateDate)
  }

  // 組み立て（endTime計算は呼び出し側で行う）
  return reservationsList.map((req) => {
    const transformedGMResponses = toDisplayGmResponses(gmResponsesByReservationId.get(req.id) || [])

    let candidateDatetimes = req.candidate_datetimes || { candidates: [] }
    const currentCandidates: PrivateBookingRequest['candidate_datetimes']['candidates'] = candidateDatetimes.candidates || []
    candidateDatetimes = { ...candidateDatetimes, candidates: currentCandidates.map((candidate, index) => ({ ...candidate, gm_response_index: index })) }
    const originalCandidates = req.private_group_id
      ? (candidateDatesByGroupId.get(req.private_group_id) || [])
      : []

    if (req.status === 'confirmed' && originalCandidates.length > currentCandidates.length) {
      const confirmedCandidate = currentCandidates.find(c => c.status === 'confirmed')
      const restoredCandidates = originalCandidates.map((cd, idx: number) => {
        const isConfirmed = confirmedCandidate &&
          confirmedCandidate.date === cd.date &&
          confirmedCandidate.timeSlot === cd.time_slot
        return {
          order: idx + 1,
          gm_response_index: null,
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
      gm_team_ready: gmReadiness[req.id],
      required_gm_count: scenarioMasterId ? (gmCountByMasterId.get(scenarioMasterId) ?? 1) : 1,
      scenario_timing,
      scenario_title: req.scenario_masters?.title || req.title || 'シナリオ名不明',
      customer_name: req.customers?.name || '顧客名不明',
      customer_email: req.customer_email || '',
      customer_phone: req.customers?.phone || req.customer_phone || '',
      candidate_datetimes: candidateDatetimes,
      response_candidate_snapshot: currentCandidates,
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
      gm_role_by_staff: scenarioMasterId ? (gmRoleByScenario.get(scenarioMasterId) ?? {}) : {},
      created_at: req.created_at,
      invite_code: req.private_groups?.invite_code || '',
    } as PrivateBookingRequest
  })
}

// 読込中・読込失敗で data が無い間も同じ配列を返す。毎描画で新しい [] を返すと、
// requests に依存する画面側の effect が setState を繰り返し再描画ループになる。
const NO_REQUESTS: PrivateBookingRequest[] = []

export function useBookingRequests({ userId, userRole }: UseBookingRequestsProps) {
  const { isCustomHoliday } = useCustomHolidays()
  const queryClient = useQueryClient()

  const enabled = userId != null && userRole != null
  const { data: rawRequests = NO_REQUESTS, isLoading: loading, isError, refetch } = useQuery<PrivateBookingRequest[]>({
    queryKey: enabled ? privateBookingKeys.list(userId!, userRole!) : ['private-bookings-disabled'],
    queryFn: () => fetchRawBookingRequests(userId!, userRole!),
    enabled,
    staleTime: 60 * 1000, // 1分
    refetchInterval: 3 * 60 * 1000, // 3分ごとに自動更新（GM回答をリアルタイムに反映）
    // 他画面（スケジュールの中止・削除等）での変更がキャッシュ有効期間内だと
    // 反映されないため、このページを開くたびに必ず再取得する
    // （2026-06-13 C-4テストで「中止直後に確定後キャンセルタブに出ない」が発生）
    refetchOnMount: 'always',
  })

  // 過去分（対応中以外）の GM 回答は、一覧を出した後に読む（#835）。読み終わるまでは回答なしで表示する。
  const historyIds = useMemo(
    () => rawRequests.filter(req => !ACTIVE_STATUSES.has(req.status)).map(req => req.id).sort(),
    [rawRequests],
  )
  const { data: historyGmResponses } = useQuery({
    queryKey: enabled ? privateBookingKeys.gmHistory(userId!, userRole!, historyIds) : ['private-bookings-gm-history-disabled'],
    queryFn: async () => groupByReservationId(await getGmResponses(historyIds)),
    enabled: enabled && historyIds.length > 0,
    staleTime: 60 * 1000,
  })

  // endTime を isCustomHoliday で補正（サーバーデータと分離してキャッシュを壊さない）
  const requests = useMemo<PrivateBookingRequest[]>(() => {
    return rawRequests.map(source => {
      const historyRows = historyGmResponses?.get(source.id)
      const req = historyRows ? { ...source, gm_responses: toDisplayGmResponses(historyRows) } : source
      const candidates = (req.candidate_datetimes?.candidates || []).map((c) => ({
        ...c,
        endTime: getPrivateBookingDisplayEndTime(c.startTime, c.date, req.scenario_timing ?? { duration: 180 }, isCustomHoliday),
      }))
      return { ...req, candidate_datetimes: { ...req.candidate_datetimes, candidates } }
    })
  }, [rawRequests, historyGmResponses, isCustomHoliday])

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

  return { requests, loading, isError, retryRequests: refetch, loadRequests, filterByMonth }
}
