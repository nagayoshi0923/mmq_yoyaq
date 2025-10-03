import { supabase } from './supabase'

// スタッフ⇔シナリオの担当関係を管理するAPI
export const assignmentApi = {
  // スタッフの担当シナリオ一覧を取得
  async getStaffAssignments(staffId: string) {
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

  // シナリオの担当スタッフ一覧を取得
  async getScenarioAssignments(scenarioId: string) {
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
