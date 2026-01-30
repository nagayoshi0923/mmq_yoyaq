import { supabase } from './supabase'
import { getCurrentOrganizationId } from './organization'

// スタッフ⇔シナリオの担当関係を管理するAPI
export const assignmentApi = {
  // スタッフの担当シナリオ一覧を取得（GM可能なシナリオのみ）
  async getStaffAssignments(staffId: string, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    // まず全てのアサインメントを取得（組織でフィルタ）
    let query = supabase
      .from('staff_scenario_assignments')
      .select(`
        *,
        scenarios:scenario_id (
          id,
          title,
          author
        )
      `)
      .eq('staff_id', staffId)
      .order('assigned_at', { ascending: false })
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    // クライアント側でGM可能なシナリオのみフィルタ
    // (can_main_gm = true OR can_sub_gm = true)
    const filteredData = (data || []).filter(assignment => 
      assignment.can_main_gm === true || assignment.can_sub_gm === true
    )
    
    return filteredData
  },

  // スタッフの全アサインメント一覧を取得（体験済み含む）
  async getAllStaffAssignments(staffId: string, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('staff_scenario_assignments')
      .select(`
        *,
        scenarios:scenario_id (
          id,
          title,
          author
        )
      `)
      .eq('staff_id', staffId)
      .order('assigned_at', { ascending: false })
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data || []
  },

  // スタッフの体験済みシナリオ一覧を取得（GM不可のもののみ）
  async getStaffExperiencedScenarios(staffId: string, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('staff_scenario_assignments')
      .select(`
        *,
        scenarios:scenario_id (
          id,
          title,
          author
        )
      `)
      .eq('staff_id', staffId)
      .order('assigned_at', { ascending: false })
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    // 体験済みのみ（GM不可）をフィルタ
    // can_main_gm = false AND can_sub_gm = false AND is_experienced = true
    const filteredData = (data || []).filter(assignment => 
      assignment.can_main_gm === false &&
      assignment.can_sub_gm === false &&
      assignment.is_experienced === true
    )
    
    return filteredData
  },

  // シナリオの担当スタッフ一覧を取得（GM可能なスタッフのみ）
  async getScenarioAssignments(scenarioId: string, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    // まず全てのアサインメントを取得（組織でフィルタ）
    let query = supabase
      .from('staff_scenario_assignments')
      .select(`
        *,
        staff:staff_id (
          id,
          name,
          line_name
        )
      `)
      .eq('scenario_id', scenarioId)
      .order('assigned_at', { ascending: false })
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    // クライアント側でGM可能なスタッフのみフィルタ
    // (can_main_gm = true OR can_sub_gm = true)
    const filteredData = (data || []).filter(assignment => 
      assignment.can_main_gm === true || assignment.can_sub_gm === true
    )
    
    return filteredData
  },

  // シナリオの全スタッフ一覧を取得（体験済み含む）
  async getAllScenarioAssignments(scenarioId: string, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('staff_scenario_assignments')
      .select(`
        *,
        staff:staff_id (
          id,
          name,
          line_name
        )
      `)
      .eq('scenario_id', scenarioId)
      .order('assigned_at', { ascending: false })
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data || []
  },

  // シナリオの体験済みスタッフ一覧を取得（GM不可のもののみ）
  async getScenarioExperiencedStaff(scenarioId: string, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('staff_scenario_assignments')
      .select(`
        *,
        staff:staff_id (
          id,
          name,
          line_name
        )
      `)
      .eq('scenario_id', scenarioId)
      .order('assigned_at', { ascending: false })
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    // 体験済みのみ（GM不可）をフィルタ
    // can_main_gm = false AND can_sub_gm = false AND is_experienced = true
    const filteredData = (data || []).filter(assignment => 
      assignment.can_main_gm === false &&
      assignment.can_sub_gm === false &&
      assignment.is_experienced === true
    )
    
    return filteredData
  },

  // 担当関係を追加
  async addAssignment(staffId: string, scenarioId: string, notes?: string, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    if (!orgId) throw new Error('組織情報が取得できません。')
    
    const { data, error } = await supabase
      .from('staff_scenario_assignments')
      .insert({
        staff_id: staffId,
        scenario_id: scenarioId,
        notes: notes || null,
        can_main_gm: true,
        can_sub_gm: true,
        is_experienced: false, // DB制約: GM可能ならis_experiencedはfalse
        assigned_at: new Date().toISOString(),
        organization_id: orgId
      })
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 担当関係を削除
  async removeAssignment(staffId: string, scenarioId: string, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let deleteQuery = supabase
      .from('staff_scenario_assignments')
      .delete()
      .eq('staff_id', staffId)
      .eq('scenario_id', scenarioId)
    
    if (orgId) {
      deleteQuery = deleteQuery.eq('organization_id', orgId)
    }
    
    const { error } = await deleteQuery
    
    if (error) throw error
  },

  // スタッフの担当シナリオを一括更新
  // 後方互換性: string[] (シナリオIDのみ) または 詳細オブジェクト配列 の両方をサポート
  async updateStaffAssignments(staffId: string, assignments: string[] | Array<{
    scenarioId: string
    can_main_gm: boolean
    can_sub_gm: boolean
    is_experienced: boolean
    status?: 'want_to_learn' | 'experienced' | 'can_gm'
    notes?: string
  }>, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    // 既存の担当関係を削除（組織でフィルタ）
    let deleteQuery = supabase
      .from('staff_scenario_assignments')
      .delete()
      .eq('staff_id', staffId)
    
    if (orgId) {
      deleteQuery = deleteQuery.eq('organization_id', orgId)
    }
    
    await deleteQuery

    // 新しい担当関係を追加
    if (assignments.length > 0) {
      // 入力形式を判定: string[] か オブジェクト配列か
      const isStringArray = typeof assignments[0] === 'string'
      
      // DBテーブルに存在するカラムのみ使用（statusは存在しない）
      // 無効なscenarioIdをフィルタリング
      const records = isStringArray 
        ? (assignments as string[])
            .filter(scenarioId => scenarioId && typeof scenarioId === 'string')
            .map(scenarioId => ({
              staff_id: staffId,
              scenario_id: scenarioId,
              can_main_gm: true, // デフォルト: GM可能
              can_sub_gm: true,
              is_experienced: false, // DB制約: GM可能ならis_experiencedはfalse
              notes: null,
              assigned_at: new Date().toISOString(),
              organization_id: orgId
            }))
        : (assignments as Array<{ scenarioId: string; can_main_gm: boolean; can_sub_gm: boolean; is_experienced: boolean; notes?: string }>)
            .filter(a => a.scenarioId && typeof a.scenarioId === 'string')
            .map(a => ({
        staff_id: staffId,
        scenario_id: a.scenarioId,
        can_main_gm: a.can_main_gm,
        can_sub_gm: a.can_sub_gm,
        is_experienced: a.is_experienced,
        notes: a.notes || null,
        assigned_at: new Date().toISOString(),
        organization_id: orgId
      }))

      // 有効なレコードがある場合のみ挿入
      if (records.length > 0) {
      const { error } = await supabase
        .from('staff_scenario_assignments')
        .insert(records)

      if (error) throw error
      }
    }
  },

  // シナリオの担当スタッフを一括更新（差分更新）
  async updateScenarioAssignments(scenarioId: string, staffIds: string[], notes?: string, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    if (!orgId) throw new Error('組織情報が取得できません。')
    
    // 現在の担当関係を取得（組織でフィルタ）
    const fetchQuery = supabase
      .from('staff_scenario_assignments')
      .select('staff_id')
      .eq('scenario_id', scenarioId)
      .eq('organization_id', orgId)
    
    const { data: currentAssignments, error: fetchError } = await fetchQuery
    
    if (fetchError) throw fetchError

    const currentStaffIds = currentAssignments?.map(a => a.staff_id) || []
    
    // 削除対象: 現在のリストにあるが、新しいリストにないもの
    const toDelete = currentStaffIds.filter(id => !staffIds.includes(id))
    
    // 追加対象: 新しいリストにあるが、現在のリストにないもの
    const toAdd = staffIds.filter(id => !currentStaffIds.includes(id))
    
    // 削除実行（組織でフィルタ）
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('staff_scenario_assignments')
        .delete()
        .eq('scenario_id', scenarioId)
        .eq('organization_id', orgId)
        .in('staff_id', toDelete)
      
      if (deleteError) throw deleteError
    }
    
    // 追加実行（デフォルト設定: can_main_gm=true, can_sub_gm=true）
    // DBテーブルに存在するカラムのみ使用（statusは存在しない）
    // 注意: gm_experienced_check制約により、GM可能ならis_experiencedはfalse
    if (toAdd.length > 0) {
      const newAssignments = toAdd.map(staffId => ({
        staff_id: staffId,
        scenario_id: scenarioId,
        can_main_gm: true,
        can_sub_gm: true,
        is_experienced: false, // DB制約: GM可能ならis_experiencedはfalse
        notes: notes || null,
        assigned_at: new Date().toISOString(),
        organization_id: orgId
      }))

      const { error: insertError } = await supabase
        .from('staff_scenario_assignments')
        .insert(newAssignments)
      
      if (insertError) throw insertError
    }
  },

  // 担当関係の詳細を更新
  async updateAssignment(staffId: string, scenarioId: string, updates: {
    notes?: string
    assigned_at?: string
  }, organizationId?: string) {
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let updateQuery = supabase
      .from('staff_scenario_assignments')
      .update(updates)
      .eq('staff_id', staffId)
      .eq('scenario_id', scenarioId)
    
    if (orgId) {
      updateQuery = updateQuery.eq('organization_id', orgId)
    }
    
    const { data, error } = await updateQuery.select().single()
    
    if (error) throw error
    return data
  },

  // 複数シナリオのGM情報と体験済みスタッフを一括取得（N+1問題の回避）
  async getBatchScenarioAssignments(scenarioIds: string[], organizationId?: string): Promise<Map<string, { gmStaff: string[], experiencedStaff: string[] }>> {
    if (scenarioIds.length === 0) {
      return new Map()
    }

    const orgId = organizationId || await getCurrentOrganizationId()

    // シナリオIDを50件ずつバッチ処理（URLサイズ制限対策）
    const batchSize = 50
    const allData: any[] = []
    
    for (let i = 0; i < scenarioIds.length; i += batchSize) {
      const batchIds = scenarioIds.slice(i, i + batchSize)
      
      let query = supabase
        .from('staff_scenario_assignments')
        .select(`
          scenario_id,
          staff_id,
          can_main_gm,
          can_sub_gm,
          is_experienced
        `)
        .in('scenario_id', batchIds)
        .limit(10000)
      
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
      
      const { data, error } = await query
      
      if (error) throw error
      if (data) allData.push(...data)
    }
    
    // GM可能 OR 体験済みのレコードをフィルタ
    const data = allData.filter(row => 
      row.can_main_gm === true || row.can_sub_gm === true || row.is_experienced === true
    )
    
    // staff_idからスタッフ名を取得するために、別途スタッフ情報を取得（組織でフィルタ）
    const staffIds = [...new Set(data?.map(a => a.staff_id).filter(Boolean) || [])]
    
    const staffMap = new Map<string, string>()
    if (staffIds.length > 0) {
      let staffQuery = supabase
        .from('staff')
        .select('id, name')
        .in('id', staffIds)
      
      if (orgId) {
        staffQuery = staffQuery.eq('organization_id', orgId)
      }
      
      const { data: staffData, error: staffError } = await staffQuery
      
      if (!staffError && staffData) {
        staffData.forEach(s => staffMap.set(s.id, s.name))
      }
    }
    
    // シナリオIDごとにGMスタッフと体験済みスタッフをグループ化
    const assignmentMap = new Map<string, { gmStaff: string[], experiencedStaff: string[] }>()
    
    data?.forEach((assignment: any) => {
      const scenarioId = assignment.scenario_id
      const staffName = staffMap.get(assignment.staff_id)
      
      if (staffName) {
        if (!assignmentMap.has(scenarioId)) {
          assignmentMap.set(scenarioId, { gmStaff: [], experiencedStaff: [] })
        }
        const entry = assignmentMap.get(scenarioId)!
        
        // GM可能なスタッフ
        if (assignment.can_main_gm || assignment.can_sub_gm) {
          if (!entry.gmStaff.includes(staffName)) {
            entry.gmStaff.push(staffName)
          }
        }
        
        // 体験済みスタッフ（GM不可のもののみ）
        if (assignment.is_experienced && !assignment.can_main_gm && !assignment.can_sub_gm) {
          if (!entry.experiencedStaff.includes(staffName)) {
            entry.experiencedStaff.push(staffName)
          }
        }
      }
    })
    
    return assignmentMap
  },

  // 複数スタッフの担当シナリオ情報を一括取得（N+1問題の回避）
  async getBatchStaffAssignments(staffIds: string[], organizationId?: string) {
    if (staffIds.length === 0) {
      return new Map<string, { gmScenarios: string[], experiencedScenarios: string[] }>()
    }

    const orgId = organizationId || await getCurrentOrganizationId()

    // 全データを取得（Supabaseのデフォルト1000件制限を回避するためページネーション）
    const allData: any[] = []
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    
    while (hasMore) {
      let query = supabase
        .from('staff_scenario_assignments')
        .select(`
          staff_id,
          scenario_id,
          can_main_gm,
          can_sub_gm,
          is_experienced
        `)
        .in('staff_id', staffIds)
        .range(offset, offset + pageSize - 1)
      
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
      
      const { data, error } = await query
      
      if (error) throw error
      
      if (data && data.length > 0) {
        allData.push(...data)
        offset += pageSize
        hasMore = data.length === pageSize
      } else {
        hasMore = false
      }
    }
    
    // クライアント側でフィルタリング（GM可能 OR 体験済み）
    const data = allData.filter(row => 
      row.can_main_gm === true || row.can_sub_gm === true || row.is_experienced === true
    )
    
    // エラーチェック用の空変数（既存コードとの互換性）
    const error = null
    if (error) throw error
    
    // スタッフIDごとにGM可能なシナリオと体験済みシナリオをグループ化
    const assignmentMap = new Map<string, { gmScenarios: string[], experiencedScenarios: string[] }>()
    
    data?.forEach((assignment: any) => {
      const staffId = assignment.staff_id
      const scenarioId = assignment.scenario_id
      
      if (!assignmentMap.has(staffId)) {
        assignmentMap.set(staffId, { gmScenarios: [], experiencedScenarios: [] })
      }
      
      const staffData = assignmentMap.get(staffId)!
      
      // GM可能なシナリオ（can_main_gm = true OR can_sub_gm = true）
      if ((assignment.can_main_gm || assignment.can_sub_gm) && scenarioId) {
        if (!staffData.gmScenarios.includes(scenarioId)) {
          staffData.gmScenarios.push(scenarioId)
        }
      }
      
      // 体験済みシナリオ（GM不可、is_experienced = true）
      if (assignment.is_experienced && 
          !assignment.can_main_gm && 
          !assignment.can_sub_gm && 
          scenarioId) {
        if (!staffData.experiencedScenarios.includes(scenarioId)) {
          staffData.experiencedScenarios.push(scenarioId)
        }
      }
    })
    
    return assignmentMap
  }
}
