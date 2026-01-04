/**
 * API モジュール（後方互換性維持用）
 * 
 * 新規コードでは src/lib/api/ からの直接インポートを推奨
 */
import { supabase } from './supabase'
import { logger } from '@/utils/logger'
import { getCurrentOrganizationId } from '@/lib/organization'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'

// 分割済みAPIを再エクスポート（後方互換性維持）
export { storeApi } from './api/storeApi'
export { authorApi, type Author } from './api/authorApi'
export { scenarioApi } from './api/scenarioApi'
export { staffApi } from './api/staffApi'
export { memoApi } from './api/memoApi'
export { salesApi } from './api/salesApi'
export type { CandidateDateTime, GMAvailabilityResponse, PaginatedResponse } from './api/types'
export type { ScheduleEvent } from './api/types'

// 候補日時の型定義（scheduleApi内部で使用）
interface CandidateDateTime {
  order: number
  date: string
  startTime?: string
  endTime?: string
  status?: 'confirmed' | 'pending' | 'rejected'
  timeSlot?: string
}

// スケジュールイベントの型定義（scheduleApi内部で使用）
interface ScheduleEvent {
  id: string
  date: string
  venue: string
  store_id: string
  scenario: string
  scenario_id: string
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

// シナリオ名から自動でマッチングして scenario_id と正式名称を返す
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
  
  // シナリオマスタから検索（組織フィルタ付き）
  const orgId = await getCurrentOrganizationId()
  let query = supabase
    .from('scenarios')
    .select('id, title')
  
  if (orgId) {
    query = query.eq('organization_id', orgId)
  }
  
