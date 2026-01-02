/**
 * シナリオ関連API
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { Scenario } from '@/types'
import type { PaginatedResponse } from './types'
import { logger } from '@/utils/logger'

export const scenarioApi = {
  // 全シナリオを取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  // skipOrgFilter: trueの場合、組織フィルタをスキップ（全組織のデータを取得）
  async getAll(organizationId?: string, skipOrgFilter?: boolean): Promise<Scenario[]> {
    let query = supabase
      .from('scenarios')
      .select('*')
    
    // 組織フィルタリング
    if (!skipOrgFilter) {
      // organizationIdが指定されていない場合、現在のユーザーの組織を自動取得
      const orgId = organizationId || await getCurrentOrganizationId()
      if (orgId) {
        query = query.or(`organization_id.eq.${orgId},is_shared.eq.true`)
      }
    }
    
    const { data, error } = await query.order('title', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // 公開用シナリオを取得（status='available'のみ、必要なフィールドのみ）
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  async getPublic(organizationId?: string): Promise<Partial<Scenario>[]> {
    let query = supabase
      .from('scenarios')
      .select('id, title, key_visual_url, author, duration, player_count_min, player_count_max, genre, release_date, status, participation_fee, scenario_type, organization_id, is_shared')
      .eq('status', 'available')
      .neq('scenario_type', 'gm_test') // GMテストを除外
    
    // organizationIdが指定されていない場合、現在のユーザーの組織を自動取得
    const orgId = organizationId || await getCurrentOrganizationId()
    if (orgId) {
      query = query.or(`organization_id.eq.${orgId},is_shared.eq.true`)
    }
    
    const { data, error } = await query.order('title', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // IDでシナリオを取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  async getById(id: string, organizationId?: string): Promise<Scenario | null> {
    let query = supabase
      .from('scenarios')
      .select('*')
      .eq('id', id)
    
    // organizationIdが指定されていない場合、現在のユーザーの組織を自動取得
    const orgId = organizationId || await getCurrentOrganizationId()
    if (orgId) {
      query = query.or(`organization_id.eq.${orgId},is_shared.eq.true`)
    }
    
    const { data, error } = await query.single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null // レコードが見つからない
      }
      throw error
    }
    return data
  },

  // slugでシナリオを取得
  async getBySlug(slug: string, organizationId?: string): Promise<Scenario | null> {
    let query = supabase
      .from('scenarios')
      .select('*')
      .eq('slug', slug)
    
    // organizationIdが指定されていない場合、現在のユーザーの組織を自動取得
    const orgId = organizationId || await getCurrentOrganizationId()
    if (orgId) {
      query = query.or(`organization_id.eq.${orgId},is_shared.eq.true`)
    }
    
    const { data, error } = await query.single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null // レコードが見つからない
      }
      throw error
    }
    return data
  },

  // IDまたはslugでシナリオを取得（slugを優先、見つからなければIDで検索）
  async getByIdOrSlug(idOrSlug: string, organizationId?: string): Promise<Scenario | null> {
    // UUIDパターンかどうかをチェック
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isUuid = uuidPattern.test(idOrSlug)
    
    // UUIDの場合はIDで検索
    if (isUuid) {
      return this.getById(idOrSlug, organizationId)
    }
    
    // slugで検索
    const bySlug = await this.getBySlug(idOrSlug, organizationId)
    if (bySlug) return bySlug
    
    // slugで見つからなければIDでも試す（後方互換）
    return this.getById(idOrSlug, organizationId)
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
    // organization_idを自動取得（マルチテナント対応）
    // ※ 共有シナリオ（managed）の場合はorganization_id = NULLのままでOK
    const organizationId = await getCurrentOrganizationId()
    
    const { data, error } = await supabase
      .from('scenarios')
      .insert([{ ...scenario, organization_id: organizationId }])
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
      .maybeSingle()
    
    if (error) throw error
    if (!data) throw new Error('シナリオの更新に失敗しました。権限がないか、対象が見つかりません。')
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

  // シナリオの累計公演回数を取得
  async getPerformanceCount(scenarioId: string): Promise<number> {
    const { count, error } = await supabase
      .from('schedule_events')
      .select('*', { count: 'exact', head: true })
      .eq('scenario_id', scenarioId)
      .not('status', 'eq', 'cancelled') // キャンセルを除外
    
    if (error) throw error
    return count || 0
  },

  // シナリオの統計情報を取得（公演回数、中止回数、売上、利益など）
  // 今日までの公演のみ計算（未来の公演は含めない）
  async getScenarioStats(scenarioId: string): Promise<{
    performanceCount: number
    cancelledCount: number
    totalRevenue: number
    totalParticipants: number
    totalGmCost: number
    totalLicenseCost: number
    firstPerformanceDate: string | null
    performanceDates: Array<{ date: string; category: string; participants: number; demoParticipants: number; staffParticipants: number; revenue: number; startTime: string; storeId: string | null }>
  }> {
    // 今日の日付（YYYY-MM-DD形式）
    const today = new Date().toISOString().split('T')[0]

    // 公演回数（中止以外、今日まで、出張公演除外）
    const { count: performanceCount, error: perfError } = await supabase
      .from('schedule_events')
      .select('*', { count: 'exact', head: true })
      .eq('scenario_id', scenarioId)
      .lte('date', today)
      .neq('category', 'offsite')
      .neq('is_cancelled', true)
    
    if (perfError) throw perfError

    // 中止回数（今日まで、出張公演除外）
    const { count: cancelledCount, error: cancelError } = await supabase
      .from('schedule_events')
      .select('*', { count: 'exact', head: true })
      .eq('scenario_id', scenarioId)
      .lte('date', today)
      .neq('category', 'offsite')
      .eq('is_cancelled', true)
    
    if (cancelError) throw cancelError

    // 初公演日を取得（今日までの公演から、中止以外、出張公演除外）
    const { data: firstEvent, error: firstError } = await supabase
      .from('schedule_events')
      .select('date, scenario_id')
      .eq('scenario_id', scenarioId)
      .lte('date', today)
      .neq('category', 'offsite')
      .neq('is_cancelled', true)
      .order('date', { ascending: true })
      .limit(1)
      .single()
    
    const firstPerformanceDate = firstError ? null : firstEvent?.date || null

    // 公演イベントを取得して売上・コストを集計（中止以外、今日まで、出張公演除外）
    const { data: events, error: eventsError } = await supabase
      .from('schedule_events')
      .select('id, date, category, current_participants, total_revenue, gm_cost, license_cost, start_time, store_id')
      .eq('scenario_id', scenarioId)
      .lte('date', today)
      .neq('category', 'offsite')
      .neq('is_cancelled', true)
      .order('date', { ascending: false })
    
    if (eventsError) throw eventsError

    // 各イベントの予約情報を取得（実際の予約から参加者数を計算）
    const eventIds = events?.map(e => e.id) || []
    let demoParticipantsMap: Record<string, number> = {}
    let actualParticipantsMap: Record<string, number> = {}
    let staffParticipantsMap: Record<string, number> = {}
    
    if (eventIds.length > 0) {
      // 全予約を取得（確定済みのみ）
      const { data: allReservations, error: resError } = await supabase
        .from('reservations')
        .select('schedule_event_id, participant_count, reservation_source, payment_method')
        .in('schedule_event_id', eventIds)
        .in('status', ['confirmed', 'gm_confirmed'])
      
      if (!resError && allReservations) {
        allReservations.forEach(res => {
          if (res.schedule_event_id) {
            const count = res.participant_count || 0
            
            // デモ予約
            if (res.reservation_source === 'demo' || res.reservation_source === 'demo_auto') {
              demoParticipantsMap[res.schedule_event_id] = 
                (demoParticipantsMap[res.schedule_event_id] || 0) + count
            }
            // スタッフ参加
            else if (res.reservation_source === 'staff_entry' || 
                     res.reservation_source === 'staff_participation' || 
                     res.payment_method === 'staff') {
              staffParticipantsMap[res.schedule_event_id] = 
                (staffParticipantsMap[res.schedule_event_id] || 0) + count
            }
            // 通常予約（有料）
            else {
              actualParticipantsMap[res.schedule_event_id] = 
                (actualParticipantsMap[res.schedule_event_id] || 0) + count
            }
          }
        })
      }
    }

    // 集計
    let totalRevenue = 0
    let totalParticipants = 0
    let totalGmCost = 0
    let totalLicenseCost = 0
    const performanceDates: Array<{ date: string; category: string; participants: number; demoParticipants: number; staffParticipants: number; revenue: number; startTime: string; storeId: string | null }> = []

    events?.forEach(event => {
      const demoCount = demoParticipantsMap[event.id] || 0
      const staffCount = staffParticipantsMap[event.id] || 0
      const actualCount = actualParticipantsMap[event.id] || 0
      // スタッフ参加は無料なので売上からは除外、参加者数は別表示
      
      // 有料参加者 = 有料予約 + デモ（スタッフ除外）
      const paidParticipants = actualCount + demoCount
      
      totalParticipants += paidParticipants
      totalRevenue += event.total_revenue || 0
      totalGmCost += event.gm_cost || 0
      totalLicenseCost += event.license_cost || 0
      performanceDates.push({
        date: event.date,
        category: event.category || 'open',
        participants: paidParticipants,  // 有料参加者（スタッフ除外）
        demoParticipants: demoCount,  // 内訳用に保持
        staffParticipants: staffCount,  // スタッフ参加者数
        revenue: event.total_revenue || 0,
        startTime: event.start_time || '',
        storeId: event.store_id || null
      })
    })

    return {
      performanceCount: performanceCount || 0,
      cancelledCount: cancelledCount || 0,
      totalRevenue,
      totalParticipants,
      totalGmCost,
      totalLicenseCost,
      firstPerformanceDate,
      performanceDates
    }
  },

  // 全シナリオの統計情報を一括取得（リスト表示用、ページネーションで全件取得）
  async getAllScenarioStats(): Promise<Record<string, {
    performanceCount: number
    cancelledCount: number
    totalRevenue: number
  }>> {
    const today = new Date().toISOString().split('T')[0]

    // ページネーションで全件取得（Supabaseのmax_rows制限を回避）
    const pageSize = 1000
    let allEvents: any[] = []
    let page = 0
    let hasMore = true

    while (hasMore) {
      const from = page * pageSize
      const to = from + pageSize - 1
      
      const { data: events, error } = await supabase
        .from('schedule_events')
        .select('scenario_id, is_cancelled, total_revenue, date, category')
        .lte('date', today)
        .neq('category', 'offsite')
        .range(from, to)
        .order('date', { ascending: false })

      if (error) throw error

      if (events && events.length > 0) {
        allEvents = allEvents.concat(events)
        hasMore = events.length === pageSize
        page++
      } else {
        hasMore = false
      }
    }

    const events = allEvents

    // scenario_idごとに集計
    const statsMap: Record<string, {
      performanceCount: number
      cancelledCount: number
      totalRevenue: number
    }> = {}

    events?.forEach(event => {
      if (!event.scenario_id) return

      if (!statsMap[event.scenario_id]) {
        statsMap[event.scenario_id] = {
          performanceCount: 0,
          cancelledCount: 0,
          totalRevenue: 0
        }
      }

      if (event.is_cancelled) {
        statsMap[event.scenario_id].cancelledCount++
      } else {
        statsMap[event.scenario_id].performanceCount++
        statsMap[event.scenario_id].totalRevenue += event.total_revenue || 0
      }
    })

    return statsMap
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

