/**
 * スタッフ関連API
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import type { Staff } from '@/types'

export const staffApi = {
  // 全スタッフを取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  // skipOrgFilter: trueの場合、組織フィルタをスキップ（全組織のデータを取得）
  async getAll(organizationId?: string, skipOrgFilter?: boolean): Promise<Staff[]> {
    let query = supabase
      .from('staff')
      .select('*')
    
    // 組織フィルタリング
    if (!skipOrgFilter) {
      const orgId = organizationId || await getCurrentOrganizationId()
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
    }
    
    const { data, error } = await query.order('name', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // スタッフを作成
  async create(staff: Omit<Staff, 'id' | 'created_at' | 'updated_at'>): Promise<Staff> {
    // organization_idを自動取得（マルチテナント対応）
    const organizationId = await getCurrentOrganizationId()
    if (!organizationId) {
      throw new Error('組織情報が取得できません。再ログインしてください。')
    }
    
    const { data, error } = await supabase
      .from('staff')
      .insert([{ ...staff, organization_id: organizationId }])
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
    
    // DBに存在しないフィールドを除外（UIで追加される仮想フィールド）
    const { experienced_scenarios, ...dbUpdates } = updates as Staff & { experienced_scenarios?: string[] }
    
    // スタッフ情報を更新
    const { data, error } = await supabase
      .from('staff')
      .update(dbUpdates)
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
    
    // 役割が変更された場合、usersテーブルのroleも更新
    if (updates.role !== undefined && data.user_id) {
      // スタッフの役割に応じてユーザーロールを決定
      // role配列に「admin」または「管理者」が含まれていればadmin
      const roles = Array.isArray(updates.role) ? updates.role : [updates.role]
      const isAdmin = roles.some(r => r === 'admin' || r === '管理者')
      const userRole = isAdmin ? 'admin' : 'staff'
      
      // 🚨 重要: 既存のadminロールを持つユーザーをstaffに降格させない
      // usersテーブルの既存ロールを確認
      const { data: existingUserData, error: existingUserError } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user_id)
        .maybeSingle()
      
      if (existingUserError) {
        logger.warn('既存ユーザーロールの確認に失敗しました:', existingUserError)
      }
      
      // 既存ロールがadminで、更新後がstaffの場合は降格をスキップ
      if (existingUserData?.role === 'admin' && userRole === 'staff') {
        logger.log(`スタッフ「${data.name}」の既存ロールがadminのため、staffへの降格をスキップしました`)
      } else {
        const { error: userRoleError } = await supabase
          .from('users')
          .update({ role: userRole, updated_at: new Date().toISOString() })
          .eq('id', data.user_id)
        
        if (userRoleError) {
          logger.warn('ユーザーロールの更新に失敗しました:', userRoleError)
        } else {
          logger.log(`スタッフ「${data.name}」の役割変更に伴い、ユーザーロールを${userRole}に更新しました`)
        }
      }
    }
    
    return data
  },

  // スタッフを削除
  async delete(id: string): Promise<void> {
    // 組織フィルタ（マルチテナント対応）
    const orgId = await getCurrentOrganizationId()
    
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
    
    // 1. shift_submissionsの削除（組織フィルタ付き）
    let shiftQuery = supabase
      .from('shift_submissions')
      .delete()
      .eq('staff_id', id)
    
    if (orgId) {
      shiftQuery = shiftQuery.eq('organization_id', orgId)
    }
    
    const { error: shiftError } = await shiftQuery
    
    if (shiftError) throw shiftError
    
    // 2. staff_scenario_assignmentsの削除（組織フィルタ付き）
    let assignQuery = supabase
      .from('staff_scenario_assignments')
      .delete()
      .eq('staff_id', id)
    
    if (orgId) {
      assignQuery = assignQuery.eq('organization_id', orgId)
    }
    
    const { error: assignmentError } = await assignQuery
    
    if (assignmentError) throw assignmentError
    
    // 3. schedule_eventsのgms配列からスタッフ名を削除（組織フィルタ付き）
    let scheduleQuery = supabase
      .from('schedule_events')
      .select('id, gms')
      .contains('gms', [staffName])
    
    if (orgId) {
      scheduleQuery = scheduleQuery.eq('organization_id', orgId)
    }
    
    const { data: scheduleEvents, error: scheduleError } = await scheduleQuery
    
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
    
    // 4. reservationsのassigned_staff配列からスタッフ名を削除（組織フィルタ付き）
    let resQuery = supabase
      .from('reservations')
      .select('id, assigned_staff, gm_staff')
      .or(`assigned_staff.cs.{${staffName}},gm_staff.eq.${staffName}`)
    
    if (orgId) {
      resQuery = resQuery.eq('organization_id', orgId)
    }
    
    const { data: reservations, error: resError } = await resQuery
    
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
    
    // 5. スタッフ本体の削除（組織フィルタ付き）
    let deleteQuery = supabase
      .from('staff')
      .delete()
      .eq('id', id)
    
    if (orgId) {
      deleteQuery = deleteQuery.eq('organization_id', orgId)
    }
    
    const { error } = await deleteQuery
    
    if (error) throw error
    
    // 6. usersテーブルのロールを更新（スタッフ削除に伴い、一般ユーザーに戻す）
    // ただし、adminロールの場合は権限を維持する
    if (userId) {
      try {
        // 現在のロールを確認
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('role')
          .eq('id', userId)
          .single()
        
        if (userError && userError.code !== 'PGRST116') {
          logger.warn('ユーザー情報の取得に失敗しました:', userError)
        }

        // adminでない場合のみ、customer（一般顧客）に戻す
        if (userData && userData.role !== 'admin') {
           const { error: updateError } = await supabase
            .from('users')
            .update({ role: 'customer' })
            .eq('id', userId)
            
           if (updateError) {
             logger.warn('ユーザーロールの更新(customer化)に失敗しました:', updateError)
           } else {
             logger.log('ユーザーロールをcustomerに戻しました:', userId)
           }
        } else if (userData && userData.role === 'admin') {
          logger.log('adminユーザーのため、ロール変更をスキップしました')
        }
      } catch (err) {
        logger.warn('ユーザーロールの更新処理でエラーが発生しました:', err)
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
  },

  // IDでスタッフを取得
  async getById(id: string): Promise<Staff | null> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    
    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  },

  // ユーザーIDでスタッフを取得
  async getByUserId(userId: string): Promise<Staff | null> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    
    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  }
}

