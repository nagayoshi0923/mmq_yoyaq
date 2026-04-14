/**
 * スケジュール関連API
 * 
 * 公演スケジュールの取得・作成・更新・削除を行う
 */
import { supabase } from '../supabase'
import { logger } from '@/utils/logger'
import { getCurrentOrganizationId } from '@/lib/organization'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { ACTIVE_RESERVATION_STATUSES, ACTIVE_RESERVATION_STATUSES_SET, RESERVATION_SOURCE } from '@/lib/constants'

// 候補日時の型定義
interface CandidateDateTime {
  order: number
  date: string
  startTime?: string
  endTime?: string
  status?: 'confirmed' | 'pending' | 'rejected'
  timeSlot?: string
}

// スケジュールイベントの型定義
interface ScheduleEvent {
  id: string
  date: string
  venue: string
  store_id: string
  scenario: string
  scenario_master_id?: string
  start_time: string
  end_time: string
  category: string
  is_cancelled: boolean
  is_reservation_enabled: boolean
  current_participants: number
  max_participants: number
  capacity: number
  gms: string[]
  gm_roles?: Record<string, string>
  stores?: unknown
  scenarios?: unknown
  is_private_booking?: boolean
  timeSlot?: string
}

/**
 * organization_scenarios_with_master ビューから player_count_max を取得し、
 * scenario_master_id と title の両方でルックアップできる Map を返す。
 * scenario_masters の値ではなく、組織オーバーライドを反映した正しい値を取得する。
 */
async function getOrgScenarioPlayerCounts(organizationId?: string | null): Promise<Map<string, number>> {
  const orgId = organizationId || await getCurrentOrganizationId()
  if (!orgId) return new Map()

  const { data } = await supabase
    .from('organization_scenarios_with_master')
    .select('id, title, player_count_max')
    .eq('organization_id', orgId)

  const map = new Map<string, number>()
  if (data) {
    for (const row of data as { id: string; title: string; player_count_max: number }[]) {
      if (row.player_count_max) {
        map.set(row.id, row.player_count_max)
        if (row.title) {
          map.set(row.title, row.player_count_max)
        }
      }
    }
  }
  return map
}

/**
 * イベントの正しい最大参加者数を解決する。
 * 優先順位: org override (by id) → org override (by title) → master JOIN → event fields → fallback
 */
function resolveMaxParticipants(
  event: { scenario_master_id?: string | null; scenario?: string; scenario_masters?: unknown; max_participants?: number; capacity?: number },
  orgScenarioMap: Map<string, number>
): number {
  if (event.scenario_master_id && orgScenarioMap.has(event.scenario_master_id)) {
    return orgScenarioMap.get(event.scenario_master_id)!
  }
  if (event.scenario && orgScenarioMap.has(event.scenario)) {
    return orgScenarioMap.get(event.scenario)!
  }
  const scenarioData = event.scenario_masters as { player_count_max?: number } | null
  if (scenarioData?.player_count_max) {
    return scenarioData.player_count_max
  }
  return event.max_participants || event.capacity || 8
}

// シナリオ名のエイリアスマッピング（表記ゆれ対応）
const SCENARIO_ALIAS: Record<string, string> = {
  '真渋谷陰陽奇譚': '真・渋谷陰陽奇譚',
  '真渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
  '渋谷陰陽奇譚': '真・渋谷陰陽奇譚',
  '渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
  '真・渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
  '土牢の悲鳴に谺して': '土牢に悲鳴は谺して',
  '百鬼の夜月光の影': '百鬼の夜、月光の影',
  'インビジブル亡霊列車': 'Invisible-亡霊列車-',
  'くずの葉の森': 'くずの葉のもり',
  'ドクターテラスの秘密の実験': 'ドクター・テラスの秘密の実験',
  'あるミステリーについて': 'あるマーダーミステリーについて',
  'MurderWonderLand': 'リアルマダミス-MurderWonderLand',
  'GROLIAMEMORIES': 'グロリアメモリーズ',
  '募SORCIER': 'SORCIER〜賢者達の物語〜',
  'SORCIER': 'SORCIER〜賢者達の物語〜',
  'ソルシエ': 'SORCIER〜賢者達の物語〜',
  '藍雨': '藍雨廻逢',
  "THEREALFOLK'30s": "TheRealFork30's",
  'THEREALFOLK': "TheRealFork30's",
  'TheRealFolk': "TheRealFork30's",
  'トレタリ': '超特急の呪いの館で撮れ高足りてますか？',
  'さきこさん': '裂き子さん',
  '廻る弾丸輪舞': '廻る弾丸輪舞（ダンガンロンド）',
  '狂気山脈1': '狂気山脈　陰謀の分水嶺（１）',
  '狂気山脈2': '狂気山脈　星降る天辺（２）',
  '狂気山脈3': '狂気山脈　薄明三角点（３）',
  '狂気山脈2.5': '狂気山脈　2.5　頂上戦争',
}

