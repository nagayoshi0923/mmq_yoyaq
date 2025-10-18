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
    // スタッフ情報を取得（名前が必要）
    const { data: staffData, error: fetchError } = await supabase
      .from('staff')
      .select('name')
      .eq('id', id)
      .single()
    
    if (fetchError) throw fetchError
    const staffName = staffData.name
    
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
                gmNames = booking.gm_availability_responses
                  ?.filter((r: GMAvailabilityResponse) => r.response_status === 'available')
                  ?.map((r: GMAvailabilityResponse) => r.staff?.name)
                  ?.filter((name): name is string => !!name) || []
              }
              
              if (gmNames.length === 0) {
                gmNames = ['未定']
              }
              
              const scenarioData = Array.isArray(booking.scenarios) ? booking.scenarios[0] : booking.scenarios
              
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
                is_private_booking: true // 貸切公演フラグ
              })
            }
          }
        }
      }
    }
    
    // 通常公演と貸切公演を結合してソート
    const allEvents = [...(scheduleEvents || []), ...privateEvents]
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
      .select('id, title, author, participation_fee, participation_costs, license_amount, gm_test_license_amount')
    
    if (scenariosError) {
      // scenarios fetch error
    }
    
    // シナリオ名でマッピング（scenario_idがない場合のフォールバック）
    const scenarioMap = new Map()
    scenarios?.forEach(s => {
      scenarioMap.set(s.title, s)
    })
    
    // シナリオ情報を手動で結合 & 売上を計算
    const enrichedEvents = events.map(event => {
      let scenarioInfo = null
      
      // scenario_idがあればそれを使用、なければscenario（TEXT）からマッチング
      if (event.scenario_id && scenarios) {
        scenarioInfo = scenarios.find(s => s.id === event.scenario_id)
      } else if (event.scenario) {
        scenarioInfo = scenarioMap.get(event.scenario)
      }
      
      // 売上を計算: 参加人数 × 参加費
      const participantCount = event.current_participants || 0
      const participationFee = scenarioInfo?.participation_fee || 0
      const revenue = participantCount * participationFee
      
      return {
        ...event,
        scenarios: scenarioInfo,
        revenue
      }
    })
    
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
          participation_fee
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
          participation_fee
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
      .select('id, name, short_name')
      .order('name', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // シナリオ別公演数データ取得
  async getScenarioPerformance(startDate: string, endDate: string, storeId?: string) {
    // まずschedule_eventsを取得（scenario_idの有無に関わらず全て）
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
      .select('id, title, author, license_amount, gm_test_license_amount')
    
    if (scenariosError) {
      // scenarios fetch error
    }

    // シナリオ名でマッピング
    const scenarioMap = new Map()
    scenarios?.forEach(s => {
      scenarioMap.set(s.title, s)
    })

    // シナリオ別に集計（カテゴリも考慮）
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
        const key = `${scenarioInfo.id}_${category}`
        
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
            category: category,
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
