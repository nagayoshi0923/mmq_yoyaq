import { supabase } from './supabase'

export interface ShiftSubmission {
  id: string
  staff_id: string
  date: string
  morning: boolean
  afternoon: boolean
  evening: boolean
  all_day: boolean
  submitted_at?: string | null
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  notes?: string | null
  created_at: string
  updated_at: string
}

export const shiftApi = {
  // 月間シフトを取得
  async getByMonth(staffId: string, year: number, month: number): Promise<ShiftSubmission[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]
    
    const { data, error } = await supabase
      .from('shift_submissions')
      .select('*')
      .eq('staff_id', staffId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
    
    if (error) throw error
    return data || []
  },

  // getByMonthのエイリアス（後方互換性のため）
  async getStaffShifts(staffId: string, year: number, month: number): Promise<ShiftSubmission[]> {
    return this.getByMonth(staffId, year, month)
  },

  // 特定の日付のシフトを取得
  async getByDate(date: string): Promise<ShiftSubmission[]> {
    const { data, error } = await supabase
      .from('shift_submissions')
      .select('*')
      .eq('date', date)
      .eq('status', 'submitted')
    
    if (error) throw error
    return data || []
  },

  // シフトを作成または更新（upsert）
  async upsert(submission: Partial<ShiftSubmission>): Promise<ShiftSubmission> {
    const { data, error } = await supabase
      .from('shift_submissions')
      .upsert(submission, { onConflict: 'staff_id,date' })
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 複数のシフトを一括upsert
  async upsertMultiple(submissions: Partial<ShiftSubmission>[]): Promise<ShiftSubmission[]> {
    const { data, error } = await supabase
      .from('shift_submissions')
      .upsert(submissions, { onConflict: 'staff_id,date' })
      .select()
    
    if (error) throw error
    return data || []
  },

  // エイリアス: upsertStaffShifts
  async upsertStaffShifts(submissions: Partial<ShiftSubmission>[]): Promise<ShiftSubmission[]> {
    return this.upsertMultiple(submissions)
  },

  // 月間シフトを提出
  async submitMonthly(staffId: string, year: number, month: number): Promise<void> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]
    
    const { error } = await supabase
      .from('shift_submissions')
      .update({ 
        status: 'submitted', 
        submitted_at: new Date().toISOString() 
      })
      .eq('staff_id', staffId)
      .gte('date', startDate)
      .lte('date', endDate)
    
    if (error) throw error
  },

  // 全スタッフのシフトを取得（管理者用）
  async getAllStaffShifts(year: number, month: number): Promise<ShiftSubmission[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]
    
    const { data, error } = await supabase
      .from('shift_submissions')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('status', 'submitted') // 提出済みのみ
      .limit(10000) // デフォルト1000件制限を回避
      .order('date')
    
    if (error) throw error
    return data || []
  },

  // シフトを承認
  async approveShift(id: string): Promise<void> {
    const { error } = await supabase
      .from('shift_submissions')
      .update({ status: 'approved' })
      .eq('id', id)
    
    if (error) throw error
  },

  // シフトを却下
  async rejectShift(id: string, notes?: string): Promise<void> {
    const { error } = await supabase
      .from('shift_submissions')
      .update({ status: 'rejected', notes })
      .eq('id', id)
    
    if (error) throw error
  }
}

