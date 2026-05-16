import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger, privateBookingTrace } from '@/utils/logger'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { fetchScenarioTimingFromDb, getPrivateBookingDisplayEndTime } from '@/lib/privateBookingScenarioTime'
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

/**
 * 貸切リクエストのデータ取得を管理するフック
 */
// モジュールレベルキャッシュ（ページ遷移で消えない、ブラウザリロードで消える）
const cache = {
  data: null as PrivateBookingRequest[] | null,
  userId: null as string | null | undefined,
  fetchedAt: 0,
}
const CACHE_TTL_MS = 60_000 // 60秒間はキャッシュを使う

export function useBookingRequests({ userId, userRole }: UseBookingRequestsProps) {
  const { isCustomHoliday } = useCustomHolidays()

  const hasFreshCache = cache.data !== null
    && cache.userId === userId
    && Date.now() - cache.fetchedAt < CACHE_TTL_MS

  const [requests, setRequests] = useState<PrivateBookingRequest[]>(
    hasFreshCache ? cache.data! : []
  )
  const [loading, setLoading] = useState(!hasFreshCache)

  // 月ごとにフィルタリング
  const filterByMonth = useCallback((reqs: PrivateBookingRequest[], date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    return reqs.filter(req => {
      if (!req.candidate_datetimes?.candidates || req.candidate_datetimes.candidates.length === 0) return false
      const firstCandidate = req.candidate_datetimes.candidates[0]
      const candidateDate = new Date(firstCandidate.date)
      return candidateDate.getFullYear() === year && candidateDate.getMonth() === month
    })
  }, [])

  const loadRequests = useCallback(async (force = false) => {
    try {
      // Auth 復元前に userId / role が undefined のまま走ると、誤ってスタッフ扱いになり空になる
      if (userId == null || userRole == null) {
        privateBookingTrace('ユーザー情報未確定のため取得をスキップ')
        return
      }

      // キャッシュが有効ならスキップ（強制再取得でない場合）
      if (!force && cache.data !== null && cache.userId === userId && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
        privateBookingTrace('キャッシュヒット - 取得をスキップ')
        return
      }

      setLoading(true)

      // admin / license_admin は組織内の全リクエスト（RLS と organization_id で制限）
      const isOrgWideAccess = userRole === 'admin' || userRole === 'license_admin'
      
      // スタッフの場合のみ、自分が担当しているシナリオのIDを取得
      let allowedScenarioIds: string[] | null = null
      
      if (!isOrgWideAccess) {
        privateBookingTrace('スタッフユーザー - 担当シナリオのみ表示')
        
        // ログインユーザーのstaffレコードを取得
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
          
          if (assignments && assignments.length > 0) {
            allowedScenarioIds = assignments.map(a => a.scenario_master_id)
            privateBookingTrace(`${allowedScenarioIds.length}件の担当シナリオを検出`)
          } else {
            privateBookingTrace('担当シナリオなし - 空の結果を返します')
            allowedScenarioIds = [] // 空配列で何も表示しない
          }
        } else {
          privateBookingTrace('スタッフレコード未紐づけ - 空の結果を返します')
          allowedScenarioIds = [] // 空配列で何も表示しない
        }
      } else {
        privateBookingTrace('管理者 / ライセンス管理者 - 組織内の全リクエスト表示')
      }

      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        logger.warn('📋 貸切リクエスト: organization_id を取得できません')
        setRequests([])
        return
      }
      
      // reservationsテーブルから貸切リクエストを取得（private_groupsのinvite_codeとscenario_master_idも含む）
      let query = supabase
        .from('reservations')
        .select(`
          *,
          scenario_masters:scenario_master_id(title, official_duration),
          customers:customer_id(name, phone),
          private_groups:private_group_id(invite_code, scenario_master_id)
        `)
        .eq('organization_id', orgId)
        .eq('reservation_source', RESERVATION_SOURCE.WEB_PRIVATE)
        .order('created_at', { ascending: false })

      // スタッフの場合、担当シナリオのみに絞り込み
      if (allowedScenarioIds !== null) {
        if (allowedScenarioIds.length === 0) {
          setRequests([])
          setLoading(false)
          return
        }
        query = query.in('scenario_master_id', allowedScenarioIds)
      }

      // タブごとに API で絞らない（絞ると他タブの件数が 0 表示になる）。表示は親で activeTab フィルタ。
      query = query.in('status', [...PRIVATE_BOOKING_LIST_STATUSES])

      const { data, error } = await query

      if (error) {
        logger.error('Supabaseエラー:', error)
        throw error
      }

      privateBookingTrace(`取得: ${data?.length ?? 0} 件（organization_id=${orgId}）`)

      const reservationsList = data || []
      const privateGroupIds = [
        ...new Set(
          reservationsList
            .map((r: { private_group_id?: string | null }) => r.private_group_id)
            .filter((id): id is string => Boolean(id))
        ),
      ]
      const joinedMemberCountByGroupId = new Map<string, number>()
      if (privateGroupIds.length > 0) {
        const { data: memberRows, error: memberCountError } = await supabase
          .from('private_group_members')
          .select('group_id')
          .in('group_id', privateGroupIds)
          .eq('status', 'joined')

        if (memberCountError) {
          logger.warn('private_group_members 集計に失敗（参加人数は予約の participant_count のみ表示）:', memberCountError)
        } else {
          for (const row of memberRows || []) {
            const gid = row.group_id as string
            joinedMemberCountByGroupId.set(gid, (joinedMemberCountByGroupId.get(gid) || 0) + 1)
          }
        }
      }

      // ── バッチ取得 ① シナリオ情報（duration含む）──────────────────────────────
      const masterIdsForGmCount = [
        ...new Set(
          reservationsList
            .map((r: { scenario_master_id?: string; private_groups?: { scenario_master_id?: string } }) =>
              r.scenario_master_id || r.private_groups?.scenario_master_id
            )
            .filter(Boolean)
        ),
      ] as string[]
      const gmCountByMasterId = new Map<string, number>()
      const playerRangeByMasterId = new Map<string, { min: number; max: number }>()
      const scenarioTimingByMasterId = new Map<string, { duration: number; weekend_duration: number | null; extra_preparation_time: number; private_booking_time_slots?: unknown }>()

      if (masterIdsForGmCount.length > 0) {
        const { data: viewRows } = await supabase
          .from('organization_scenarios_with_master')
          .select('scenario_master_id, gm_count, player_count_min, player_count_max, duration, weekend_duration, extra_preparation_time, private_booking_time_slots')
          .eq('organization_id', orgId)
          .in('scenario_master_id', masterIdsForGmCount)

        for (const row of viewRows || []) {
          if (!row.scenario_master_id) continue
          gmCountByMasterId.set(row.scenario_master_id, resolveStaffProfileGmSlotCount({ gm_count: row.gm_count }))
          const pMin = row.player_count_min
          const pMax = row.player_count_max
          if (typeof pMin === 'number' && typeof pMax === 'number' && pMin > 0 && pMax >= pMin) {
            playerRangeByMasterId.set(row.scenario_master_id, { min: pMin, max: pMax })
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
      }

      // ── バッチ取得 ② GM回答（全予約まとめて1クエリ）──────────────────────────
      const allReservationIds = reservationsList.map((r: { id: string }) => r.id)
      const gmResponsesByReservationId = new Map<string, any[]>()
      if (allReservationIds.length > 0) {
        const { data: allGmResponses } = await supabase
          .from('gm_availability_responses')
          .select('reservation_id, staff_id, gm_name, response_status, available_candidates, selected_candidate_index, notes, response_datetime, responded_at, updated_at, created_at, staff:staff_id(name, avatar_color)')
          .in('reservation_id', allReservationIds)
        for (const gm of allGmResponses || []) {
          const rid = gm.reservation_id as string
          if (!gmResponsesByReservationId.has(rid)) gmResponsesByReservationId.set(rid, [])
          gmResponsesByReservationId.get(rid)!.push(gm)
        }
      }

      // ── バッチ取得 ③ 候補日（全グループまとめて1クエリ）──────────────────────
      const candidateDatesByGroupId = new Map<string, any[]>()
      if (privateGroupIds.length > 0) {
        const { data: allCandidateDates } = await supabase
          .from('private_group_candidate_dates')
          .select('group_id, id, date, time_slot, start_time, end_time, status')
          .in('group_id', privateGroupIds)
          .order('date', { ascending: true })
        for (const cd of allCandidateDates || []) {
          if (cd.status === 'rejected') continue
          const gid = cd.group_id as string
          if (!candidateDatesByGroupId.has(gid)) candidateDatesByGroupId.set(gid, [])
          candidateDatesByGroupId.get(gid)!.push(cd)
        }
      }

      // ── マップ参照のみで各予約を組み立て（追加クエリなし）─────────────────────
      const formattedData: PrivateBookingRequest[] = reservationsList.map((req: any) => {
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
          const cachedTiming = scenarioMasterId ? scenarioTimingByMasterId.get(scenarioMasterId) : undefined
          let scenario_timing = cachedTiming ?? {
            duration: typeof req.scenario_masters?.official_duration === 'number' && req.scenario_masters.official_duration > 0
              ? req.scenario_masters.official_duration
              : 180,
            weekend_duration: null,
            extra_preparation_time: 0,
          }

          const candidatesWithScenarioEnd = (candidateDatetimes.candidates || []).map((c: any) => ({
            ...c,
            endTime: getPrivateBookingDisplayEndTime(c.startTime, c.date, scenario_timing, isCustomHoliday),
          }))
          candidateDatetimes = { ...candidateDatetimes, candidates: candidatesWithScenarioEnd }

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
            gm_responses: transformedGMResponses,
            created_at: req.created_at,
            invite_code: req.private_groups?.invite_code || '',
          }
        })

      setRequests(formattedData)
      // キャッシュを更新
      cache.data = formattedData
      cache.userId = userId
      cache.fetchedAt = Date.now()
    } catch (error) {
      logger.error('貸切リクエスト取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [userId, userRole, isCustomHoliday])

  return {
    requests,
    loading,
    loadRequests,
    filterByMonth
  }
}

