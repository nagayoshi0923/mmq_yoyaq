import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger, privateBookingTrace } from '@/utils/logger'
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
export function useBookingRequests({ userId, userRole }: UseBookingRequestsProps) {
  const { isCustomHoliday } = useCustomHolidays()
  const [requests, setRequests] = useState<PrivateBookingRequest[]>([])
  const [loading, setLoading] = useState(true)

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

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true)

      // Auth 復元前に userId / role が undefined のまま走ると、誤ってスタッフ扱いになり空になる
      if (userId == null || userRole == null) {
        privateBookingTrace('ユーザー情報未確定のため取得をスキップ')
        return
      }

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
          // 担当シナリオのIDを取得（staff_scenario_assignments.scenario_id = scenario_master_id）
          const { data: assignments } = await supabase
            .from('staff_scenario_assignments')
            .select('scenario_id')
            .eq('staff_id', staffData.id)
          
          if (assignments && assignments.length > 0) {
            // scenario_id は scenario_master_id を参照
            allowedScenarioIds = assignments.map(a => a.scenario_id)
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
      
      // reservationsテーブルから貸切リクエストを取得（private_groupsのinvite_codeとscenario_idも含む）
      let query = supabase
        .from('reservations')
        .select(`
          *,
          scenario_masters:scenario_master_id(title, official_duration),
          customers:customer_id(name, phone),
          private_groups:private_group_id(invite_code, scenario_id, target_participant_count)
        `)
        .eq('organization_id', orgId)
        .eq('reservation_source', 'web_private')
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

      const masterIdsForGmCount = [
        ...new Set(
          reservationsList
            .map((r: { scenario_master_id?: string; private_groups?: { scenario_id?: string } }) =>
              r.scenario_master_id || r.private_groups?.scenario_id
            )
            .filter(Boolean)
        ),
      ] as string[]
      const gmCountByMasterId = new Map<string, number>()
      const playerRangeByMasterId = new Map<string, { min: number; max: number }>()
      if (masterIdsForGmCount.length > 0) {
        const { data: smPlayerRows } = await supabase
          .from('scenario_masters')
          .select('id, player_count_min, player_count_max')
          .in('id', masterIdsForGmCount)

        const smById = new Map(
          (smPlayerRows || []).map((s) => [s.id as string, s])
        )

        const { data: osRows } = await supabase
          .from('organization_scenarios')
          .select(
            'scenario_master_id, gm_count, override_player_count_min, override_player_count_max'
          )
          .eq('organization_id', orgId)
          .in('scenario_master_id', masterIdsForGmCount)

        for (const row of osRows || []) {
          if (!row.scenario_master_id) continue
          gmCountByMasterId.set(
            row.scenario_master_id,
            resolveStaffProfileGmSlotCount({ gm_count: row.gm_count })
          )
          const sm = smById.get(row.scenario_master_id)
          const pMin =
            row.override_player_count_min ?? sm?.player_count_min ?? null
          const pMax =
            row.override_player_count_max ?? sm?.player_count_max ?? null
          if (
            typeof pMin === 'number' &&
            typeof pMax === 'number' &&
            pMin > 0 &&
            pMax >= pMin
          ) {
            playerRangeByMasterId.set(row.scenario_master_id, {
              min: pMin,
              max: pMax,
            })
          }
        }

        for (const masterId of masterIdsForGmCount) {
          if (playerRangeByMasterId.has(masterId)) continue
          const sm = smById.get(masterId)
          if (
            sm &&
            typeof sm.player_count_min === 'number' &&
            typeof sm.player_count_max === 'number' &&
            sm.player_count_min > 0 &&
            sm.player_count_max >= sm.player_count_min
          ) {
            playerRangeByMasterId.set(masterId, {
              min: sm.player_count_min,
              max: sm.player_count_max,
            })
          }
        }
      }

      // 各リクエストに対してGM回答を取得
      const formattedData: PrivateBookingRequest[] = await Promise.all(
        reservationsList.map(async (req: any) => {
          // GM回答を別途取得（スタッフのavatar_colorと名前も含める）
          const { data: gmResponses } = await supabase
            .from('gm_availability_responses')
            .select(
              'staff_id, gm_name, response_status, available_candidates, selected_candidate_index, notes, response_datetime, responded_at, updated_at, created_at, staff:staff_id(name, avatar_color)'
            )
            .eq('reservation_id', req.id)

          // GM名がnullの場合はスタッフテーブルの名前を使用。表示は回答が早い順
          const transformedGMResponses = sortGmResponsesByReplyTime(
            (gmResponses || []).filter((gm: any) => shouldIncludeGmResponseRow(gm)).map((gm: any) => ({
              ...gm,
              gm_name: gm.gm_name || gm.staff?.name || '',
            }))
          )
          
          // 確定済み予約で候補日が1つしかない場合、元の候補日をprivate_group_candidate_datesから復元
          let candidateDatetimes = req.candidate_datetimes || { candidates: [] }
          const currentCandidates = candidateDatetimes.candidates || []
          
          // private_group_idがある場合、元の候補日を取得
          let originalCandidates: any[] = []
          if (req.private_group_id) {
            const { data: candidateDatesData } = await supabase
              .from('private_group_candidate_dates')
              .select('id, date, time_slot, start_time, end_time, status')
              .eq('group_id', req.private_group_id)
              .order('date', { ascending: true })

            // 店舗却下などで rejected になった候補は申請対象外（復元・表示に含めない）
            originalCandidates = (candidateDatesData || []).filter(
              (cd: { status?: string | null }) => cd.status !== 'rejected'
            )
          }
          
          privateBookingTrace(
            `予約 ${req.id}: 現在の候補数=${currentCandidates.length}, 元の候補数=${originalCandidates.length}`
          )
          
          // 元の候補日が多い場合は復元
          if (originalCandidates.length > currentCandidates.length) {
            privateBookingTrace(`候補日を復元: ${originalCandidates.map((c: any) => c.date).join(', ')}`)
            // 確定された候補を特定
            const confirmedCandidate = currentCandidates.find((c: any) => c.status === 'confirmed')
            
            // 元の候補日をcandidate_datetimes形式に変換
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
                status: isConfirmed ? 'confirmed' : 'pending'
              }
            })
            
            candidateDatetimes = {
              ...candidateDatetimes,
              candidates: restoredCandidates
            }
          }
          
          // scenario_master_id のフォールバック: private_groups.scenario_id を使用
          const scenarioMasterId = req.scenario_master_id || req.private_groups?.scenario_id
          if (!scenarioMasterId) {
            privateBookingTrace(
              `予約 ${req.id}: scenario_master_id 未設定（private_groups.scenario_id も未設定）`
            )
          }

          let scenario_timing = await fetchScenarioTimingFromDb(supabase, {
            organizationId: orgId,
            scenarioLookupId: req.scenario_id,
            scenarioMasterId,
          })
          if (
            (!scenario_timing.duration || scenario_timing.duration <= 0) &&
            typeof req.scenario_masters?.official_duration === 'number' &&
            req.scenario_masters.official_duration > 0
          ) {
            scenario_timing = {
              duration: req.scenario_masters.official_duration,
              weekend_duration: scenario_timing.weekend_duration,
              extra_preparation_time: scenario_timing.extra_preparation_time,
            }
          }

          const candidatesWithScenarioEnd = (candidateDatetimes.candidates || []).map((c: any) => ({
            ...c,
            endTime: getPrivateBookingDisplayEndTime(
              c.startTime,
              c.date,
              scenario_timing,
              isCustomHoliday
            ),
          }))
          candidateDatetimes = {
            ...candidateDatetimes,
            candidates: candidatesWithScenarioEnd,
          }

          const pgId = req.private_group_id as string | undefined | null
          const joinedN = pgId ? (joinedMemberCountByGroupId.get(pgId) ?? 0) : undefined

          return {
            id: req.id,
            reservation_number: req.reservation_number || '',
            scenario_id: req.scenario_id,
            scenario_master_id: scenarioMasterId,
            required_gm_count: scenarioMasterId
              ? (gmCountByMasterId.get(scenarioMasterId) ?? 1)
              : 1,
            scenario_timing,
            scenario_title: req.scenario_masters?.title || req.title || 'シナリオ名不明',
            customer_name: req.customers?.name || '顧客名不明',
            customer_email: req.customer_email || '',
            customer_phone: req.customers?.phone || req.customer_phone || '',
            candidate_datetimes: candidateDatetimes,
            participant_count: req.participant_count || 0,
            joined_member_count: pgId !== undefined && pgId !== null ? joinedN : undefined,
            scenario_player_count_range: scenarioMasterId
              ? playerRangeByMasterId.get(scenarioMasterId) ?? null
              : null,
            notes: req.customer_notes || '',
            status: req.status,
            gm_responses: transformedGMResponses,
            created_at: req.created_at,
            invite_code: req.private_groups?.invite_code || ''
          }
        })
      )

      setRequests(formattedData)
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