  const { data: scenarios } = await query
  
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

// 公演スケジュール関連のAPI（大きいため分割保留）
export const scheduleApi = {
  // 自分のスケジュールを取得（期間指定）
  async getMySchedule(staffName: string, startDate: string, endDate: string) {
    // 組織フィルタ用
    const orgId = await getCurrentOrganizationId()
    
    // 1. GM（メインGM/サブGM）として割り当てられた公演を取得
    let gmQuery = supabase
      .from('schedule_events')
      .select(`
        *,
        stores:store_id (
          id,
          name,
          short_name,
          color,
          address
        ),
        scenarios:scenario_id (
          id,
          title,
          player_count_max,
          duration,
          gm_costs
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
          scenarios:scenario_id (
            id,
            title,
            player_count_max,
            duration,
            gm_costs
          )
        )
      `)
      .contains('participant_names', [staffName])
      .eq('payment_method', 'staff')
      .in('status', ['confirmed', 'pending', 'gm_confirmed'])
    
    if (orgId) {
      resQuery = resQuery.eq('organization_id', orgId)
    }
    
    const { data: staffReservations, error: resError } = await resQuery
    
    // スタッフ参加の公演を抽出（日付フィルタリング）
    const staffEvents = (staffReservations || [])
      .map(r => r.schedule_events as any)
      .filter((event: any) => 
        event && 
        event.date >= startDate && 
        event.date <= endDate && 
        !event.is_cancelled
      )
    
    // 3. 重複を除去してマージ（GMとスタッフ参加の両方に含まれる場合）
    const eventMap = new Map<string, any>()
    gmEvents.forEach(event => eventMap.set(event.id, event))
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
      let allResQuery = supabase
        .from('reservations')
        .select('schedule_event_id, participant_count, status')
        .in('schedule_event_id', eventIds)
        .in('status', ['confirmed', 'pending', 'gm_confirmed'])
      
      if (orgId) {
        allResQuery = allResQuery.eq('organization_id', orgId)
      }
      
      const { data: allReservations, error: reservationError } = await allResQuery
      
      if (!reservationError && allReservations) {
        allReservations.forEach(reservation => {
          const eventId = reservation.schedule_event_id
          if (!reservationsMap.has(eventId)) {
            reservationsMap.set(eventId, [])
          }
          reservationsMap.get(eventId)!.push(reservation)
        })
      }
    }

    const myEvents = scheduleEvents.map(event => {
      const reservations = reservationsMap.get(event.id) || []
      const actualParticipants = reservations.reduce((sum, r) => sum + (r.participant_count || 0), 0)
      
      const scenarioData = event.scenarios as { player_count_max?: number } | null
      const maxParticipants = scenarioData?.player_count_max || event.max_participants || event.capacity || 8

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
  async getByMonth(year: number, month: number, organizationId?: string, skipOrgFilter?: boolean) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    
    // 通常公演を取得
    let query = supabase
      .from('schedule_events')
      .select(`
        *,
        stores:store_id (
          id,
          name,
          short_name,
          color,
          address
        ),
        scenarios:scenario_id (
          id,
          title,
          player_count_max,
          extra_preparation_time
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
    
    // 最適化: すべてのイベントIDの予約を一度に取得
    const eventIds = scheduleEvents.map(e => e.id)
    const reservationsMap = new Map<string, { participant_count: number; candidate_datetimes?: { candidates?: Array<{ status?: string; timeSlot?: string }> }; reservation_source?: string }[]>()
    
    if (eventIds.length > 0) {
      const { data: allReservations, error: reservationError } = await supabase
        .from('reservations')
        .select('schedule_event_id, participant_count, candidate_datetimes, reservation_source')
        .in('schedule_event_id', eventIds)
        .in('status', ['confirmed', 'pending', 'gm_confirmed'])
      
      if (!reservationError && allReservations) {
        allReservations.forEach(reservation => {
          const eventId = reservation.schedule_event_id
          if (!reservationsMap.has(eventId)) {
            reservationsMap.set(eventId, [])
          }
          reservationsMap.get(eventId)!.push(reservation)
        })
      }
    }
    
    // 各イベントの実際の参加者数を計算
    const eventsWithActualParticipants = scheduleEvents.map((event) => {
      const reservations = reservationsMap.get(event.id) || []
      
      const actualParticipants = reservations.reduce((sum, reservation) => 
        sum + (reservation.participant_count || 0), 0)
      
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
          const privateReservation = reservations.find(r => r.reservation_source === 'web_private')
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
      
      // 予約から計算した参加者数が現在の値より大きい場合のみ更新
      // （手動で設定した「満席」状態が上書きされないようにする）
      // ただし、max_participantsを超えないようにする
      const scenarioForSync = event.scenarios as { player_count_max?: number } | null
      const maxForSync = scenarioForSync?.player_count_max ||
                        event.max_participants ||
                        event.capacity ||
                        8
      const cappedActualParticipants = Math.min(actualParticipants, maxForSync)
      
      if (cappedActualParticipants > (event.current_participants || 0)) {
        Promise.resolve(supabase
          .from('schedule_events')
          .update({ current_participants: cappedActualParticipants })
          .eq('id', event.id))
          .then(() => {
            logger.log(`参加者数を同期: ${event.id} (${event.current_participants} → ${cappedActualParticipants})`)
          })
          .catch((syncError) => {
            logger.error('参加者数の同期に失敗:', syncError)
          })
      }
      
      const scenarioData = event.scenarios as { player_count_max?: number } | null
      const scenarioMaxPlayers = scenarioData?.player_count_max
      
      const maxParticipants = scenarioMaxPlayers ||
                              event.max_participants ||
                              event.capacity ||
                              8
      
      // 現在の値と予約から計算した値の大きい方を使用（ただしmax_participantsを超えない）
      const effectiveParticipants = Math.min(
        Math.max(actualParticipants, event.current_participants || 0),
        maxParticipants
      )
      
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
    const privateOrgId = organizationId || await getCurrentOrganizationId()
    let privateQuery = supabase
      .from('reservations')
      .select(`
        id,
        scenario_id,
        store_id,
        gm_staff,
        participant_count,
        candidate_datetimes,
        schedule_event_id,
        scenarios:scenario_id (
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
      .eq('reservation_source', 'web_private')
      .eq('status', 'confirmed')
      .is('schedule_event_id', null)
    
    if (privateOrgId && !skipOrgFilter) {
      privateQuery = privateQuery.eq('organization_id', privateOrgId)
    }
    
    const { data: confirmedPrivateBookings, error: privateError } = await privateQuery
    
    if (privateError) {
      logger.error('確定貸切公演取得エラー:', privateError)
    }
    
    const privateEvents: ScheduleEvent[] = []
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
              
              const scenarioData = Array.isArray(booking.scenarios) ? booking.scenarios[0] : booking.scenarios
              const candidateTimeSlot = candidate.timeSlot || ''
              
              privateEvents.push({
                id: `private-${booking.id}-${candidate.order}`,
                date: candidateDateStr,
                venue: booking.store_id,
                store_id: booking.store_id,
                scenario: scenarioData?.title || '',
                scenario_id: booking.scenario_id,
                start_time: candidateStartTime,
                end_time: candidateEndTime,
                category: 'private',
                is_cancelled: false,
                is_reservation_enabled: true,
                current_participants: booking.participant_count,
                max_participants: scenarioData?.player_count_max || 8,
                capacity: scenarioData?.player_count_max || 8,
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
    
    const allEvents = [...(eventsWithActualParticipants || []), ...privateEvents]
    allEvents.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      return a.start_time.localeCompare(b.start_time)
    })
    
    return allEvents
  },

  // シナリオIDで指定期間の公演を取得
  async getByScenarioId(scenarioId: string, startDate: string, endDate: string, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('schedule_events')
      .select(`
        *,
        stores:store_id (
          id,
          name,
          short_name,
          color
        ),
        scenarios:scenario_id (
          id,
          title,
          player_count_max
        )
      `)
      .eq('scenario_id', scenarioId)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('category', 'open')
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
    const { data: allReservations, error: reservationError } = await supabase
      .from('reservations')
      .select('schedule_event_id, participant_count')
      .in('schedule_event_id', eventIds)
      .in('status', ['confirmed', 'pending', 'gm_confirmed'])
    
    if (reservationError) {
      logger.error('予約データの取得に失敗:', reservationError)
    }
    
    const participantsByEventId = new Map<string, number>()
    allReservations?.forEach((reservation) => {
      const eventId = reservation.schedule_event_id
      const count = reservation.participant_count || 0
      participantsByEventId.set(eventId, (participantsByEventId.get(eventId) || 0) + count)
    })
    
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
      
      const scenarioData = event.scenarios as { player_count_max?: number } | null
      const scenarioMaxPlayers = scenarioData?.player_count_max
      const maxParticipants = scenarioMaxPlayers ||
                              event.max_participants ||
                              event.capacity ||
                              8
      
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
    scenario_id?: string | null
    category: string
    start_time: string
    end_time: string
    capacity?: number
    gms?: string[]
    gm_roles?: Record<string, string>
    notes?: string
    time_slot?: string | null
    is_reservation_enabled?: boolean
    venue_rental_fee?: number  // 場所貸し公演料金
    organization_id: string  // マルチテナント対応：必須
  }) {
    // シナリオ名から自動でマッチングして scenario_id と正式名称を設定
    const finalData = { ...eventData }
    if (eventData.scenario && !eventData.scenario_id) {
      const match = await findMatchingScenario(eventData.scenario)
      if (match) {
        finalData.scenario_id = match.id
        finalData.scenario = match.title // 正式名称に更新
        logger.info(`シナリオ自動マッチング: ${eventData.scenario} -> ${match.title}`)
      }
    }
    
    // DBで許可されていないカテゴリをopenにマッピング
    const DB_VALID_CATEGORIES = ['open', 'private', 'gmtest', 'testplay', 'offsite', 'venue_rental', 'venue_rental_free', 'package', 'mtg']
    
    if (finalData.category && !DB_VALID_CATEGORIES.includes(finalData.category)) {
      logger.info(`カテゴリマッピング: ${finalData.category} -> open`)
      finalData.category = 'open'
    }
    
    const { data, error } = await supabase
      .from('schedule_events')
      .insert([finalData])
      .select(`
        *,
        stores:store_id (
          id,
          name,
          short_name
        ),
        scenarios:scenario_id (
          id,
          title,
          player_count_max
        )
      `)
      .single()
    
    if (error) throw error
    return data
  },

  // 公演を更新
  async update(id: string, updates: Partial<{
    date: string
    store_id: string
    venue: string
    scenario_id: string
    scenario: string
    category: string
    start_time: string
    end_time: string
    capacity: number
    gms: string[]
    gm_roles: Record<string, string>
    notes: string
    is_cancelled: boolean
    is_reservation_enabled: boolean
    time_slot: string | null
    venue_rental_fee: number  // 場所貸し公演料金
  }>) {
    // シナリオ名から自動でマッチングして scenario_id と正式名称を設定
    const finalUpdates = { ...updates }
    if (updates.scenario && !updates.scenario_id) {
      const match = await findMatchingScenario(updates.scenario)
      if (match) {
        finalUpdates.scenario_id = match.id
        finalUpdates.scenario = match.title // 正式名称に更新
        logger.info(`シナリオ自動マッチング: ${updates.scenario} -> ${match.title}`)
      }
    }
    
    // DBで許可されていないカテゴリをopenにマッピング
    const DB_VALID_CATEGORIES = ['open', 'private', 'gmtest', 'testplay', 'offsite', 'venue_rental', 'venue_rental_free', 'package', 'mtg']
    
    if (finalUpdates.category && !DB_VALID_CATEGORIES.includes(finalUpdates.category)) {
      logger.info(`カテゴリマッピング: ${finalUpdates.category} -> open`)
      finalUpdates.category = 'open'
    }
    
    const { data, error } = await supabase
      .from('schedule_events')
      .update(finalUpdates)
      .eq('id', id)
      .select(`
        *,
        stores:store_id (
          id,
          name,
          short_name
        ),
        scenarios:scenario_id (
          id,
          title
        )
      `)
      .single()
    
    if (error) throw error
    return data
  },

  // 公演を削除（関連する予約も削除）
  async delete(id: string) {
    // まず関連する予約を削除（デモ参加者含む）
    const { error: reservationError } = await supabase
      .from('reservations')
      .delete()
      .eq('schedule_event_id', id)
    
    if (reservationError) {
      console.warn('予約削除エラー（続行）:', reservationError)
      // エラーでも続行（予約がない場合もある）
    }
    
    // 公演を削除
    const { error } = await supabase
      .from('schedule_events')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  },

  // 公演をキャンセル/復活
  async toggleCancel(id: string, isCancelled: boolean) {
    const { data, error } = await supabase
      .from('schedule_events')
      .update({ is_cancelled: isCancelled })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 中止でない全公演にデモ参加者を満席まで追加（既存データの修復も含む）
  async addDemoParticipantsToAllActiveEvents() {
    try {
      const { data: events, error: eventsError } = await supabase
        .from('schedule_events')
        .select('*')
        .eq('is_cancelled', false)
        .order('date', { ascending: true })
      
      if (eventsError) {
        logger.error('公演データの取得に失敗:', eventsError)
        return { success: false, error: eventsError }
      }
      
      if (!events || events.length === 0) {
        logger.log('中止でない公演が見つかりません')
        return { success: true, message: '中止でない公演が見つかりません' }
      }
      
      logger.log(`${events.length}件の公演をチェックします`)
      
      let successCount = 0
      let errorCount = 0
      
      for (const event of events) {
        try {
          const { data: reservations, error: reservationError } = await supabase
            .from('reservations')
            .select('participant_count, participant_names')
            .eq('schedule_event_id', event.id)
            .in('status', ['confirmed', 'pending'])
          
          if (reservationError) {
            logger.error(`予約データの取得に失敗 (${event.id}):`, reservationError)
            errorCount++
            continue
          }
          
          // 予約レコードの合計参加者数
          const reservedParticipants = reservations?.reduce((sum, reservation) => 
            sum + (reservation.participant_count || 0), 0) || 0
          
          // 定員
          const capacity = event.capacity || event.max_participants || 8
          
          // デモ参加者が既に存在するかチェック
          const hasDemoParticipant = reservations?.some(r => 
            r.participant_names?.includes('デモ参加者') || 
            r.participant_names?.some((name: string) => name.includes('デモ'))
          )
          
          // 足りない参加者数を計算（定員 - 実際の予約人数）
          // ※ current_participantsの値は無視し、定員のみを基準とする
          const neededParticipants = capacity - reservedParticipants
          
          if (neededParticipants > 0 && !hasDemoParticipant) {
            // scenario_idがnullの場合はスキップ
            if (!event.scenario_id) {
              continue
            }
            
            const { data: scenario, error: scenarioError } = await supabase
              .from('scenarios')
              .select('id, title, duration, participation_fee, gm_test_participation_fee')
              .eq('id', event.scenario_id)
              .single()
            
            if (scenarioError) {
              logger.error(`シナリオ情報の取得に失敗 (${event.id}):`, scenarioError)
              errorCount++
              continue
            }
            
            const isGmTest = event.category === 'gmtest'
            const participationFee = isGmTest 
              ? (scenario?.gm_test_participation_fee || scenario?.participation_fee || 0)
              : (scenario?.participation_fee || 0)
            
            const demoReservation = {
              schedule_event_id: event.id,
              organization_id: event.organization_id || 'a0000000-0000-0000-0000-000000000001',
              title: event.scenario || '',
              scenario_id: event.scenario_id,
              store_id: event.store_id || null,
              customer_id: null,
              customer_notes: neededParticipants === 1 ? 'デモ参加者' : `デモ参加者${neededParticipants}名`,
              requested_datetime: `${event.date}T${event.start_time}+09:00`,
              duration: scenario?.duration || 120,
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
              reservation_source: 'demo'
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
      const { data: deleted, error } = await supabase
        .from('reservations')
        .delete()
        .eq('reservation_source', 'demo')
        .select('id')
      
      if (error) {
        logger.error('デモ予約の削除に失敗:', error)
        return { success: false, error }
      }
      
      const count = deleted?.length || 0
      logger.log(`${count}件のデモ予約を削除しました`)
      
      return { success: true, deletedCount: count }
    } catch (err) {
      logger.error('デモ予約削除処理でエラー:', err)
      return { success: false, error: err }
    }
  }
}
