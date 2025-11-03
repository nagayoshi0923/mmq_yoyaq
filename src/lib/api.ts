import { supabase } from './supabase'
import type { Store, Scenario, Staff } from '@/types'

// 候補日時の型定義
interface CandidateDateTime {
  order: number
  date: string
  startTime?: string
  endTime?: string
  status?: 'confirmed' | 'pending' | 'rejected'
}

// GM空き状況レスポンスの型定義
interface GMAvailabilityResponse {
  response_status: 'available' | 'unavailable'
  staff?: {
    name: string
  }
}

// スケジュールイベントの型定義（schedule_eventsテーブル互換）
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
  stores?: any
  scenarios?: any
  is_private_booking?: boolean
}

// ページネーション用のレスポンス型
interface PaginatedResponse<T> {
  data: T[]
  count: number
  hasMore: boolean
}

// 店舗関連のAPI
export const storeApi = {
  // 全店舗を取得
  async getAll(): Promise<Store[]> {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
    
    if (error) throw error
    
    // 指定された順序で並び替え（店舗名で判定）
    const storeOrder = ['高田馬場店', '別館①', '別館②', '大久保店', '大塚店', '埼玉大宮店']
    const sortedData = (data || []).sort((a, b) => {
      const indexA = storeOrder.indexOf(a.name)
      const indexB = storeOrder.indexOf(b.name)
      // 両方が順序リストにある場合は順序に従う
      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      // 一方だけが順序リストにある場合は、リストにあるものを先に
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      // どちらも順序リストにない場合は名前順
      return a.name.localeCompare(b.name, 'ja')
    })
    
    return sortedData
  },

  // 店舗を作成
  async create(store: Omit<Store, 'id' | 'created_at' | 'updated_at'>): Promise<Store> {
    const { data, error } = await supabase
      .from('stores')
      .insert([store])
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 店舗を更新
  async update(id: string, updates: Partial<Store>): Promise<Store> {
    const { data, error } = await supabase
      .from('stores')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 店舗を削除
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }
}

// シナリオ関連のAPI
export const scenarioApi = {
  // 全シナリオを取得
  async getAll(): Promise<Scenario[]> {
    const { data, error } = await supabase
      .from('scenarios')
      .select('*')
      .order('title', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // ページネーション対応：シナリオを取得
  async getPaginated(page: number = 0, pageSize: number = 20): Promise<PaginatedResponse<Scenario>> {
    const from = page * pageSize
    const to = from + pageSize - 1
    
    // データ取得とカウントを同時に実行
    const { data, error, count } = await supabase
      .from('scenarios')
      .select('*', { count: 'exact' })
      .order('title', { ascending: true })
      .range(from, to)
    
    if (error) throw error
    
    return {
      data: data || [],
      count: count || 0,
      hasMore: count ? (from + pageSize) < count : false
    }
  },

  // シナリオを作成
  async create(scenario: Omit<Scenario, 'id' | 'created_at' | 'updated_at'>): Promise<Scenario> {
    const { data, error } = await supabase
      .from('scenarios')
      .insert([scenario])
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // シナリオを更新
  async update(id: string, updates: Partial<Scenario>): Promise<Scenario> {
    const { data, error } = await supabase
      .from('scenarios')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // シナリオを削除
  async delete(id: string): Promise<void> {
    // 関連データの参照をクリア（スケジュールイベントは削除しない）
    
    // 1. reservationsのscenario_idをNULLに設定
    const { error: reservationError } = await supabase
      .from('reservations')
      .update({ scenario_id: null })
      .eq('scenario_id', id)
    
    if (reservationError) throw reservationError
    
    // 2. schedule_eventsのscenario_idをNULLに設定（イベント自体は残す）
    const { error: scheduleError } = await supabase
      .from('schedule_events')
      .update({ scenario_id: null })
      .eq('scenario_id', id)
    
    if (scheduleError) throw scheduleError
    
    // 3. staff_scenario_assignmentsの削除
    const { error: assignmentError } = await supabase
      .from('staff_scenario_assignments')
      .delete()
      .eq('scenario_id', id)
    
    if (assignmentError) throw assignmentError
    
    // 4. performance_kitsの削除
    const { error: kitsError } = await supabase
      .from('performance_kits')
      .delete()
      .eq('scenario_id', id)
    
    if (kitsError) throw kitsError
    
    // 5. スタッフのspecial_scenariosからこのシナリオを削除
    const { data: affectedStaff, error: staffError } = await supabase
      .from('staff')
      .select('id, special_scenarios')
      .contains('special_scenarios', [id])
    
    if (staffError) throw staffError
    
    // 各スタッフのspecial_scenariosからシナリオIDを削除
    if (affectedStaff && affectedStaff.length > 0) {
      const updatePromises = affectedStaff.map(staff => {
        const newScenarios = (staff.special_scenarios || []).filter((sid: string) => sid !== id)
        return supabase
          .from('staff')
          .update({ special_scenarios: newScenarios })
          .eq('id', staff.id)
      })
      
      await Promise.all(updatePromises)
    }
    
    // 6. シナリオ本体の削除
    const { error } = await supabase
      .from('scenarios')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  },

  // シナリオの担当GMを更新
  async updateAvailableGms(id: string, availableGms: string[]): Promise<Scenario> {
    const { data, error } = await supabase
      .from('scenarios')
      .update({ available_gms: availableGms })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // シナリオの担当GMを更新（スタッフのspecial_scenariosも同期更新）
  async updateAvailableGmsWithSync(id: string, availableGms: string[]): Promise<Scenario> {
    // シナリオの担当GMを更新
    const { data: updatedScenario, error: updateError } = await supabase
      .from('scenarios')
      .update({ available_gms: availableGms })
      .eq('id', id)
      .select()
      .single()
    
    if (updateError) throw updateError

    // 全スタッフを取得して、各スタッフのspecial_scenariosを更新
    const { data: allStaff, error: staffError } = await supabase
      .from('staff')
      .select('id, name, special_scenarios')
    
    if (staffError) throw staffError

    // 各スタッフのspecial_scenariosを更新
    const updatePromises = allStaff?.map(async (staff) => {
      const currentScenarios = staff.special_scenarios || []
      const staffName = staff.name
      
      // このスタッフが担当GMに含まれているかチェック
      const isAssigned = availableGms.includes(staffName)
      const isCurrentlyAssigned = currentScenarios.includes(id)
      
      let newScenarios = [...currentScenarios]
      
      if (isAssigned && !isCurrentlyAssigned) {
        // 担当GMに追加された場合、special_scenariosに追加
        newScenarios.push(id)
      } else if (!isAssigned && isCurrentlyAssigned) {
        // 担当GMから削除された場合、special_scenariosから削除
        newScenarios = newScenarios.filter(scenarioId => scenarioId !== id)
      }
      
      // 変更がある場合のみ更新
      if (JSON.stringify(newScenarios.sort()) !== JSON.stringify(currentScenarios.sort())) {
        return supabase
          .from('staff')
          .update({ special_scenarios: newScenarios })
          .eq('id', staff.id)
      }
      
      return Promise.resolve()
    }) || []

    // 全てのスタッフ更新を実行
    await Promise.all(updatePromises)

    return updatedScenario
  }
}

// スタッフ関連のAPI
export const staffApi = {
  // 全スタッフを取得
  async getAll(): Promise<Staff[]> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('name', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // スタッフを作成
  async create(staff: Omit<Staff, 'id' | 'created_at' | 'updated_at'>): Promise<Staff> {
    const { data, error } = await supabase
      .from('staff')
      .insert([staff])
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // スタッフを更新
  async update(id: string, updates: Partial<Staff>): Promise<Staff> {
    // 名前が変更される場合、古い名前を取得
    let oldName: string | null = null
    if (updates.name) {
      const { data: oldData, error: fetchError } = await supabase
        .from('staff')
        .select('name')
        .eq('id', id)
        .single()
      
      if (fetchError) throw fetchError
      oldName = oldData.name
    }
    
    // スタッフ情報を更新
    const { data, error } = await supabase
      .from('staff')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    
    // 名前が変更された場合、スケジュールと予約も更新
    if (oldName && updates.name && oldName !== updates.name) {
      const newName = updates.name
      
      // 1. schedule_eventsのgms配列を更新
      const { data: scheduleEvents, error: scheduleError } = await supabase
        .from('schedule_events')
        .select('id, gms')
        .contains('gms', [oldName])
      
      if (!scheduleError && scheduleEvents && scheduleEvents.length > 0) {
        const updatePromises = scheduleEvents.map(event => {
          const newGms = (event.gms || []).map((gm: string) => gm === oldName ? newName : gm)
          return supabase
            .from('schedule_events')
            .update({ gms: newGms })
            .eq('id', event.id)
        })
        
        await Promise.all(updatePromises)
      }
      
      // 2. reservationsのassigned_staff配列を更新
      const { data: reservations, error: resError } = await supabase
        .from('reservations')
        .select('id, assigned_staff, gm_staff')
        .or(`assigned_staff.cs.{${oldName}},gm_staff.eq.${oldName}`)
      
      if (!resError && reservations && reservations.length > 0) {
        const updatePromises = reservations.map(reservation => {
          const updates: { assigned_staff?: string[]; gm_staff?: string } = {}
          
          // assigned_staff配列を更新
          if (reservation.assigned_staff && reservation.assigned_staff.includes(oldName)) {
            updates.assigned_staff = reservation.assigned_staff.map((s: string) => s === oldName ? newName : s)
          }
          
          // gm_staffを更新
          if (reservation.gm_staff === oldName) {
            updates.gm_staff = newName
          }
          
          return supabase
            .from('reservations')
            .update(updates)
            .eq('id', reservation.id)
        })
        
        await Promise.all(updatePromises)
      }
    }
    
    return data
  },

  // スタッフを削除
  async delete(id: string): Promise<void> {
    // スタッフ情報を取得（名前とuser_idが必要）
    const { data: staffData, error: fetchError } = await supabase
      .from('staff')
      .select('name, user_id')
      .eq('id', id)
      .single()
    
    if (fetchError) throw fetchError
    const staffName = staffData.name
    const userId = staffData.user_id
    
    // 関連データの処理
    
    // 1. shift_submissionsの削除
    const { error: shiftError } = await supabase
      .from('shift_submissions')
      .delete()
      .eq('staff_id', id)
    
    if (shiftError) throw shiftError
    
    // 2. staff_scenario_assignmentsの削除
    const { error: assignmentError } = await supabase
      .from('staff_scenario_assignments')
      .delete()
      .eq('staff_id', id)
    
    if (assignmentError) throw assignmentError
    
    // 3. schedule_eventsのgms配列からスタッフ名を削除（イベント自体は残す）
    const { data: scheduleEvents, error: scheduleError } = await supabase
      .from('schedule_events')
      .select('id, gms')
      .contains('gms', [staffName])
    
    if (scheduleError) throw scheduleError
    
    if (scheduleEvents && scheduleEvents.length > 0) {
      const updatePromises = scheduleEvents.map(event => {
        const newGms = (event.gms || []).filter((gm: string) => gm !== staffName)
        return supabase
          .from('schedule_events')
          .update({ gms: newGms })
          .eq('id', event.id)
      })
      
      await Promise.all(updatePromises)
    }
    
    // 4. reservationsのassigned_staff配列からスタッフ名を削除
    const { data: reservations, error: resError } = await supabase
      .from('reservations')
      .select('id, assigned_staff, gm_staff')
      .or(`assigned_staff.cs.{${staffName}},gm_staff.eq.${staffName}`)
    
    if (resError) throw resError
    
    if (reservations && reservations.length > 0) {
      const updatePromises = reservations.map(reservation => {
        const updates: { assigned_staff?: string[]; gm_staff?: string | null } = {}
        
        // assigned_staff配列から削除
        if (reservation.assigned_staff && reservation.assigned_staff.includes(staffName)) {
          updates.assigned_staff = reservation.assigned_staff.filter((s: string) => s !== staffName)
        }
        
        // gm_staffをNULLに設定
        if (reservation.gm_staff === staffName) {
          updates.gm_staff = null
        }
        
        return supabase
          .from('reservations')
          .update(updates)
          .eq('id', reservation.id)
      })
      
      await Promise.all(updatePromises)
    }
    
    // 5. スタッフ本体の削除
    const { error } = await supabase
      .from('staff')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    
    // 6. auth.usersとusersテーブルからユーザーを削除（user_idが紐付いている場合）
    if (userId) {
      try {
        // auth.usersから削除（admin権限が必要）
        const { error: authError } = await supabase.auth.admin.deleteUser(userId)
        if (authError) {
          console.warn('auth.usersの削除に失敗しました:', authError)
          // エラーでも処理を続行（スタッフは既に削除済みのため）
        }
        
        // usersテーブルから削除（カスケード削除されない場合のため）
        const { error: usersError } = await supabase
          .from('users')
          .delete()
          .eq('id', userId)
        
        if (usersError) {
          console.warn('usersテーブルの削除に失敗しました:', usersError)
          // エラーでも処理を続行
        }
      } catch (deleteError) {
        console.warn('ユーザー削除でエラーが発生しました:', deleteError)
        // スタッフは既に削除済みなので、エラーでも処理を続行
      }
    }
  },

  // スタッフの担当シナリオを更新（シナリオのavailable_gmsも同期更新）
  async updateSpecialScenarios(id: string, specialScenarios: string[]): Promise<Staff> {
    // スタッフ情報を取得
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('name')
      .eq('id', id)
      .single()
    
    if (staffError) throw staffError
    if (!staffData) throw new Error('スタッフが見つかりません')

    // スタッフの担当シナリオを更新
    const { data: updatedStaff, error: updateError } = await supabase
      .from('staff')
      .update({ special_scenarios: specialScenarios })
      .eq('id', id)
      .select()
      .single()
    
    if (updateError) throw updateError

    // 全シナリオを取得して、各シナリオのavailable_gmsを更新
    const { data: allScenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, available_gms')
    
    if (scenariosError) throw scenariosError

    // 各シナリオのavailable_gmsを更新
    const updatePromises = allScenarios?.map(async (scenario) => {
      const currentGms = scenario.available_gms || []
      const staffName = staffData.name
      
      // このシナリオが担当シナリオに含まれているかチェック
      const isAssigned = specialScenarios.includes(scenario.id)
      const isCurrentlyAssigned = currentGms.includes(staffName)
      
      let newGms = [...currentGms]
      
      if (isAssigned && !isCurrentlyAssigned) {
        // 担当シナリオに追加された場合、available_gmsに追加
        newGms.push(staffName)
      } else if (!isAssigned && isCurrentlyAssigned) {
        // 担当シナリオから削除された場合、available_gmsから削除
        newGms = newGms.filter(gm => gm !== staffName)
      }
      
      // 変更がある場合のみ更新
      if (JSON.stringify(newGms.sort()) !== JSON.stringify(currentGms.sort())) {
        return supabase
          .from('scenarios')
          .update({ available_gms: newGms })
          .eq('id', scenario.id)
      }
      
      return Promise.resolve()
    }) || []

    // 全てのシナリオ更新を実行
    await Promise.all(updatePromises)

    return updatedStaff
  }
}

// 公演スケジュール関連のAPI
export const scheduleApi = {
  // 指定月の公演を取得（通常公演 + 確定した貸切公演）
  async getByMonth(year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate() // monthは1-12なので、翌月の0日目=当月末日
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
          color
        ),
        scenarios:scenario_id (
          id,
          title
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
    
    if (error) throw error
    
    // 各イベントの実際の参加者数を計算
    const eventsWithActualParticipants = await Promise.all(scheduleEvents.map(async (event) => {
      // このイベントの予約データを取得（貸切予約の場合はtimeSlotも取得）
      const { data: reservations, error: reservationError } = await supabase
        .from('reservations')
        .select('participant_count, candidate_datetimes, reservation_source')
        .eq('schedule_event_id', event.id)
        .in('status', ['confirmed', 'pending', 'gm_confirmed'])
      
      if (reservationError) {
        console.error('予約データの取得に失敗:', reservationError)
        return event
      }
      
      // 実際の参加者数を計算
      const actualParticipants = reservations?.reduce((sum, reservation) => 
        sum + (reservation.participant_count || 0), 0) || 0
      
      // 時間帯（timeSlot）を取得
      let timeSlot: string | undefined
      let isPrivateBooking = false
      
      // 通常公演の場合、schedule_eventsのtime_slotカラムを使用
      if (event.category !== 'private' && event.time_slot) {
        timeSlot = event.time_slot
      } else if (event.category === 'private') {
        // 貸切予約の場合、schedule_event_idが紐付いている貸切予約からtimeSlotを取得
        isPrivateBooking = true
        const privateReservation = reservations?.find(r => r.reservation_source === 'web_private')
        if (privateReservation?.candidate_datetimes?.candidates) {
          // 確定済みの候補を探す
          const confirmedCandidate = privateReservation.candidate_datetimes.candidates.find(
            (c: any) => c.status === 'confirmed'
          )
          if (confirmedCandidate?.timeSlot) {
            timeSlot = confirmedCandidate.timeSlot
          } else if (privateReservation.candidate_datetimes.candidates[0]?.timeSlot) {
            // フォールバック：最初の候補のtimeSlotを使用
            timeSlot = privateReservation.candidate_datetimes.candidates[0].timeSlot
          }
        }
      }
      
      // schedule_eventsのcurrent_participantsが実際の値と異なる場合は更新
      if (event.current_participants !== actualParticipants) {
        try {
          await supabase
            .from('schedule_events')
            .update({ current_participants: actualParticipants })
            .eq('id', event.id)
          
          console.log(`参加者数を同期: ${event.id} (${event.current_participants} → ${actualParticipants})`)
        } catch (error) {
          console.error('参加者数の同期に失敗:', error)
        }
      }
      
      return {
        ...event,
        current_participants: actualParticipants,
        is_private_booking: isPrivateBooking,
        ...(timeSlot && { timeSlot })
      }
    }))
    
    // 確定した貸切公演を取得（schedule_event_idが紐付いていないもののみ）
    // schedule_event_idが紐付いているものは既にschedule_eventsから取得済みのため除外
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
          color
        ),
        gm_availability_responses (
          staff_id,
          response_status,
          staff:staff_id (name)
        )
      `)
      .eq('reservation_source', 'web_private')
      .eq('status', 'confirmed')
      .is('schedule_event_id', null) // schedule_event_idがNULLのもののみ（まだschedule_eventsにリンクされていないもの）
    
    if (privateError) {
      // 確定貸切公演取得エラー
    }
    
    // 貸切公演を schedule_events 形式に変換
    const privateEvents: ScheduleEvent[] = []
    if (confirmedPrivateBookings) {
      for (const booking of confirmedPrivateBookings) {
        if (booking.candidate_datetimes?.candidates) {
          // 確定済みの候補のみ取得（最初の1つだけ）
          const confirmedCandidates = booking.candidate_datetimes.candidates.filter((c: CandidateDateTime) => c.status === 'confirmed')
          const candidatesToShow = confirmedCandidates.length > 0 
            ? confirmedCandidates.slice(0, 1)  // 確定候補がある場合は最初の1つ
            : booking.candidate_datetimes.candidates.slice(0, 1)  // フォールバック
          
          for (const candidate of candidatesToShow) {
            const candidateDate = new Date(candidate.date)
            const candidateDateStr = candidateDate.toISOString().split('T')[0]
            
            // 指定月の範囲内かチェック
            if (candidateDateStr >= startDate && candidateDateStr <= endDate) {
              // 候補の実際の時間を使用（startTime, endTimeがある場合）
              const startTime = candidate.startTime || '18:00:00'
              const endTime = candidate.endTime || '21:00:00'
              
              // GMの名前を取得
              let gmNames: string[] = []
              
              // まずgm_staffからstaffテーブルで名前を取得
              if (booking.gm_staff) {
                // staffテーブルからGM名を取得するクエリを実行
                const { data: gmStaff, error: gmError } = await supabase
                  .from('staff')
                  .select('id, name')
                  .eq('id', booking.gm_staff)
                  .maybeSingle()
                
                if (!gmError && gmStaff) {
                  gmNames = [gmStaff.name]
                }
              }
              
              // gmsから取得できなかった場合はgm_availability_responsesから取得
              if (gmNames.length === 0 && booking.gm_availability_responses) {
                const responses = Array.isArray(booking.gm_availability_responses) 
                  ? booking.gm_availability_responses 
                  : []
                gmNames = responses
                  .filter((r: any) => r.response_status === 'available')
                  .map((r: any) => {
                    // staffが配列の場合は最初の要素を取得、オブジェクトの場合はそのまま
                    const staff = Array.isArray(r.staff) ? r.staff[0] : r.staff
                    return staff?.name
                  })
                  .filter((name): name is string => !!name) || []
              }
              
              if (gmNames.length === 0) {
                gmNames = ['未定']
              }
              
              const scenarioData = Array.isArray(booking.scenarios) ? booking.scenarios[0] : booking.scenarios
              
              // timeSlotを取得（朝/昼/夜）
              const timeSlot = candidate.timeSlot || ''
              
              privateEvents.push({
                id: `private-${booking.id}-${candidate.order}`,
                date: candidateDateStr,
                venue: booking.store_id,
                store_id: booking.store_id,
                scenario: scenarioData?.title || '',
                scenario_id: booking.scenario_id,
                start_time: startTime,
                end_time: endTime,
                category: 'private',
                is_cancelled: false,
                is_reservation_enabled: true, // 貸切公演は常に公開中
                current_participants: booking.participant_count,
                max_participants: scenarioData?.player_count_max || 8,
                capacity: scenarioData?.player_count_max || 8,
                gms: gmNames,
                stores: booking.stores,
                scenarios: scenarioData,
                is_private_booking: true, // 貸切公演フラグ
                timeSlot: timeSlot // 貸切予約の時間帯（朝/昼/夜）を保持
              })
            }
          }
        }
      }
    }
    
    // 通常公演と貸切公演を結合してソート
    const allEvents = [...(eventsWithActualParticipants || []), ...privateEvents]
    allEvents.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      return a.start_time.localeCompare(b.start_time)
    })
    
    return allEvents
  },

  // 公演を作成
  async create(eventData: {
    date: string
    store_id: string
    venue?: string
    scenario?: string
    category: string
    start_time: string
    end_time: string
    capacity?: number
    gms?: string[]
    notes?: string
    time_slot?: string | null // 時間帯（朝/昼/夜）
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
          title
        )
      `)
      .single()
    
    if (error) throw error
    return data
  },

  // 公演を更新
  async update(id: string, updates: Partial<{
    scenario_id: string
    scenario: string
    category: string
    start_time: string
    end_time: string
    capacity: number
    gms: string[]
    notes: string
    is_cancelled: boolean
    is_reservation_enabled: boolean
    time_slot: string | null // 時間帯（朝/昼/夜）
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
      // 中止でない全公演を取得
      const { data: events, error: eventsError } = await supabase
        .from('schedule_events')
        .select('*')
        .eq('is_cancelled', false)
        .order('date', { ascending: true })
      
      if (eventsError) {
        console.error('公演データの取得に失敗:', eventsError)
        return { success: false, error: eventsError }
      }
      
      if (!events || events.length === 0) {
        console.log('中止でない公演が見つかりません')
        return { success: true, message: '中止でない公演が見つかりません' }
      }
      
      console.log(`${events.length}件の公演にデモ参加者を追加します`)
      
      let successCount = 0
      let errorCount = 0
      
      for (const event of events) {
        try {
          // このイベントの現在の予約データを取得
          const { data: reservations, error: reservationError } = await supabase
            .from('reservations')
            .select('participant_count, participant_names')
            .eq('schedule_event_id', event.id)
            .in('status', ['confirmed', 'pending'])
          
          if (reservationError) {
            console.error(`予約データの取得に失敗 (${event.id}):`, reservationError)
            errorCount++
            continue
          }
          
          // 現在の参加者数を計算
          const currentParticipants = reservations?.reduce((sum, reservation) => 
            sum + (reservation.participant_count || 0), 0) || 0
          
          // デモ参加者が既に存在するかチェック
          const hasDemoParticipant = reservations?.some(r => 
            r.participant_names?.includes('デモ参加者') || 
            r.participant_names?.some(name => name.includes('デモ'))
          )
          
          // 満席でない場合、またはデモ参加者がいない場合は追加
          if (currentParticipants < event.capacity && !hasDemoParticipant) {
            // シナリオ情報を取得
            const { data: scenario, error: scenarioError } = await supabase
              .from('scenarios')
              .select('id, title, duration, participation_fee, gm_test_participation_fee')
              .eq('id', event.scenario_id)
              .single()
            
            if (scenarioError) {
              console.error(`シナリオ情報の取得に失敗 (${event.id}):`, scenarioError)
              errorCount++
              continue
            }
            
            // デモ参加者の参加費を計算
            const isGmTest = event.category === 'gmtest'
            const participationFee = isGmTest 
              ? (scenario?.gm_test_participation_fee || scenario?.participation_fee || 0)
              : (scenario?.participation_fee || 0)
            
            // 満席まで必要なデモ参加者数を計算
            const neededParticipants = event.capacity - currentParticipants
            
            // デモ参加者の予約を作成
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
            
            // デモ参加者の予約を作成
            const { error: insertError } = await supabase
              .from('reservations')
              .insert(demoReservation)
            
            if (insertError) {
              console.error(`デモ参加者の予約作成に失敗 (${event.id}):`, insertError)
              errorCount++
              continue
            }
            
            // schedule_eventsのcurrent_participantsを更新
            await supabase
              .from('schedule_events')
              .update({ current_participants: event.capacity })
              .eq('id', event.id)
            
            console.log(`デモ参加者${neededParticipants}名を追加しました: ${event.scenario} (${event.date})`)
            successCount++
          } else if (hasDemoParticipant) {
            console.log(`既にデモ参加者が存在します: ${event.scenario} (${event.date})`)
          } else {
            console.log(`既に満席です: ${event.scenario} (${event.date})`)
          }
        } catch (error) {
          console.error(`デモ参加者の追加に失敗 (${event.id}):`, error)
          errorCount++
        }
      }
      
      console.log(`デモ参加者追加完了: 成功${successCount}件, エラー${errorCount}件`)
      
      return {
        success: true,
        message: `デモ参加者追加完了: 成功${successCount}件, エラー${errorCount}件`,
        successCount,
        errorCount
      }
    } catch (error) {
      console.error('デモ参加者追加処理でエラー:', error)
      return { success: false, error }
    }
  }
}

// メモ関連のAPI
export const memoApi = {
  // 指定月のメモを取得
  async getByMonth(year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    
    const { data, error } = await supabase
      .from('daily_memos')
      .select(`
        *,
        stores:venue_id (
          id,
          name,
          short_name
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // メモを保存（UPSERT）
  async save(date: string, venueId: string, memoText: string) {
    const { data, error } = await supabase
      .from('daily_memos')
      .upsert({
        date,
        venue_id: venueId,
        memo_text: memoText,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'date,venue_id'
      })
      .select()
    
    if (error) throw error
    return data
  },

  // メモを削除
  async delete(date: string, venueId: string) {
    const { error } = await supabase
      .from('daily_memos')
      .delete()
      .eq('date', date)
      .eq('venue_id', venueId)
    
    if (error) throw error
  }
}

// 売上分析関連のAPI
export const salesApi = {
  // 期間別売上データを取得
  async getSalesByPeriod(startDate: string, endDate: string) {
    // まずschedule_eventsを取得
    const { data: events, error } = await supabase
      .from('schedule_events')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
      .order('date', { ascending: true })
    
    if (error) {
      throw error
    }
    
    if (!events || events.length === 0) {
      return []
    }
    
    // 全シナリオを取得
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, title, author, duration, participation_fee, gm_test_participation_fee, participation_costs, license_amount, gm_test_license_amount, gm_costs, production_costs, required_props')
    
    if (scenariosError) {
      // scenarios fetch error
    }
    
    // 全スタッフを取得（スタッフ参加の判定用）
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('name')
    
    if (staffError) {
      console.error('スタッフデータの取得に失敗:', staffError)
    }
    
    const staffNames = new Set(staff?.map(s => s.name) || [])
    
    // シナリオ名でマッピング（scenario_idがない場合のフォールバック）
    const scenarioMap = new Map()
    scenarios?.forEach(s => {
      scenarioMap.set(s.title, s)
    })
    
    // 各イベントの実際の予約データを取得して売上を計算
    const enrichedEvents = await Promise.all(events.map(async (event) => {
      let scenarioInfo = null
      
      // scenario_idがあればそれを使用、なければscenario（TEXT）からマッチング
      if (event.scenario_id && scenarios) {
        scenarioInfo = scenarios.find(s => s.id === event.scenario_id)
      } else if (event.scenario) {
        scenarioInfo = scenarioMap.get(event.scenario)
      }
      
      // このイベントの予約データを取得
      const { data: reservations, error: reservationError } = await supabase
        .from('reservations')
        .select('participant_count, participant_names, payment_method, final_price')
        .eq('schedule_event_id', event.id)
        .in('status', ['confirmed', 'pending'])
      
      if (reservationError) {
        console.error('予約データの取得に失敗:', reservationError)
      }
      
      // 実際の参加者数と売上を計算
      let totalParticipants = 0
      let totalRevenue = 0
      
      reservations?.forEach(reservation => {
        const participantCount = reservation.participant_count || 0
        totalParticipants += participantCount
        
        // 参加者名をチェックしてスタッフかどうか判定
        const participantNames = reservation.participant_names || []
        const hasStaffParticipant = participantNames.some(name => staffNames.has(name))
        
        if (hasStaffParticipant || reservation.payment_method === 'staff') {
          // スタッフ参加の場合は参加費0円
          totalRevenue += 0
        } else {
          // 通常参加の場合は実際の支払い金額を使用
          totalRevenue += reservation.final_price || 0
        }
      })
      
      // デモ参加者は既にreservationsに含まれているのでカウント不要
      // デモ参加者の追加は別のツール（AddDemoParticipants）で行う
      
      return {
        ...event,
        scenarios: scenarioInfo,
        revenue: totalRevenue,
        actual_participants: totalParticipants, // 実際の参加者数
        has_demo_participant: totalParticipants >= (event.max_participants || event.capacity || 0) // デモ参加者がいるかどうか
      }
    }))
    
    return enrichedEvents
  },

  // 店舗別売上データを取得
  async getSalesByStore(startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('schedule_events')
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
          author,
          duration,
          participation_fee,
          gm_test_participation_fee,
          participation_costs,
          license_amount,
          gm_test_license_amount,
          gm_costs
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
    
    if (error) throw error
    return data || []
  },

  // シナリオ別売上データを取得
  async getSalesByScenario(startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('schedule_events')
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
          author,
          duration,
          participation_fee,
          gm_test_participation_fee,
          participation_costs,
          license_amount,
          gm_test_license_amount,
          gm_costs
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
    
    if (error) throw error
    return data || []
  },

  // 作者別公演実行回数を取得
  async getPerformanceCountByAuthor(startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('schedule_events')
      .select(`
        date,
        scenarios:scenario_id (
          id,
          title,
          author
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
    
    if (error) throw error
    return data || []
  },

  // 店舗一覧を取得
  async getStores() {
    const { data, error } = await supabase
      .from('stores')
      .select('id, name, short_name, fixed_costs, ownership_type')
      .order('name', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // シナリオ別公演数データ取得
  async getScenarioPerformance(startDate: string, endDate: string, storeId?: string) {
    // schedule_eventsを取得（scenario_idの有無に関わらず全て）
    let query = supabase
      .from('schedule_events')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)

    if (storeId && storeId !== 'all') {
      query = query.eq('store_id', storeId)
    }

    const { data: events, error } = await query

    if (error) throw error

    if (!events || events.length === 0) {
      return []
    }

    // 全シナリオを取得
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, title, author, license_amount, gm_test_license_amount, gm_costs')
    
    if (scenariosError) {
      console.error('scenarios取得エラー:', scenariosError)
    }

    // シナリオ名でマッピング
    const scenarioMap = new Map()
    scenarios?.forEach(s => {
      scenarioMap.set(s.title, s)
    })

    // シナリオ別に集計（GMテストのみ分離、それ以外は統合）
    const performanceMap = new Map()
    
    events.forEach(event => {
      // シナリオ情報を取得（scenario_idまたはscenario名から）
      let scenarioInfo = null
      if (event.scenario_id && scenarios) {
        scenarioInfo = scenarios.find(s => s.id === event.scenario_id)
      } else if (event.scenario) {
        scenarioInfo = scenarioMap.get(event.scenario)
      }

      if (!scenarioInfo && event.scenario) {
        // シナリオ情報が見つからない場合はscenario名をそのまま使用
        scenarioInfo = {
          id: event.scenario,
          title: event.scenario,
          author: '不明'
        }
      }

      if (scenarioInfo) {
        const category = event.category || 'open'
        // GMテストのみ分離、それ以外（open, private等）は統合
        const isGMTest = category === 'gmtest'
        const key = isGMTest ? `${scenarioInfo.id}_gmtest` : scenarioInfo.id
        
        if (performanceMap.has(key)) {
          const existing = performanceMap.get(key)
          existing.events += 1
          if (event.venue) {
            existing.stores.add(event.venue)
          }
        } else {
          performanceMap.set(key, {
            id: scenarioInfo.id,
            title: scenarioInfo.title,
            author: scenarioInfo.author,
            category: isGMTest ? 'gmtest' : 'open',  // GMテストかそれ以外
            events: 1,
            stores: new Set(event.venue ? [event.venue] : [])
          })
        }
      }
    })

    const result = Array.from(performanceMap.values()).map(item => ({
      ...item,
      stores: Array.from(item.stores)
    }))

    return result
  }
}
