import { supabase } from './supabase'
import type { Store, Scenario, Staff } from '@/types'

// 店舗関連のAPI
export const storeApi = {
  // 全店舗を取得
  async getAll(): Promise<Store[]> {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('created_at', { ascending: true })
    
    if (error) throw error
    return data || []
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
    const { data, error } = await supabase
      .from('staff')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // スタッフを削除
  async delete(id: string): Promise<void> {
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
        )
      `)
      .eq('reservation_source', 'web_private')
      .eq('status', 'confirmed')
    
    if (privateError) {
      console.error('確定貸切公演取得エラー:', privateError)
    }
    
    // 貸切公演を schedule_events 形式に変換
    const privateEvents: any[] = []
    if (confirmedPrivateBookings) {
      confirmedPrivateBookings.forEach((booking: any) => {
        if (booking.candidate_datetimes?.candidates) {
          booking.candidate_datetimes.candidates.forEach((candidate: any) => {
            if (candidate.status === 'confirmed') {
              const candidateDate = new Date(candidate.date)
              const candidateDateStr = candidateDate.toISOString().split('T')[0]
              
              // 指定月の範囲内かチェック
              if (candidateDateStr >= startDate && candidateDateStr <= endDate) {
                // タイムスロットから時間を取得
                const timeSlotMap: any = {
                  '朝': { start: '09:00:00', end: '12:00:00' },
                  '午後': { start: '12:00:00', end: '17:00:00' },
                  '夜': { start: '18:00:00', end: '21:00:00' }
                }
                const timeSlot = timeSlotMap[candidate.timeSlot] || { start: '18:00:00', end: '21:00:00' }
                
                privateEvents.push({
                  id: `private-${booking.id}-${candidate.order}`,
                  date: candidateDateStr,
                  venue: booking.store_id,
                  store_id: booking.store_id,
                  scenario: booking.scenarios?.title || '',
                  scenario_id: booking.scenario_id,
                  start_time: timeSlot.start,
                  end_time: timeSlot.end,
                  category: 'private',
                  is_cancelled: false,
                  is_reservation_enabled: false, // 予約サイトでは予約不可
                  current_participants: booking.participant_count,
                  max_participants: booking.scenarios?.player_count_max || 8,
                  capacity: booking.scenarios?.player_count_max || 8,
                  gms: booking.gm_staff ? [booking.gm_staff] : [],
                  stores: booking.stores,
                  scenarios: booking.scenarios,
                  is_private_booking: true // 貸切公演フラグ
                })
              }
            }
          })
        }
      })
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
      .order('date', { ascending: true })
    
    if (error) throw error
    return data || []
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
    let query = supabase
      .from('schedule_events')
      .select(`
        id,
        scenario,
        scenario_id,
        category,
        date,
        stores!inner(id, name),
        scenarios!inner(id, title, author)
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
      .not('scenario_id', 'is', null) // scenario_idがnullでないもののみ

    if (storeId && storeId !== 'all') {
      query = query.eq('store_id', storeId)
    }

    const { data, error } = await query

    if (error) throw error

    console.log('getScenarioPerformance 取得データ:', data?.length || 0, '件')
    console.log('GMテストデータ:', data?.filter(d => d.category === 'gmtest'))
    console.log('全データ詳細:', data?.map(d => ({
      id: d.id,
      scenario: d.scenario,
      scenario_id: d.scenario_id,
      category: d.category,
      title: d.scenarios?.title,
      author: d.scenarios?.author
    })))

    // シナリオ別に集計（カテゴリも考慮）
    const scenarioMap = new Map()
    
    data?.forEach(event => {
      const scenarioId = event.scenario_id || event.scenario // scenario_idを優先、なければscenario
      const scenarioTitle = event.scenarios?.title || event.scenario || '未定'
      const author = event.scenarios?.author || '不明'
      const category = event.category || 'open'
      
      // シナリオID + カテゴリの組み合わせでキーを作成
      const key = `${scenarioId}_${category}`
      
      if (scenarioMap.has(key)) {
        const existing = scenarioMap.get(key)
        existing.events += 1
        existing.stores.add(event.stores.name)
      } else {
        scenarioMap.set(key, {
          id: scenarioId,
          title: scenarioTitle,
          author: author,
          category: category,
          events: 1,
          stores: new Set([event.stores.name])
        })
      }
    })

    const result = Array.from(scenarioMap.values()).map(item => ({
      ...item,
      stores: Array.from(item.stores)
    }))

    console.log('集計結果:', result.length, '件')
    console.log('GMテスト集計結果:', result.filter(r => r.category === 'gmtest'))
    console.log('集計詳細:', result.map(r => ({
      title: r.title,
      author: r.author,
      category: r.category,
      events: r.events,
      stores: r.stores
    })))
    
    // 作者別の集計も確認
    const authorSummary = result.reduce((acc, item) => {
      if (!acc[item.author]) {
        acc[item.author] = { totalEvents: 0, scenarios: [] }
      }
      acc[item.author].totalEvents += item.events
      acc[item.author].scenarios.push({
        title: item.title,
        category: item.category,
        events: item.events
      })
      return acc
    }, {} as Record<string, { totalEvents: number, scenarios: any[] }>)
    
    console.log('作者別集計:', authorSummary)
    return result
  }
}
