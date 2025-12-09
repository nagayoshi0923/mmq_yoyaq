/**
 * API モジュール（後方互換性維持用）
 * 
 * 新規コードでは src/lib/api/ からの直接インポートを推奨
 */
import { supabase } from './supabase'
import { logger } from '@/utils/logger'

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

// 公演スケジュール関連のAPI（大きいため分割保留）
export const scheduleApi = {
  // 自分のスケジュールを取得（期間指定）
  async getMySchedule(staffName: string, startDate: string, endDate: string) {
    // 1. 通常公演を取得（gmsに名前が含まれるもの）
    const { data: scheduleEvents, error } = await supabase
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
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
    
    if (error) throw error
    
    // 2. イベントの参加者数を取得・計算
    const eventIds = scheduleEvents.map(e => e.id)
    const reservationsMap = new Map<string, { participant_count: number }[]>()
    
    if (eventIds.length > 0) {
      const { data: allReservations, error: reservationError } = await supabase
        .from('reservations')
        .select('schedule_event_id, participant_count, status')
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
    
    return myEvents
  },

  // 指定月の公演を取得（通常公演 + 確定した貸切公演）
  async getByMonth(year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    
    // 通常公演を取得
    const { data: scheduleEvents, error } = await supabase
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
          player_count_max
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
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
        // デバッグ: 17時の公演を確認
        if (event.start_time?.startsWith('17:')) {
          console.log('🔍 api.ts getAll: 17時公演のtime_slot:', {
            scenario: event.scenario,
            time_slot_from_db: event.time_slot,
            timeSlot_to_set: timeSlot
          })
        }
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
      
      if (event.current_participants !== actualParticipants) {
        Promise.resolve(supabase
          .from('schedule_events')
          .update({ current_participants: actualParticipants })
          .eq('id', event.id))
          .then(() => {
            logger.log(`参加者数を同期: ${event.id} (${event.current_participants} → ${actualParticipants})`)
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
      
      return {
        ...event,
        current_participants: actualParticipants,
        max_participants: maxParticipants,
        capacity: maxParticipants,
        is_private_booking: isPrivateBooking,
        ...(timeSlot && { timeSlot })
      }
    })
    
    // 確定した貸切公演を取得
    const { data: confirmedPrivateBookings, error: privateError } = await supabase
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
  async getByScenarioId(scenarioId: string, startDate: string, endDate: string) {
    const { data: scheduleEvents, error } = await supabase
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
      
      if (event.current_participants !== actualParticipants) {
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
      
      return {
        ...event,
        current_participants: actualParticipants,
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
  }) {
    const { data, error } = await supabase
      .from('schedule_events')
      .insert([eventData])
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
  }>) {
    const { data, error } = await supabase
      .from('schedule_events')
      .update(updates)
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

  // 公演を削除
  async delete(id: string) {
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

  // 中止でない全公演にデモ参加者を満席まで追加
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
      
      logger.log(`${events.length}件の公演にデモ参加者を追加します`)
      
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
          
          const currentParticipants = reservations?.reduce((sum, reservation) => 
            sum + (reservation.participant_count || 0), 0) || 0
          
          const hasDemoParticipant = reservations?.some(r => 
            r.participant_names?.includes('デモ参加者') || 
            r.participant_names?.some((name: string) => name.includes('デモ'))
          )
          
          if (currentParticipants < event.capacity && !hasDemoParticipant) {
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
            
            const neededParticipants = event.capacity - currentParticipants
            
            const demoReservation = {
              schedule_event_id: event.id,
              title: event.scenario || '',
              scenario_id: event.scenario_id || null,
              store_id: event.store_id || null,
              customer_id: null,
              customer_notes: `デモ参加者${neededParticipants}名`,
              requested_datetime: `${event.date}T${event.start_time}+09:00`,
              duration: scenario?.duration || 120,
              participant_count: neededParticipants,
              participant_names: Array(neededParticipants).fill(null).map((_, i) => `デモ参加者${i + 1}`),
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
            
            await supabase
              .from('schedule_events')
              .update({ current_participants: event.capacity })
              .eq('id', event.id)
            
            logger.log(`デモ参加者${neededParticipants}名を追加しました: ${event.scenario} (${event.date})`)
            successCount++
          } else if (hasDemoParticipant) {
            logger.log(`既にデモ参加者が存在します: ${event.scenario} (${event.date})`)
          } else {
            logger.log(`既に満席です: ${event.scenario} (${event.date})`)
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
  }
}
