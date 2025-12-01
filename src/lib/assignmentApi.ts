import { supabase } from './supabase'

// スタッフ⇔シナリオの担当関係を管理するAPI
export const assignmentApi = {
  // スタッフの担当シナリオ一覧を取得（GM可能なシナリオのみ）
  async getStaffAssignments(staffId: string) {
    // まず全てのアサインメントを取得
    const { data, error } = await supabase
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
    
    if (error) throw error
    
    // クライアント側でGM可能なシナリオのみフィルタ
    // (can_main_gm = true OR can_sub_gm = true)
    const filteredData = (data || []).filter(assignment => 
      assignment.can_main_gm === true || assignment.can_sub_gm === true
    )
    
    return filteredData
  },

  // スタッフの全アサインメント一覧を取得（体験済み含む）
  async getAllStaffAssignments(staffId: string) {
    const { data, error } = await supabase
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
    
    if (error) throw error
    return data || []
  },

  // スタッフの体験済みシナリオ一覧を取得（GM不可のもののみ）
  async getStaffExperiencedScenarios(staffId: string) {
    const { data, error } = await supabase
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
  async getScenarioAssignments(scenarioId: string) {
    // まず全てのアサインメントを取得
    const { data, error } = await supabase
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
    
    if (error) throw error
    
    // クライアント側でGM可能なスタッフのみフィルタ
    // (can_main_gm = true OR can_sub_gm = true)
    const filteredData = (data || []).filter(assignment => 
      assignment.can_main_gm === true || assignment.can_sub_gm === true
    )
    
    return filteredData
  },

  // シナリオの全スタッフ一覧を取得（体験済み含む）
  async getAllScenarioAssignments(scenarioId: string) {
    const { data, error } = await supabase
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
    
    if (error) throw error
    return data || []
  },

  // シナリオの体験済みスタッフ一覧を取得（GM不可のもののみ）
  async getScenarioExperiencedStaff(scenarioId: string) {
    const { data, error } = await supabase
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
  async addAssignment(staffId: string, scenarioId: string, notes?: string) {
    const { data, error } = await supabase
      .from('staff_scenario_assignments')
      .insert({
        staff_id: staffId,
        scenario_id: scenarioId,
        notes: notes || null,
        can_main_gm: true,
        can_sub_gm: true,
        is_experienced: false,
        assigned_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 担当関係を削除
  async removeAssignment(staffId: string, scenarioId: string) {
    const { error } = await supabase
      .from('staff_scenario_assignments')
      .delete()
      .eq('staff_id', staffId)
      .eq('scenario_id', scenarioId)
    
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
  }>) {
    // 既存の担当関係を削除
    await supabase
      .from('staff_scenario_assignments')
      .delete()
      .eq('staff_id', staffId)

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
              is_experienced: false,
              notes: null,
              assigned_at: new Date().toISOString()
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
              assigned_at: new Date().toISOString()
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
  async updateScenarioAssignments(scenarioId: string, staffIds: string[], notes?: string) {
    // 現在の担当関係を取得
    const { data: currentAssignments, error: fetchError } = await supabase
      .from('staff_scenario_assignments')
      .select('staff_id')
      .eq('scenario_id', scenarioId)
    
    if (fetchError) throw fetchError

    const currentStaffIds = currentAssignments?.map(a => a.staff_id) || []
    
    // 削除対象: 現在のリストにあるが、新しいリストにないもの
    const toDelete = currentStaffIds.filter(id => !staffIds.includes(id))
    
    // 追加対象: 新しいリストにあるが、現在のリストにないもの
    const toAdd = staffIds.filter(id => !currentStaffIds.includes(id))
    
    // 削除実行
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('staff_scenario_assignments')
        .delete()
        .eq('scenario_id', scenarioId)
        .in('staff_id', toDelete)
      
      if (deleteError) throw deleteError
    }
    
    // 追加実行（デフォルト設定: can_main_gm=true, can_sub_gm=true）
    // DBテーブルに存在するカラムのみ使用（statusは存在しない）
    if (toAdd.length > 0) {
      const newAssignments = toAdd.map(staffId => ({
        staff_id: staffId,
        scenario_id: scenarioId,
        can_main_gm: true,
        can_sub_gm: true,
        is_experienced: false,
        notes: notes || null,
        assigned_at: new Date().toISOString()
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
  }) {
    const { data, error } = await supabase
      .from('staff_scenario_assignments')
      .update(updates)
      .eq('staff_id', staffId)
      .eq('scenario_id', scenarioId)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 複数シナリオのGM情報を一括取得（N+1問題の回避）
  async getBatchScenarioAssignments(scenarioIds: string[]) {
    if (scenarioIds.length === 0) {
      return new Map()
    }

    // GM可能なレコードのみをサーバー側でフィルタ（1000件制限対策）
    const { data, error } = await supabase
      .from('staff_scenario_assignments')
      .select(`
        scenario_id,
        staff_id,
        can_main_gm,
        can_sub_gm
      `)
      .in('scenario_id', scenarioIds)
      .or('can_main_gm.eq.true,can_sub_gm.eq.true')
    
    if (error) throw error
    
    // staff_idからスタッフ名を取得するために、別途スタッフ情報を取得
    const staffIds = [...new Set(data?.map(a => a.staff_id).filter(Boolean) || [])]
    
    let staffMap = new Map<string, string>()
    if (staffIds.length > 0) {
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, name')
        .in('id', staffIds)
      
      if (!staffError && staffData) {
        staffData.forEach(s => staffMap.set(s.id, s.name))
      }
    }
    
    // シナリオIDごとにスタッフ名をグループ化
    const assignmentMap = new Map<string, string[]>()
    
    data?.forEach((assignment: any) => {
        const scenarioId = assignment.scenario_id
      const staffName = staffMap.get(assignment.staff_id)
        
        if (staffName) {
          if (!assignmentMap.has(scenarioId)) {
            assignmentMap.set(scenarioId, [])
          }
          assignmentMap.get(scenarioId)!.push(staffName)
      }
    })
    
    return assignmentMap
  },

  // 複数スタッフの担当シナリオ情報を一括取得（N+1問題の回避）
  async getBatchStaffAssignments(staffIds: string[]) {
    if (staffIds.length === 0) {
      return new Map<string, { gmScenarios: string[], experiencedScenarios: string[] }>()
    }

    // 有効なレコードのみをサーバー側でフィルタ（1000件制限対策）
    // GM可能 OR 体験済みのいずれかがtrueのレコードのみ取得
    const { data, error } = await supabase
      .from('staff_scenario_assignments')
      .select(`
        staff_id,
        scenario_id,
        can_main_gm,
        can_sub_gm,
        is_experienced
      `)
      .in('staff_id', staffIds)
      .or('can_main_gm.eq.true,can_sub_gm.eq.true,is_experienced.eq.true')
    
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