// シナリオ名を正規化（プレフィックス除去等）
function normalizeScenarioName(name: string): string {
  return name
    .replace(/^["「『📗📕]/, '')
    .replace(/["」』]$/, '')
    .replace(/^貸・/, '')
    .replace(/^募・/, '')
    .replace(/^🈵・/, '')
    .replace(/^GMテスト・/, '')
    .replace(/^打診・/, '')
    .replace(/^仮/, '')
    .replace(/^（仮）/, '')
    .replace(/^\(仮\)/, '')
    .replace(/\(.*?\)$/, '')
    .replace(/（.*?）$/, '')
    .trim()
}

function removeMissingScheduleColumn(
  payload: Record<string, unknown>,
  error: { message?: string; details?: string; hint?: string } | null
): { nextPayload: Record<string, unknown>; removedColumn?: string } | null {
  if (!error) return null

  const combined = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
  const patterns = [
    /column "([^"]+)" of relation "schedule_events" does not exist/i,
    /Could not find the '([^']+)' column of 'schedule_events'/i
  ]

  for (const pattern of patterns) {
    const match = combined.match(pattern)
    if (match?.[1]) {
      const missingColumn = match[1]
      if (missingColumn in payload) {
        const nextPayload = { ...payload }
        delete nextPayload[missingColumn]
        return { nextPayload, removedColumn: missingColumn }
      }
    }
  }

  return null
}

// シナリオ名から自動でマッチングして scenario_masters の id と正式名称を返す
async function findMatchingScenario(scenarioName: string | undefined): Promise<{ id: string; title: string } | null> {
  if (!scenarioName || scenarioName.trim() === '') return null
  
  const cleanName = normalizeScenarioName(scenarioName)
  if (cleanName.length < 2) return null
  
  // エイリアスマッピングを適用
  let searchName = cleanName
  if (SCENARIO_ALIAS[cleanName]) {
    searchName = SCENARIO_ALIAS[cleanName]
  }
  // 部分一致でエイリアスを探す
  for (const [alias, formal] of Object.entries(SCENARIO_ALIAS)) {
    if (cleanName.includes(alias)) {
      searchName = formal
      break
    }
  }
  
  // シナリオマスタから検索
  const { data: scenarios } = await supabase
    .from('scenario_masters')
    .select('id, title')
  
  if (!scenarios || scenarios.length === 0) return null
  
  // 1. 完全一致
  let match = scenarios.find(s => s.title === searchName)
  
  // 2. 前方一致
  if (!match) {
    match = scenarios.find(s => s.title.startsWith(searchName))
  }
  
  // 3. シナリオタイトルが入力に含まれている
  if (!match) {
    match = scenarios.find(s => searchName.includes(s.title))
  }
  
  // 4. 入力がシナリオタイトルに含まれている（4文字以上）
  if (!match && searchName.length >= 4) {
    match = scenarios.find(s => s.title.includes(searchName))
  }
  
  return match || null
}

