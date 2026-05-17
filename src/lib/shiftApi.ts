import { supabase } from './supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { apiClient } from '@/lib/apiClient'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const SHIFT_SUBMISSION_SELECT_FIELDS =
  // NOTE: shift_submissions.notes がDBに無い環境があるため、selectに含めない（含めるとPostgRESTが400になる）
  'id, staff_id, date, morning, afternoon, evening, all_day, submitted_at, status, organization_id, created_at, updated_at' as const

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
  // DBに無い環境があるためオプショナルのまま（画面側は存在しなくても動くようにする）
  notes?: string | null
  organization_id: string  // マルチテナント対応
  created_at: string
  updated_at: string
}

export const shiftApi = {
  // 月間シフトを取得
  // バックエンド API (/api/shifts) 経由で org_id をサーバー側で強制フィルタ
  async getByMonth(staffId: string, year: number, month: number): Promise<ShiftSubmission[]> {
    return apiClient.get<ShiftSubmission[]>(
      `/api/shifts?staff_id=${encodeURIComponent(staffId)}&year=${year}&month=${month}`
    )
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
      .select(SHIFT_SUBMISSION_SELECT_FIELDS)
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
    // organization_idが設定されていない場合は自動設定（マルチテナント対応）
    const orgId = submission.organization_id || await getCurrentOrganizationId()
    
    const { data, error } = await supabase
      .from('shift_submissions')
      .upsert({ ...submission, organization_id: orgId }, { onConflict: 'staff_id,date' })
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 複数のシフトを一括upsert
  async upsertMultiple(submissions: Partial<ShiftSubmission>[]): Promise<ShiftSubmission[]> {
    // organization_idが設定されていない場合は自動設定（マルチテナント対応）
    const orgId = await getCurrentOrganizationId()
    
    const submissionsWithOrg = submissions.map(s => ({
      ...s,
      organization_id: s.organization_id || orgId
    }))
    
    const { data, error } = await supabase
      .from('shift_submissions')
      .upsert(submissionsWithOrg, { onConflict: 'staff_id,date' })
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
    
    // 組織フィルタ（マルチテナント対応）
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
      .from('shift_submissions')
      .update({ 
        status: 'submitted', 
        submitted_at: new Date().toISOString() 
      })
      .eq('staff_id', staffId)
      .gte('date', startDate)
      .lte('date', endDate)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { error } = await query
    
    if (error) throw error
  },

  // 全スタッフのシフトを取得（管理者用）
  // バックエンド API (/api/shifts) 経由で org_id をサーバー側で強制フィルタ
  // organizationId 引数は後方互換のため残すが未使用
  async getAllStaffShifts(year: number, month: number, _organizationId?: string): Promise<ShiftSubmission[]> {
    return apiClient.get<ShiftSubmission[]>(`/api/shifts?year=${year}&month=${month}`)
  },

  // シフトを承認（組織フィルタ付き）
  async approveShift(id: string): Promise<void> {
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
      .from('shift_submissions')
      .update({ status: 'approved' })
      .eq('id', id)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { error } = await query
    
    if (error) throw error
  },

  // シフトを却下（組織フィルタ付き）
  async rejectShift(id: string, notes?: string): Promise<void> {
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
      .from('shift_submissions')
      .update({ status: 'rejected', notes })
      .eq('id', id)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { error } = await query
    
    if (error) throw error
  }
}

