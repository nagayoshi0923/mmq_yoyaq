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
        notes: notes || null
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
  async updateStaffAssignments(staffId: string, scenarioIds: string[], notes?: string) {
    // 既存の担当関係を削除
    await supabase
      .from('staff_scenario_assignments')
      .delete()
      .eq('staff_id', staffId)

    // 新しい担当関係を追加
    if (scenarioIds.length > 0) {
      const assignments = scenarioIds.map(scenarioId => ({
        staff_id: staffId,
        scenario_id: scenarioId,
        notes: notes || null
      }))

      const { error } = await supabase
        .from('staff_scenario_assignments')
        .insert(assignments)

      if (error) throw error
    }
  },

  // シナリオの担当スタッフを一括更新
  async updateScenarioAssignments(scenarioId: string, staffIds: string[], notes?: string) {
    // 既存の担当関係を削除
    await supabase
      .from('staff_scenario_assignments')
      .delete()
      .eq('scenario_id', scenarioId)

    // 新しい担当関係を追加
    if (staffIds.length > 0) {
      const assignments = staffIds.map(staffId => ({
        staff_id: staffId,
        scenario_id: scenarioId,
        notes: notes || null
      }))

      const { error } = await supabase
        .from('staff_scenario_assignments')
        .insert(assignments)

      if (error) throw error
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
  }
}
