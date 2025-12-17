/**
 * シナリオ関連API
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { Scenario } from '@/types'
import type { PaginatedResponse } from './types'

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

  // 公開用シナリオを取得（status='available'のみ、必要なフィールドのみ）
  async getPublic(): Promise<Partial<Scenario>[]> {
    const { data, error } = await supabase
      .from('scenarios')
      .select('id, title, key_visual_url, author, duration, player_count_min, player_count_max, genre, release_date, status, participation_fee, scenario_type')
      .eq('status', 'available')
      .neq('scenario_type', 'gm_test') // GMテストを除外
      .order('title', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // IDでシナリオを取得
  async getById(id: string): Promise<Scenario | null> {
    const { data, error } = await supabase
      .from('scenarios')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null // レコードが見つからない
      }
      throw error
    }
    return data
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

