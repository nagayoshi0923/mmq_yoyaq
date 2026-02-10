/**
 * スタッフ関連API
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { sanitizeForPostgRestFilter } from '@/lib/utils'
import { logger } from '@/utils/logger'
import type { Staff } from '@/types'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const STAFF_SELECT_FIELDS =
  // DB側は discord_user_id。フロントの既存実装（discord_id）に合わせて alias する。
  // NOTE: staff.display_name がDBに無い環境があるため、selectに含めない（含めるとPostgRESTが400になる）
  'id, organization_id, name, line_name, x_account, discord_id:discord_user_id, discord_channel_id, role, stores, ng_days, want_to_learn, available_scenarios, notes, phone, email, user_id, availability, experience, special_scenarios, status, avatar_url, avatar_color, created_at, updated_at' as const

export const staffApi = {
  // 全スタッフを取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  // skipOrgFilter: trueの場合、組織フィルタをスキップ（全組織のデータを取得）
  async getAll(organizationId?: string, skipOrgFilter?: boolean): Promise<Staff[]> {
    let query = supabase
      .from('staff')
      .select(STAFF_SELECT_FIELDS)
    
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
    
    // DBカラム名へ変換（後方互換）
    const { discord_id, ...rest } = staff as Staff & { discord_id?: string }
    const insertRow: Record<string, unknown> = { ...rest, organization_id: organizationId }
    if (discord_id !== undefined) insertRow.discord_user_id = discord_id

    const { data, error } = await supabase
      .from('staff')
      .insert([insertRow])
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
    const { experienced_scenarios, discord_id, ...dbUpdates } = updates as Staff & {
      experienced_scenarios?: string[]
      discord_id?: string
    }

    // ⚠️ Mass Assignment 防止: 更新可能フィールドのホワイトリスト
    const STAFF_UPDATABLE_FIELDS = [
      'name', 'line_name', 'x_account', 'discord_user_id', 'discord_channel_id',
      'role', 'stores', 'ng_days', 'want_to_learn', 'available_scenarios',
      'notes', 'phone', 'email', 'availability', 'experience',
      'special_scenarios', 'status', 'avatar_url', 'avatar_color', 'display_name',
    ] as const
    const updateRow: Record<string, unknown> = {}
    if (discord_id !== undefined) updateRow.discord_user_id = discord_id
    for (const key of Object.keys(dbUpdates)) {
      if ((STAFF_UPDATABLE_FIELDS as readonly string[]).includes(key)) {
        updateRow[key] = (dbUpdates as Record<string, unknown>)[key]
      }
    }
    
    // スタッフ情報を更新
    const { data, error } = await supabase
      .from('staff')
      .update(updateRow)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    
    // 名前が変更された場合、スケジュールと予約も更新
    if (oldName && updates.name && oldName !== updates.name) {
      const newName = updates.name
      // ⚠️ P1-15: 組織IDでフィルタして他組織のデータを変更しない
      const orgId = await getCurrentOrganizationId()
      
      // 1. schedule_eventsのgms配列を更新
      let scheduleQuery = supabase
        .from('schedule_events')
        .select('id, gms')
        .contains('gms', [oldName])
      if (orgId) scheduleQuery = scheduleQuery.eq('organization_id', orgId)

      const { data: scheduleEvents, error: scheduleError } = await scheduleQuery
      
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
      // ⚠️ P1-16: サニタイズ — 名前に特殊文字が含まれる場合に備えてエスケープ
      const safeOldName = sanitizeForPostgRestFilter(oldName) || oldName
      let resQuery = supabase
        .from('reservations')
        .select('id, assigned_staff, gm_staff')
        .or(`assigned_staff.cs.{${safeOldName}},gm_staff.eq.${safeOldName}`)
      if (orgId) resQuery = resQuery.eq('organization_id', orgId)

      const { data: reservations, error: resError } = await resQuery
      
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
          
          return supabase.rpc('admin_update_reservation_fields', {
            p_reservation_id: reservation.id,
            p_updates: updates
          })
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
      .select(STAFF_SELECT_FIELDS)
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
      .select(STAFF_SELECT_FIELDS)
      .eq('user_id', userId)
      .maybeSingle()
    
    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  }
}