// 公演スケジュール関連のAPI
export const scheduleApi = {
  // 自分のスケジュールを取得（期間指定）
  async getMySchedule(staffName: string, startDate: string, endDate: string) {
    // 組織フィルタ用
    const orgId = await getCurrentOrganizationId()
    
    // 1. GM（メインGM/サブGM）として割り当てられた公演を取得
    let gmQuery = supabase
      .from('schedule_events_staff_view')
      .select(`
        *,
        stores:store_id (
          id,
          name,
          short_name,
          color,
          address
        ),
        scenario_masters:scenario_master_id (
          id,
          title,
          player_count_max,
          official_duration,
          genre
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .contains('gms', [staffName])
      .eq('is_cancelled', false)
    
    if (orgId) {
      gmQuery = gmQuery.eq('organization_id', orgId)
    }
    
    const { data: gmEvents, error: gmError } = await gmQuery
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
    
    if (gmError) throw gmError
    
    // 2. スタッフ参加（予約）として登録された公演を取得
    let resQuery = supabase
      .from('reservations')
      .select(`
        schedule_event_id,
        schedule_events!inner (
          *,
          stores:store_id (
            id,
            name,
            short_name,
            color,
            address
          ),
          scenario_masters:scenario_master_id (
            id,
            title,
            player_count_max,
            official_duration,
            genre
          )
        )
      `)
      .contains('participant_names', [staffName])
      .eq('payment_method', 'staff')
        .in('status', ['confirmed', 'pending', 'gm_confirmed', 'checked_in'])
      
      if (orgId) {
        resQuery = resQuery.eq('organization_id', orgId)
      }
      
      const { data: staffReservations } = await resQuery
    
    // スタッフ参加の公演を抽出（日付フィルタリング）
    type JoinedScheduleEvent = { id: string; date: string; start_time: string; is_cancelled: boolean; scenario_masters?: unknown; max_participants?: number; capacity?: number; [key: string]: unknown }
    const staffEvents = (staffReservations || [])
      .map(r => r.schedule_events as unknown as JoinedScheduleEvent)
      .filter((event): event is JoinedScheduleEvent => 
        event !== null && 
        event.date >= startDate && 
        event.date <= endDate && 
        !event.is_cancelled
      )
    
    // 3. 重複を除去してマージ（GMとスタッフ参加の両方に含まれる場合）
    const eventMap = new Map<string, JoinedScheduleEvent>()
    gmEvents.forEach(event => eventMap.set(event.id, event as unknown as JoinedScheduleEvent))
    staffEvents.forEach(event => {
      if (event && !eventMap.has(event.id)) {
        eventMap.set(event.id, event)
      }
    })
    const scheduleEvents = Array.from(eventMap.values())
    
    // 4. イベントの参加者数を取得・計算
    const eventIds = scheduleEvents.map(e => e.id)
    const reservationsMap = new Map<string, { participant_count: number }[]>()
    
    if (eventIds.length > 0) {
      const BATCH_SIZE = 100
      const allReservations: Array<{ schedule_event_id: string; participant_count: number; status: string }> = []
      
      for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
        const batchIds = eventIds.slice(i, i + BATCH_SIZE)
        let allResQuery = supabase
          .from('reservations')
          .select('schedule_event_id, participant_count, status')
          .in('schedule_event_id', batchIds)
          .in('status', ['confirmed', 'pending', 'gm_confirmed', 'checked_in'])
        
        if (orgId) {
          allResQuery = allResQuery.eq('organization_id', orgId)
        }
        
        const { data, error: reservationError } = await allResQuery
        if (!reservationError && data) {
          allReservations.push(...(data as typeof allReservations))
        }
      }
      
      allReservations.forEach(reservation => {
        const eventId = reservation.schedule_event_id
        if (!reservationsMap.has(eventId)) {
          reservationsMap.set(eventId, [])
        }
        reservationsMap.get(eventId)!.push(reservation)
      })
    }

    const orgScenarioMap = await getOrgScenarioPlayerCounts(orgId)

    const myEvents = scheduleEvents.map(event => {
      const reservations = reservationsMap.get(event.id) || []
      const actualParticipants = reservations.reduce((sum, r) => sum + (r.participant_count || 0), 0)
      
      const maxParticipants = resolveMaxParticipants(event, orgScenarioMap)

      return {
        ...event,
        current_participants: actualParticipants,
        max_participants: maxParticipants,
        capacity: maxParticipants,
        is_private_booking: false
      }
    })
    
    // 日付・時間順でソート
    return myEvents.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.start_time.localeCompare(b.start_time)
    })
  },

  // 指定月の公演を取得（通常公演 + 確定した貸切公演）
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  // skipOrgFilter: trueの場合、組織フィルタをスキップ（全組織のデータを取得）
  // skipPrivateBookings: trueの場合、確定貸切予約のクエリをスキップ（公開ページ用）
  async getByMonth(year: number, month: number, organizationId?: string, skipOrgFilter?: boolean, skipPrivateBookings?: boolean) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    
    // 通常公演を取得（スタッフ専用ビュー経由で全カラムにアクセス）
    let query = supabase
      .from('schedule_events_staff_view')
      .select(`
        id,
        date,
        start_time,
        end_time,
        venue,
        store_id,
        scenario,
        scenario_id,
        scenario_master_id,
        organization_scenario_id,
        category,
        is_cancelled,
        is_reservation_enabled,
        is_tentative,
        is_recruitment_extended,
        current_participants,
        max_participants,
        capacity,
        gms,
        gm_roles,
        notes,
        time_slot,
        organization_id,
        updated_at,
        reservation_name,
        reservation_id,
        is_reservation_name_overwritten,
        stores:store_id (
          id,
          name,
          short_name,
          color
        ),
        scenario_masters:scenario_master_id (
          id,
          title,
          player_count_max
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
    
    // 組織フィルタリング
    if (!skipOrgFilter) {
      // organizationIdが指定されていない場合、現在のユーザーの組織を自動取得
      const orgId = organizationId || await getCurrentOrganizationId()
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
    }
    
    const { data: scheduleEvents, error } = await query
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
    
    if (error) throw error
    
    // 最適化: すべてのイベントIDの予約を一度に取得（組織フィルタ付き）
    const eventIds = scheduleEvents.map(e => e.id)
    const reservationsMap = new Map<
      string,
      {
        participant_count: number
        status?: string
        candidate_datetimes?: { candidates?: Array<{ status?: string; timeSlot?: string }> }
        reservation_source?: string
      }[]
    >()
    
    // 組織フィルタ用（まだ取得していない場合）
    const resOrgId = organizationId || await getCurrentOrganizationId()
    
    if (eventIds.length > 0) {
      // NOTE:
      // - 満席の手動入力（schedule_events.current_participants）を残したいケースがある一方、
      //   予約のキャンセルで人数が減った場合は「実予約数（active）」を優先して表示したい。
      // - その判定のため、ここでは status も含めて取得し、
      //   「この公演に予約が存在するか（cancelled だけでも true）」を判定できるようにする。
      // PostgREST URL長制限回避: IDをバッチに分割してクエリ
      const BATCH_SIZE = 100
      for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
        const batchIds = eventIds.slice(i, i + BATCH_SIZE)
        let resQuery = supabase
          .from('reservations')
          .select('schedule_event_id, participant_count, status, candidate_datetimes, reservation_source')
          .in('schedule_event_id', batchIds)
        
        if (resOrgId && !skipOrgFilter) {
          resQuery = resQuery.eq('organization_id', resOrgId)
        }
        
        const { data: batchReservations, error: reservationError } = await resQuery
        
        if (!reservationError && batchReservations) {
          batchReservations.forEach(reservation => {
            const eventId = reservation.schedule_event_id
            if (!reservationsMap.has(eventId)) {
              reservationsMap.set(eventId, [])
            }
            reservationsMap.get(eventId)!.push(reservation)
          })
        }
      }
    }
    
    // 各イベントの実際の参加者数を計算
    const orgIdForScenarios = organizationId || await getCurrentOrganizationId()
    const orgScenarioMap = await getOrgScenarioPlayerCounts(orgIdForScenarios || undefined)

    const eventsWithActualParticipants = scheduleEvents.map((event) => {
      const reservations = reservationsMap.get(event.id) || []
      
      // 予約テーブルが single source of truth（active: confirmed/pending/gm_confirmed/checked_in）
      // ※ cancelled のみのケースでも reservations は存在し得るが、人数計算は active のみで行う
      const hasAnyReservations = reservations.length > 0
      const actualParticipants = reservations.reduce((sum, reservation) => {
        if (!reservation.status || !ACTIVE_RESERVATION_STATUSES_SET.has(reservation.status)) return sum
        return sum + (reservation.participant_count || 0)
      }, 0)
      
      let timeSlot: string | undefined
      let isPrivateBooking = false
      
      // time_slotが保存されている場合は常にそれを優先（選択した枠を尊重）
      if (event.time_slot) {
        timeSlot = event.time_slot
      }
      
      if (event.category === 'private') {
        isPrivateBooking = true
        // time_slotが未設定の場合のみ、予約情報から取得（フォールバック）
        if (!timeSlot) {
          const privateReservation = reservations.find(r => r.reservation_source === RESERVATION_SOURCE.WEB_PRIVATE)
          if (privateReservation?.candidate_datetimes?.candidates) {
            const confirmedCandidate = privateReservation.candidate_datetimes.candidates.find(
              (c) => c.status === 'confirmed'
            )
            if (confirmedCandidate?.timeSlot) {
              timeSlot = confirmedCandidate.timeSlot
            } else if (privateReservation.candidate_datetimes.candidates[0]?.timeSlot) {
              timeSlot = privateReservation.candidate_datetimes.candidates[0].timeSlot
            }
          }
        }
      }
      
      const maxForSync = resolveMaxParticipants(event, orgScenarioMap)
      const cappedActualParticipants = Math.min(actualParticipants, maxForSync)

      // 予約が存在する公演は、予約テーブル（active集計）を single source of truth として同期する
      // （キャンセルで減った場合も反映する）
      //
      // NOTE:
      // - 「手動で満席」(schedule_events.current_participants だけを増やす) の運用があるため、
      //   予約が1件も無い公演では current_participants を上書きしない。
      // - デモ参加者を「予約として」追加している場合は hasAnyReservations=true になるので、
      //   この同期処理で消えることはない（active集計に含まれる）。
      if (hasAnyReservations && cappedActualParticipants !== (event.current_participants || 0)) {
        Promise.resolve(
          supabase
            .from('schedule_events')
            .update({ current_participants: cappedActualParticipants })
            .eq('id', event.id)
        )
          .then(() => {
            logger.log(`参加者数を同期: ${event.id} (${event.current_participants} → ${cappedActualParticipants})`)
          })
          .catch((syncError) => {
            logger.error('参加者数の同期に失敗:', syncError)
          })
      }
      
      const maxParticipants = maxForSync
      
      // 表示用の参加者数
      // - 予約がある公演: 実予約数（active）を表示（キャンセルで減るのも反映）
      // - 予約がない公演: 手動入力された current_participants を表示（過去データ/手動満席など）
      const effectiveParticipants = hasAnyReservations
        ? cappedActualParticipants
        : Math.min(event.current_participants || 0, maxParticipants)
      
      return {
        ...event,
        current_participants: effectiveParticipants,
        max_participants: maxParticipants,
        capacity: maxParticipants,
        is_private_booking: isPrivateBooking,
        ...(timeSlot && { timeSlot })
      }
    })
    
    // 確定した貸切公演を取得（組織フィルタ付き）
    // 公開ページでは不要なためスキップ可能
    const privateEvents: ScheduleEvent[] = []
    
    if (!skipPrivateBookings) {
      const privateOrgId = organizationId || await getCurrentOrganizationId()
      let privateQuery = supabase
        .from('reservations')
        .select(`
          id,
          scenario_master_id,
          store_id,
          gm_staff,
          participant_count,
          candidate_datetimes,
          schedule_event_id,
          scenario_masters:scenario_master_id (
            id,
            title,
            player_count_max
          ),
          stores:store_id (
            id,
            name,
            short_name,
            color,
            address
          )
        `)
        .eq('reservation_source', RESERVATION_SOURCE.WEB_PRIVATE)
        .eq('status', 'confirmed')
        .is('schedule_event_id', null)
      
      if (privateOrgId && !skipOrgFilter) {
        privateQuery = privateQuery.eq('organization_id', privateOrgId)
      }
      
      const { data: confirmedPrivateBookings, error: privateError } = await privateQuery
      
      if (privateError) {
        logger.error('確定貸切公演取得エラー:', privateError)
      }
    
    if (confirmedPrivateBookings) {
      const gmStaffIds = confirmedPrivateBookings
        .map(booking => booking.gm_staff)
        .filter((id): id is string => !!id)
      
      const uniqueGmStaffIds = [...new Set(gmStaffIds)]
      const gmStaffMap = new Map<string, string>()
      
      if (uniqueGmStaffIds.length > 0) {
        const { data: gmStaffList } = await supabase
          .from('staff')
          .select('id, name')
          .in('id', uniqueGmStaffIds)
        
        if (gmStaffList) {
          gmStaffList.forEach(staff => {
            gmStaffMap.set(staff.id, staff.name)
          })
        }
      }
      
      for (const booking of confirmedPrivateBookings) {
        if (booking.candidate_datetimes?.candidates) {
          const confirmedCandidates = booking.candidate_datetimes.candidates.filter((c: CandidateDateTime) => c.status === 'confirmed')
          const candidatesToShow = confirmedCandidates.length > 0 
            ? confirmedCandidates.slice(0, 1)
            : booking.candidate_datetimes.candidates.slice(0, 1)
          
          for (const candidate of candidatesToShow) {
            const candidateDate = new Date(candidate.date)
            const candidateDateStr = candidateDate.toISOString().split('T')[0]
            
            if (candidateDateStr >= startDate && candidateDateStr <= endDate) {
              const candidateStartTime = candidate.startTime || '18:00:00'
              const candidateEndTime = candidate.endTime || '21:00:00'
              
              let gmNames: string[] = []
              
              if (booking.gm_staff && gmStaffMap.has(booking.gm_staff)) {
                gmNames = [gmStaffMap.get(booking.gm_staff)!]
              }
              
              if (gmNames.length === 0) {
                gmNames = ['未定']
              }
              
              const scenarioData = Array.isArray(booking.scenario_masters) ? booking.scenario_masters[0] : booking.scenario_masters
              const candidateTimeSlot = candidate.timeSlot || ''
              
              const privateMaxParticipants = resolveMaxParticipants(
                { scenario_master_id: scenarioData?.id, scenario: scenarioData?.title, scenario_masters: scenarioData },
                orgScenarioMap
              )
              privateEvents.push({
                id: `private-${booking.id}-${candidate.order}`,
                date: candidateDateStr,
                venue: booking.store_id,
                store_id: booking.store_id,
                scenario: scenarioData?.title || '',
                scenario_master_id: booking.scenario_master_id,
                start_time: candidateStartTime,
                end_time: candidateEndTime,
                category: 'private',
                is_cancelled: false,
                is_reservation_enabled: true,
                current_participants: booking.participant_count,
                max_participants: privateMaxParticipants,
                capacity: privateMaxParticipants,
                gms: gmNames,
                stores: booking.stores,
                scenarios: scenarioData,
                is_private_booking: true,
                timeSlot: candidateTimeSlot
              })
            }
          }
        }
      }
    }
    } // skipPrivateBookings の閉じ括弧
    
    const allEvents = [...(eventsWithActualParticipants || []), ...privateEvents]
    allEvents.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      return a.start_time.localeCompare(b.start_time)
    })
    
    return allEvents
  },

  // 日付範囲でスケジュールを取得（キット管理用）
  async getByDateRange(startDate: string, endDate: string, organizationId?: string, includeCancelled = false) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('schedule_events')
      .select(`
        id,
        date,
        venue,
        store_id,
        scenario,
        scenario_id,
        scenario_master_id,
        start_time,
        end_time,
        category,
        is_cancelled,
        current_participants,
        capacity
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('start_time')
    
    if (!includeCancelled) {
      query = query.eq('is_cancelled', false)
    }
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) {
      logger.error('Failed to fetch schedule by date range:', error)
      throw error
    }
    
    return data || []
  },

  // シナリオIDで指定期間の公演を取得
  async getByScenarioId(scenarioId: string, startDate: string, endDate: string, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('schedule_events')
      .select(`
        id, date, start_time, end_time, time_slot,
        store_id, scenario_master_id, organization_scenario_id,
        category, is_cancelled, is_reservation_enabled,
        current_participants, max_participants, capacity, organization_id,
        stores:store_id (
          id,
          name,
          short_name,
          color
        ),
        scenario_masters:scenario_master_id (
          id,
          title,
          player_count_max
        )
      `)
      .eq('scenario_master_id', scenarioId)
      .gte('date', startDate)
      .lte('date', endDate)
      .in('category', ['open', 'offsite'])
      .eq('is_reservation_enabled', true)
      .eq('is_cancelled', false)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data: scheduleEvents, error } = await query
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
    
    if (error) throw error
    
    if (!scheduleEvents || scheduleEvents.length === 0) {
      return []
    }
    
    const eventIds = scheduleEvents.map(e => e.id)
    
    // 予約データ取得（組織フィルタ付き） PostgREST URL長制限回避: バッチ分割
    const BATCH_SIZE = 100
    const allReservations: Array<{ schedule_event_id: string; participant_count: number }> = []
    
    for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
      const batchIds = eventIds.slice(i, i + BATCH_SIZE)
      let resQuery = supabase
        .from('reservations')
        .select('schedule_event_id, participant_count')
        .in('schedule_event_id', batchIds)
        .in('status', ['confirmed', 'pending', 'gm_confirmed', 'checked_in'])
      
      if (orgId) {
        resQuery = resQuery.eq('organization_id', orgId)
      }
      
      const { data, error: reservationError } = await resQuery
      
      if (reservationError) {
        if (reservationError.code !== 'PGRST116') {
          logger.warn('予約データの取得に失敗:', {
            code: reservationError.code,
            message: reservationError.message,
            details: reservationError.details
          })
        }
      }
      if (data) {
        allReservations.push(...(data as typeof allReservations))
      }
    }
    
    const participantsByEventId = new Map<string, number>()
    allReservations.forEach((reservation) => {
      const eventId = reservation.schedule_event_id
      const count = reservation.participant_count || 0
      participantsByEventId.set(eventId, (participantsByEventId.get(eventId) || 0) + count)
    })
    
    const orgScenarioMapForScenario = await getOrgScenarioPlayerCounts(orgId)

    const eventsWithActualParticipants = scheduleEvents.map((event) => {
      const actualParticipants = participantsByEventId.get(event.id) || 0
      
      // 予約から計算した参加者数が現在の値より大きい場合のみ更新
      // （手動で設定した「満席」状態が上書きされないようにする）
      const shouldUpdate = actualParticipants > (event.current_participants || 0)
      if (shouldUpdate) {
        supabase
          .from('schedule_events')
          .update({ current_participants: actualParticipants })
          .eq('id', event.id)
          .then(({ error: updateError }) => {
            if (updateError) {
              logger.error('参加者数の同期に失敗:', updateError)
            } else {
              logger.log(`参加者数を同期: ${event.id} (${event.current_participants} → ${actualParticipants})`)
            }
          })
      }
      
      const maxParticipants = resolveMaxParticipants(event, orgScenarioMapForScenario)
      
      // 現在の値と予約から計算した値の大きい方を使用
      const effectiveParticipants = Math.max(actualParticipants, event.current_participants || 0)
      
      return {
        ...event,
        current_participants: effectiveParticipants,
        max_participants: maxParticipants,
        capacity: maxParticipants,
        is_private_booking: false,
        ...(event.time_slot && { timeSlot: event.time_slot })
      }
    })
    
    return eventsWithActualParticipants
  },

  // 公演を作成
  async create(eventData: {
    date: string
    store_id: string
    venue?: string
    scenario?: string
    scenario_master_id?: string | null
    organization_scenario_id?: string | null  // 組織シナリオID（新UI対応）
    category: string
    start_time: string
    end_time: string
    capacity?: number
    gms?: string[]
    gm_roles?: Record<string, string>
    notes?: string
    time_slot?: string | null
    is_reservation_enabled?: boolean
    is_tentative?: boolean  // 仮状態（非公開）
    venue_rental_fee?: number  // 場所貸し公演料金
    organization_id: string  // マルチテナント対応：必須
    reservation_name?: string | null  // 貸切予約の予約者名
    is_reservation_name_overwritten?: boolean  // 予約者名が手動上書きされたか
    is_private_request?: boolean  // 貸切リクエストかどうか
    reservation_id?: string | null  // 貸切リクエストID
  }) {
    // シナリオ名から自動でマッチングして scenario_master_id と正式名称を設定
    const finalData: Record<string, unknown> = { ...eventData }
    if (eventData.scenario && !eventData.scenario_master_id && !finalData.scenario_master_id) {
      const match = await findMatchingScenario(eventData.scenario)
      if (match) {
        // findMatchingScenario は scenario_masters から検索するので、scenario_master_id に設定
        finalData.scenario_master_id = match.id
        finalData.scenario = match.title // 正式名称に更新
        logger.info(`シナリオ自動マッチング: ${eventData.scenario} -> ${match.title} (scenario_master_id: ${match.id})`)
      }
    }
    
    // organization_scenario_id を自動設定（scenario_master_id から逆引き）
    if (finalData.scenario_master_id && eventData.organization_id && !finalData.organization_scenario_id) {
      try {
        // organization_scenarios から該当のレコードを取得
        const { data: orgScenario } = await supabase
          .from('organization_scenarios')
          .select('id')
          .eq('scenario_master_id', finalData.scenario_master_id as string)
          .eq('organization_id', eventData.organization_id)
          .single()
        
        if (orgScenario?.id) {
          finalData.organization_scenario_id = orgScenario.id
          logger.info(`organization_scenario_id 自動設定: ${orgScenario.id}`)
        }
      } catch (err) {
        // エラーは無視（organization_scenario_id は任意）
        logger.warn('organization_scenario_id の自動設定に失敗:', err)
      }
    }
    
    // DBで許可されていないカテゴリをopenにマッピング
    const DB_VALID_CATEGORIES = ['open', 'private', 'gmtest', 'testplay', 'offsite', 'venue_rental', 'venue_rental_free', 'package', 'mtg']
    
    if (finalData.category && typeof finalData.category === 'string' && !DB_VALID_CATEGORIES.includes(finalData.category)) {
      logger.info(`カテゴリマッピング: ${finalData.category} -> open`)
      finalData.category = 'open'
    }
    
    // INSERT: id のみ返す（authenticated のカラム制限を回避）
    // 全カラムの取得はスタッフ専用ビューから別途行う
    let insertPayload: Record<string, unknown> = { ...finalData }
    let lastError: { message?: string; details?: string; hint?: string } | null = null
    let insertedId: string | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await supabase
        .from('schedule_events')
        .insert([insertPayload])
        .select('id')
        .single()

      if (!error) {
        insertedId = data.id
        break
      }

      lastError = error
      const removal = removeMissingScheduleColumn(insertPayload, error)
      if (!removal) break

      insertPayload = removal.nextPayload
      logger.warn(`schedule_events insert: missing column "${removal.removedColumn}", retrying without it`)
    }

    if (!insertedId) throw lastError

    // スタッフ専用ビューから全カラム（JOIN含む）を取得して返す
    const { data: fullEvent, error: fetchError } = await supabase
      .from('schedule_events_staff_view')
      .select(`
        *,
        stores:store_id (
          id,
          name,
          short_name
        ),
        scenario_masters:scenario_master_id (
          id,
          title,
          player_count_max
        )
      `)
      .eq('id', insertedId)
      .single()

    if (fetchError) throw fetchError
    return fullEvent
  },

  // 公演を更新
  async update(id: string, updates: Partial<{
    date: string
    store_id: string
    venue: string
    scenario_master_id: string
    organization_scenario_id: string  // 組織シナリオID（新UI対応）
    scenario: string
    category: string
    start_time: string
    end_time: string
    capacity: number
    gms: string[]
    gm_roles: Record<string, string>
    notes: string
    is_cancelled: boolean
    is_tentative: boolean // 仮状態（非公開）
    is_reservation_enabled: boolean
    time_slot: string | null
    venue_rental_fee: number  // 場所貸し公演料金
    reservation_name: string | null  // 貸切予約の予約者名
    is_reservation_name_overwritten: boolean  // 予約者名が手動上書きされたか
    is_private_request: boolean  // 貸切リクエストかどうか
    reservation_id: string | null  // 貸切リクエストID
  }>, organizationId?: string, expectedUpdatedAt?: string) {
    // シナリオ名から自動でマッチングして scenario_master_id と正式名称を設定
    const finalUpdates: Record<string, unknown> = { ...updates }
    if (updates.scenario && !updates.scenario_master_id && !finalUpdates.scenario_master_id) {
      const match = await findMatchingScenario(updates.scenario)
      if (match) {
        // findMatchingScenario は scenario_masters から検索するので、scenario_master_id に設定
        finalUpdates.scenario_master_id = match.id
        finalUpdates.scenario = match.title // 正式名称に更新
        logger.info(`シナリオ自動マッチング: ${updates.scenario} -> ${match.title} (scenario_master_id: ${match.id})`)
      }
    }
    
    // organization_scenario_id を自動設定（scenario_master_id から逆引き）
    const scenarioMasterIdToUse = (finalUpdates as Record<string, unknown>).scenario_master_id || (updates as Record<string, unknown>).scenario_master_id
    const orgIdToUse = organizationId || await getCurrentOrganizationId()
    if (scenarioMasterIdToUse && orgIdToUse && !finalUpdates.organization_scenario_id) {
      try {
        const { data: orgScenario } = await supabase
          .from('organization_scenarios')
          .select('id')
          .eq('scenario_master_id', scenarioMasterIdToUse as string)
          .eq('organization_id', orgIdToUse)
          .single()
        
        if (orgScenario?.id) {
          finalUpdates.organization_scenario_id = orgScenario.id
          logger.info(`organization_scenario_id 自動設定（更新）: ${orgScenario.id}`)
        }
      } catch (err) {
        logger.warn('organization_scenario_id の自動設定に失敗（更新）:', err)
      }
    }
    
    // DBで許可されていないカテゴリをopenにマッピング
    const DB_VALID_CATEGORIES = ['open', 'private', 'gmtest', 'testplay', 'offsite', 'venue_rental', 'venue_rental_free', 'package', 'mtg']
    
    if (finalUpdates.category && typeof finalUpdates.category === 'string' && !DB_VALID_CATEGORIES.includes(finalUpdates.category)) {
      logger.info(`カテゴリマッピング: ${finalUpdates.category} -> open`)
      finalUpdates.category = 'open'
    }
    
    let updatePayload: Record<string, unknown> = { ...finalUpdates, updated_at: new Date().toISOString() }
    let lastError: { message?: string; details?: string; hint?: string } | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let query = supabase
        .from('schedule_events')
        .update(updatePayload)
        .eq('id', id)

      // ⚠️ 楽観的ロック: updated_at が読み込み時と一致する場合のみ更新
      if (expectedUpdatedAt) {
        query = query.eq('updated_at', expectedUpdatedAt)
      }

      // id のみ返す（authenticated のカラム制限を回避、楽観的ロック失敗検出には十分）
      const { data, error } = await query.select('id').single()

      if (!error) break

      // 楽観的ロック失敗（PGRST116 = 0 rows = 他の人が先に更新した）
      if (expectedUpdatedAt && error.code === 'PGRST116') {
        throw new Error('他のユーザーが先にこのイベントを更新しました。ページを再読み込みして最新データを確認してください。')
      }

      lastError = error
      const removal = removeMissingScheduleColumn(updatePayload, error)
      if (!removal) break

      updatePayload = removal.nextPayload
      logger.warn(`schedule_events update: missing column "${removal.removedColumn}", retrying without it`)
    }

    if (lastError) throw lastError

    // スタッフ専用ビューから全カラム（JOIN含む）を取得して返す（INSERT と同パターン）
    const { data: fullEvent, error: fetchError } = await supabase
      .from('schedule_events_staff_view')
      .select(`
        *,
        stores:store_id (
          id,
          name,
          short_name
        ),
        scenario_masters:scenario_master_id (
          id,
          title
        )
      `)
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError
    return fullEvent
  },

  // 公演を削除（関連する予約はCASCADEで自動削除）
  async delete(id: string) {
    // 公演を削除（ON DELETE CASCADE により関連データも自動削除）
    const { error } = await supabase
      .from('schedule_events')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  },

  // 公演をキャンセル/復活
  async toggleCancel(id: string, isCancelled: boolean, cancellationReason?: string) {
    const updateData: Record<string, unknown> = { 
      is_cancelled: isCancelled 
    }
    
    // 中止の場合は理由と日時を設定
    if (isCancelled) {
      updateData.cancellation_reason = cancellationReason || null
      updateData.cancelled_at = new Date().toISOString()
    } else {
      // 復活の場合はクリア
      updateData.cancellation_reason = null
      updateData.cancelled_at = null
    }
    
    const { error } = await supabase
      .from('schedule_events')
      .update(updateData)
      .eq('id', id)

    if (error) throw error

    // スタッフ専用ビューから更新後のデータを取得（カラム制限を回避）
    const { data, error: fetchError } = await supabase
      .from('schedule_events_staff_view')
      .select()
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError
    return data
  },

  // 中止でない全公演にデモ参加者を満席まで追加（既存データの修復も含む）
  async addDemoParticipantsToAllActiveEvents() {
    try {
      // 組織フィルタ（マルチテナント対応）
      const orgId = await getCurrentOrganizationId()
      
      let query = supabase
        .from('schedule_events_staff_view')
        .select('id, organization_id, scenario_master_id, scenario, store_id, date, start_time, category, gms, capacity, max_participants')
        .eq('is_cancelled', false)
        .order('date', { ascending: true })
      
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
      
      const { data: events, error: eventsError } = await query
      
      if (eventsError) {
        logger.error('公演データの取得に失敗:', eventsError)
        return { success: false, error: eventsError }
      }
      
      if (!events || events.length === 0) {
        logger.log('中止でない公演が見つかりません')
        return { success: true, message: '中止でない公演が見つかりません' }
      }
      
      logger.log(`${events.length}件の公演をチェックします`)
      
      const orgScenarioMapForDemo = await getOrgScenarioPlayerCounts(orgId)
      let successCount = 0
      let errorCount = 0
      
      for (const event of events) {
        try {
          const { data: reservations, error: reservationError } = await supabase
            .from('reservations')
            .select('participant_count, participant_names')
            .eq('schedule_event_id', event.id)
            .in('status', [...ACTIVE_RESERVATION_STATUSES])
          
          if (reservationError) {
            if (reservationError.code !== 'PGRST116') {
              logger.warn(`予約データの取得に失敗 (${event.id}):`, {
                code: reservationError.code,
                message: reservationError.message,
                details: reservationError.details
              })
              errorCount++
            }
            continue
          }
          
          // 予約レコードの合計参加者数
          const reservedParticipants = reservations?.reduce((sum, reservation) => 
            sum + (reservation.participant_count || 0), 0) || 0
          
          // 定員（organization_scenarios_with_master のオーバーライドを反映）
          const capacity = resolveMaxParticipants(
            { scenario_master_id: event.scenario_master_id, scenario: event.scenario, max_participants: event.max_participants, capacity: event.capacity },
            orgScenarioMapForDemo
          )
          
          // デモ参加者が既に存在するかチェック
          const hasDemoParticipant = reservations?.some(r => 
            r.participant_names?.includes('デモ参加者') || 
            r.participant_names?.some((name: string) => name.includes('デモ'))
          )
          
          // 足りない参加者数を計算（定員 - 実際の予約人数）
          // ※ current_participantsの値は無視し、定員のみを基準とする
          const neededParticipants = capacity - reservedParticipants
          
          if (neededParticipants > 0 && !hasDemoParticipant) {
            // scenario_master_idがnullの場合はスキップ
            if (!event.scenario_master_id) {
              continue
            }
            
            // scenario_masters から基本情報を取得
            const { data: scenarioMaster, error: masterError } = await supabase
              .from('scenario_masters')
              .select('id, title, official_duration')
              .eq('id', event.scenario_master_id)
              .single()
            
            if (masterError) {
              logger.error(`シナリオマスタ情報の取得に失敗 (${event.id}):`, masterError)
              errorCount++
              continue
            }
            
            // organization_scenarios から料金情報を取得
            const { data: orgScenario } = await supabase
              .from('organization_scenarios')
              .select('participation_fee, gm_test_participation_fee')
              .eq('scenario_master_id', event.scenario_master_id)
              .eq('organization_id', event.organization_id)
              .single()
            
            const isGmTest = event.category === 'gmtest'
            const participationFee = isGmTest 
              ? (orgScenario?.gm_test_participation_fee || orgScenario?.participation_fee || 0)
              : (orgScenario?.participation_fee || 0)
            
            const demoReservation = {
              schedule_event_id: event.id,
              organization_id: event.organization_id || 'a0000000-0000-0000-0000-000000000001',
              title: event.scenario || scenarioMaster?.title || '',
              scenario_master_id: event.scenario_master_id,
              store_id: event.store_id || null,
              customer_id: null,
              customer_notes: neededParticipants === 1 ? 'デモ参加者' : `デモ参加者${neededParticipants}名`,
              requested_datetime: `${event.date}T${event.start_time}+09:00`,
              duration: scenarioMaster?.official_duration || 120,
              participant_count: neededParticipants,
              participant_names: Array(neededParticipants).fill(null).map((_, i) => 
                neededParticipants === 1 ? 'デモ参加者' : `デモ参加者${i + 1}`
              ),
              assigned_staff: event.gms || [],
              base_price: participationFee * neededParticipants,
              options_price: 0,
              total_price: participationFee * neededParticipants,
              discount_amount: 0,
              final_price: participationFee * neededParticipants,
              payment_method: 'onsite',
              payment_status: 'paid',
              status: 'confirmed',
              reservation_source: RESERVATION_SOURCE.DEMO
            }

            const { error: insertError } = await supabase
              .from('reservations')
              .insert(demoReservation)
            
            if (insertError) {
              logger.error(`デモ参加者の予約作成に失敗 (${event.id}):`, insertError)
              errorCount++
              continue
            }
            
            // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
            await recalculateCurrentParticipants(event.id)
            
            logger.log(`デモ参加者${neededParticipants}名を追加しました: ${event.scenario} (${event.date})`)
            successCount++
          }
        } catch (err) {
          logger.error(`デモ参加者の追加に失敗 (${event.id}):`, err)
          errorCount++
        }
      }
      
      logger.log(`デモ参加者追加完了: 成功${successCount}件, エラー${errorCount}件`)
      
      return {
        success: true,
        message: `デモ参加者追加完了: 成功${successCount}件, エラー${errorCount}件`,
        successCount,
        errorCount
      }
    } catch (err) {
      logger.error('デモ参加者追加処理でエラー:', err)
      return { success: false, error: err }
    }
  },

  // 誤って追加されたデモ予約を全削除
  async removeAllDemoReservations() {
    try {
      // reservation_source = 'demo' の予約をすべて削除
      const { data: deletedCount, error } = await supabase.rpc('admin_delete_reservations_by_source', {
        p_reservation_source: RESERVATION_SOURCE.DEMO
      })
      
      if (error) {
        logger.error('デモ予約の削除に失敗:', error)
        return { success: false, error }
      }
      
      const count = typeof deletedCount === 'number' ? deletedCount : 0
      logger.log(`${count}件のデモ予約を削除しました`)
      
      return { success: true, deletedCount: count }
    } catch (err) {
      logger.error('デモ予約削除処理でエラー:', err)
      return { success: false, error: err }
    }
  }
}

