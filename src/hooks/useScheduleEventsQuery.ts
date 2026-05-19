/**
 * スケジュールイベントの React Query フック
 *
 * - staleTime: Infinity → タイマー再フェッチなし（Realtime が更新を担当）
 * - gcTime: 1時間 → 画面切り替え後もメモリに残り即表示
 * - queryClient.invalidateQueries → Realtime / 操作後の明示的更新
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { scheduleApi, scenarioApi } from '@/lib/api'
import { getScenarioAliases } from '@/lib/api/scenarioAliasApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { supabase } from '@/lib/supabase'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { logger } from '@/utils/logger'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff } from '@/types'

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const scheduleEventKeys = {
  all: ['scheduleEvents'] as const,
  month: (year: number, month: number) => ['scheduleEvents', year, month] as const,
}

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

interface RawEventData {
  id: string
  date: string
  store_id: string
  scenario?: string
  scenarios?: { id: string; title: string; player_count_max?: number } | { id: string; title: string; player_count_max?: number }[] | null
  scenario_masters?: { id: string; title: string; player_count_max?: number } | { id: string; title: string; player_count_max?: number }[] | null
  gms: string[]
  gm_roles?: Record<string, string>
  start_time: string
  end_time: string
  category: string
  is_cancelled: boolean
  is_tentative?: boolean
  current_participants?: number
  capacity: number
  notes?: string
  is_reservation_enabled: boolean
  time_slot?: string
  reservation_name?: string
  reservation_id?: string
  is_reservation_name_overwritten?: boolean
}

interface CandidateDateTime {
  date: string
  startTime?: string
  endTime?: string
  order: number
  status?: 'confirmed' | 'pending'
  confirmedStore?: string
}

interface PrivateRequestData {
  id: string
  title: string
  status: string
  store_id: string
  gm_staff?: string
  participant_count: number
  customer_name?: string
  display_customer_name?: string
  candidate_datetimes?: {
    candidates: CandidateDateTime[]
    confirmedStore?: { storeId: string; storeName?: string }
  }
  scenario_masters?: { title: string; player_count_max: number }
  customers?: { nickname?: string }
}

// ---------------------------------------------------------------------------
// シナリオモジュールキャッシュ（同セッション内で月をまたいで再利用）
// ---------------------------------------------------------------------------

let _scenarioModuleCache: any[] = []

// ---------------------------------------------------------------------------
// 純粋なデータ取得関数（queryFn として使用）
// ---------------------------------------------------------------------------

export async function fetchScheduleEventsForMonth(
  year: number,
  month: number
): Promise<ScheduleEvent[]> {
  // GM名前解決用のスタッフ情報を sessionStorage から取得
  const staffForGm: Staff[] = (() => {
    try {
      const raw = sessionStorage.getItem('scheduleStaff')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })()

  // スケジュール取得とエイリアスマッピングを並列で実行
  const [data, SCENARIO_ALIAS] = await Promise.all([
    scheduleApi.getByMonth(year, month),
    getScenarioAliases(),
  ]) as [RawEventData[], Record<string, string>]

  // シナリオリスト（モジュールキャッシュを優先）
  let scenarioList = _scenarioModuleCache
  if (!scenarioList.length) {
    scenarioList = await scenarioApi.getAll()
    _scenarioModuleCache = scenarioList
  }
  const scenarioByTitle = new Map<string, any>()
  scenarioList.forEach((s: any) => scenarioByTitle.set(s.title, s))

  const normalize = (s: string) => s.replace(/[\s\-・／/]/g, '').toLowerCase()

  const findScenario = (eventScenario: string) => {
    const mapped = SCENARIO_ALIAS[eventScenario] || eventScenario
    const norm = normalize(mapped)
    if (scenarioByTitle.has(mapped)) return scenarioByTitle.get(mapped)
    if (scenarioByTitle.has(eventScenario)) return scenarioByTitle.get(eventScenario)
    for (const [t, s] of scenarioByTitle.entries()) {
      if (normalize(t) === norm) return s
    }
    for (const [t, s] of scenarioByTitle.entries()) {
      if (t.includes(mapped) || mapped.includes(t)) return s
    }
    for (const [t, s] of scenarioByTitle.entries()) {
      const nt = normalize(t)
      if (nt.includes(norm) || norm.includes(nt)) return s
    }
    const kws = eventScenario.split(/[\s\-・／/]/).filter(k => k.length > 0)
    for (const [t, s] of scenarioByTitle.entries()) {
      const nt = normalize(t)
      if (kws.every(kw => nt.includes(normalize(kw))) && kws.length >= 1) return s
    }
    return null
  }

  // 通常公演をフォーマット
  const formattedEvents = data.map((event: RawEventData) => {
    const rawScenarioData = event.scenario_masters || event.scenarios
    const scenarioData = Array.isArray(rawScenarioData) ? rawScenarioData[0] : rawScenarioData
    const scenarioTitle = scenarioData?.title || event.scenario || ''
    const isValidScenario = scenarioData && scenarioData.id
    const scenarioInfo = isValidScenario ? scenarioData : (scenarioTitle ? findScenario(scenarioTitle) : null)
    const orgScenarioInfo = scenarioTitle ? findScenario(scenarioTitle) : null
    const effectivePlayerMax = orgScenarioInfo?.player_count_max || scenarioInfo?.player_count_max

    return {
      id: event.id,
      date: event.date,
      venue: event.store_id,
      scenario: scenarioTitle,
      scenarios: scenarioInfo ? {
        id: scenarioInfo.id,
        title: scenarioInfo.title,
        player_count_max: effectivePlayerMax || scenarioInfo.player_count_max,
      } : undefined,
      gms: event.gms || [],
      gm_roles: event.gm_roles || {},
      start_time: event.start_time,
      end_time: event.end_time,
      category: event.category,
      is_cancelled: event.is_cancelled || false,
      is_tentative: event.is_tentative || false,
      current_participants: event.current_participants || 0,
      max_participants: effectivePlayerMax || event.capacity || 8,
      notes: event.notes || '',
      is_reservation_enabled: event.is_reservation_enabled || false,
      time_slot: event.time_slot,
      reservation_name: event.reservation_name || '',
      is_reservation_name_overwritten: event.is_reservation_name_overwritten || false,
      reservation_id: event.reservation_id,
    } as ScheduleEvent
  })

  // ニックネーム取得 / 貸切リクエスト取得を並列実行
  const reservationIdsForNickname = formattedEvents
    .filter(e => e.reservation_id && !e.is_reservation_name_overwritten)
    .map(e => e.reservation_id!)

  const orgId = await getCurrentOrganizationId()

  const privateQueryBase = supabase
    .from('reservations')
    .select(`
      id, title, customer_name, display_customer_name, status, store_id,
      gm_staff, candidate_datetimes, participant_count, schedule_event_id,
      scenario_masters:scenario_master_id ( title, player_count_max ),
      customers:customer_id ( nickname )
    `)
    .eq('reservation_source', RESERVATION_SOURCE.WEB_PRIVATE)
    .eq('status', 'confirmed')
    .is('schedule_event_id', null)

  const [nicknameResult, privateResult] = await Promise.all([
    reservationIdsForNickname.length > 0
      ? supabase
          .from('reservations')
          .select('id, customer_name, display_customer_name, customers:customer_id(nickname)')
          .in('id', reservationIdsForNickname)
      : Promise.resolve({ data: null as any, error: null }),
    orgId ? privateQueryBase.eq('organization_id', orgId) : privateQueryBase,
  ])

  if (nicknameResult.data) {
    const nicknameMap = new Map<string, string>()
    nicknameResult.data.forEach((r: any) => {
      const nickname = r.display_customer_name || r.customers?.nickname
      if (nickname) nicknameMap.set(r.id, nickname)
    })
    formattedEvents.forEach(e => {
      if (e.reservation_id && nicknameMap.has(e.reservation_id)) {
        e.reservation_name = nicknameMap.get(e.reservation_id)!
      }
    })
  }

  const { data: privateRequests, error: privateError } = privateResult
  if (privateError) logger.error('貸切リクエスト取得エラー:', privateError)

  const privateEvents: ScheduleEvent[] = []
  if (privateRequests) {
    (privateRequests as unknown as PrivateRequestData[]).forEach(request => {
      if (!request.candidate_datetimes?.candidates) return

      let gmNames: string[] = []
      if (request.gm_staff && staffForGm.length > 0) {
        const found = staffForGm.find(s => s.id === request.gm_staff)
        if (found) gmNames = [found.name]
      }
      if (!gmNames.length) gmNames = ['未定']

      let candidatesToShow = request.candidate_datetimes.candidates
      if (request.status === 'confirmed') {
        const confirmed = candidatesToShow.filter(c => c.status === 'confirmed')
        candidatesToShow = confirmed.length > 0 ? confirmed.slice(0, 1) : candidatesToShow.slice(0, 1)
      }

      candidatesToShow.forEach(candidate => {
        const d = new Date(candidate.date)
        if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return

        const confirmedStoreId = request.candidate_datetimes?.confirmedStore?.storeId || request.store_id
        const venueId =
          (request.status === 'confirmed' || request.status === 'gm_confirmed') && confirmedStoreId
            ? confirmedStoreId
            : ''

        const privateScenarioTitle = request.scenario_masters?.title || request.title
        const orgPrivateScenario = findScenario(privateScenarioTitle)
        const privateMax = orgPrivateScenario?.player_count_max || request.scenario_masters?.player_count_max || 8

        privateEvents.push({
          id: `${request.id}-${candidate.order}`,
          date: candidate.date,
          venue: venueId,
          scenario: privateScenarioTitle,
          gms: gmNames,
          start_time: candidate.startTime || '',
          end_time: candidate.endTime || '',
          category: 'private',
          is_cancelled: false,
          current_participants: request.participant_count || 0,
          max_participants: privateMax,
          notes: `【貸切${request.status === 'confirmed' ? '確定' : request.status === 'gm_confirmed' ? 'GM確認済' : '希望'}】`,
          is_reservation_enabled: true,
          is_private_request: true,
          reservation_info:
            request.status === 'confirmed' ? '確定' : request.status === 'gm_confirmed' ? '店側確認待ち' : 'GM確認待ち',
          reservation_id: request.id,
          reservation_name:
            request.display_customer_name || request.customers?.nickname || request.customer_name || '',
          original_customer_name: request.customer_name || '',
          is_reservation_name_overwritten: !!request.display_customer_name,
        } as ScheduleEvent)
      })
    })
  }

  // schedule_events 側に既に登録済みの貸切を除外
  const existingReservationIds = new Set(
    formattedEvents.filter(e => e.reservation_id).map(e => e.reservation_id)
  )
  const filteredPrivate = privateEvents.filter(pe => !existingReservationIds.has(pe.reservation_id))

  logger.log(
    `✅ fetchScheduleEventsForMonth: ${formattedEvents.length + filteredPrivate.length}件（${privateEvents.length - filteredPrivate.length}件重複除外）`
  )

  return [...formattedEvents, ...filteredPrivate] as ScheduleEvent[]
}

// ---------------------------------------------------------------------------
// React Query フック
// ---------------------------------------------------------------------------

export function useScheduleEventsQuery(currentDate: Date) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  return useQuery({
    queryKey: scheduleEventKeys.month(year, month),
    queryFn: () => fetchScheduleEventsForMonth(year, month),
    // Realtime が変更をプッシュするため自動タイマー再フェッチは不要
    staleTime: Infinity,
    // メモリ上は無期限保持（IndexedDB が14日間を担保）
    gcTime: Infinity,
    // ウィンドウフォーカス時に必ずバックグラウンド再取得
    // → スリープ復帰・長時間離席後に古いデータが残らない
    refetchOnWindowFocus: 'always',
    // ネットワーク復帰時も必ず再取得（Realtime 切断中の変更を補完）
    refetchOnReconnect: 'always',
  })
}

// ---------------------------------------------------------------------------
// キャッシュ更新ヘルパー（Realtime・操作後の無効化）
// ---------------------------------------------------------------------------

/** Realtime 変更を検知したときに呼ぶ。既存データを表示したまま裏で再フェッチ */
export function invalidateScheduleMonth(
  queryClient: QueryClient,
  year: number,
  month: number
): void {
  queryClient.invalidateQueries({ queryKey: scheduleEventKeys.month(year, month) })
}

/** 楽観的更新（削除・中止など即時反映したいとき） */
export function setScheduleMonthData(
  queryClient: QueryClient,
  year: number,
  month: number,
  updater: ScheduleEvent[] | ((prev: ScheduleEvent[]) => ScheduleEvent[])
): void {
  queryClient.setQueryData<ScheduleEvent[]>(
    scheduleEventKeys.month(year, month),
    prev => {
      const current = prev ?? []
      return typeof updater === 'function' ? updater(current) : updater
    }
  )
}

/** シナリオモジュールキャッシュを外部から更新する（シナリオ追加後など） */
export function updateScenarioModuleCache(scenarios: any[]): void {
  _scenarioModuleCache = scenarios
}
