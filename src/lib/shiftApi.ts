import { apiClient } from '@/lib/apiClient'

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
  organization_id: string // マルチテナント対応
  created_at: string
  updated_at: string
}

// すべてバックエンド API (/api/shifts) 経由で org_id をサーバー側で強制
export const shiftApi = {
  // 月間シフトを取得
  async getByMonth(staffId: string, year: number, month: number): Promise<ShiftSubmission[]> {
    return apiClient.get<ShiftSubmission[]>(
      `/api/shifts?staff_id=${encodeURIComponent(staffId)}&year=${year}&month=${month}`
    )
  },

  // getByMonth のエイリアス（後方互換性のため）
  async getStaffShifts(staffId: string, year: number, month: number): Promise<ShiftSubmission[]> {
    return this.getByMonth(staffId, year, month)
  },

  // 特定の日付のシフトを取得（自組織のスタッフのみ、status=submitted）
  async getByDate(date: string, _organizationId?: string): Promise<ShiftSubmission[]> {
    return apiClient.get<ShiftSubmission[]>(`/api/shifts?date=${encodeURIComponent(date)}`)
  },

  // シフトを作成または更新（upsert）
  async upsert(submission: Partial<ShiftSubmission>): Promise<ShiftSubmission> {
    const data = await apiClient.post<ShiftSubmission[]>('/api/shifts', { shifts: [submission] })
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('シフトの保存結果が空です')
    }
    return data[0]
  },

  // 複数のシフトを一括upsert
  async upsertMultiple(submissions: Partial<ShiftSubmission>[]): Promise<ShiftSubmission[]> {
    if (submissions.length === 0) return []
    return apiClient.post<ShiftSubmission[]>('/api/shifts', { shifts: submissions })
  },

  // エイリアス: upsertStaffShifts
  async upsertStaffShifts(submissions: Partial<ShiftSubmission>[]): Promise<ShiftSubmission[]> {
    return this.upsertMultiple(submissions)
  },

  // 月間シフトを提出
  async submitMonthly(staffId: string, year: number, month: number): Promise<void> {
    await apiClient.post('/api/shifts?action=submit_monthly', {
      staff_id: staffId,
      year,
      month,
    })
  },

  // 全スタッフのシフトを取得（管理者用）
  async getAllStaffShifts(year: number, month: number, _organizationId?: string): Promise<ShiftSubmission[]> {
    return apiClient.get<ShiftSubmission[]>(`/api/shifts?year=${year}&month=${month}`)
  },

  // シフトを承認（組織フィルタ付き、バックエンドで自組織のみ操作可能）
  async approveShift(id: string): Promise<void> {
    await apiClient.patch('/api/shifts', { id, action: 'approve' })
  },

  // シフトを却下（組織フィルタ付き、バックエンドで自組織のみ操作可能）
  // notes は環境依存のため受け取らない（API も保存しない）
  async rejectShift(id: string, _notes?: string): Promise<void> {
    await apiClient.patch('/api/shifts', { id, action: 'reject' })
  },
}
