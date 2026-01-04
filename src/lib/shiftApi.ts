import { supabase } from './supabase'
import { getCurrentOrganizationId } from '@/lib/organization'

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
  organization_id: string  // マルチテナント対応
  created_at: string
  updated_at: string
}

export const shiftApi = {
  // 月間シフトを取得
  async getByMonth(staffId: string, year: number, month: number): Promise<ShiftSubmission[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    // month月の最終日を取得（month+1月の0日 = month月の最終日）
    const daysInMonth = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
      .from('shift_submissions')
      .select('*')
      .eq('staff_id', staffId)
      .gte('date', startDate)
      .lte('date', endDate)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query.order('date')
    
    if (error) throw error
    return data || []
  },

  // getByMonthのエイリアス（後方互換性のため）
  async getStaffShifts(staffId: string, year: number, month: number): Promise<ShiftSubmission[]> {
    return this.getByMonth(staffId, year, month)
  },

  // 特定の日付のシフトを取得
  // 組織フィルタ: 自組織のスタッフのシフトのみ取得
  async getByDate(date: string, organizationId?: string): Promise<ShiftSubmission[]> {
    // 組織IDを取得
    const orgId = organizationId || await getCurrentOrganizationId()
    
    // まず自組織のスタッフIDを取得
    let staffIds: string[] = []
    if (orgId) {
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id')
        .eq('organization_id', orgId)
      
      if (staffError) throw staffError
      staffIds = staffData?.map(s => s.id) || []
      
      if (staffIds.length === 0) {
        return []
      }
    }
    
    let query = supabase
      .from('shift_submissions')
      .select('*')
      .eq('date', date)
      .eq('status', 'submitted')
    
    if (orgId && staffIds.length > 0) {
      query = query.in('staff_id', staffIds)
    }
    
    const { data, error } = await query
    
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
    // month月の最終日を取得
    const daysInMonth = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    
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
  // 組織フィルタ: 自組織のスタッフのシフトのみ取得
  async getAllStaffShifts(year: number, month: number, organizationId?: string): Promise<ShiftSubmission[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    // month月の最終日を取得
    const daysInMonth = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    
    // 組織IDを取得
    const orgId = organizationId || await getCurrentOrganizationId()
    
    // まず自組織のスタッフIDを取得
    let staffIds: string[] = []
    if (orgId) {
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id')
        .eq('organization_id', orgId)
      
      if (staffError) throw staffError
      staffIds = staffData?.map(s => s.id) || []
      
      // 自組織のスタッフがいない場合は空配列を返す
      if (staffIds.length === 0) {
        return []
      }
    }
    
    let query = supabase
      .from('shift_submissions')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .or('morning.eq.true,afternoon.eq.true,evening.eq.true,all_day.eq.true') // 時間帯が1つ以上選択されている
    
    // 組織のスタッフのみにフィルタ
    if (orgId && staffIds.length > 0) {
      query = query.in('staff_id', staffIds)
    }
    
    const { data, error } = await query
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

