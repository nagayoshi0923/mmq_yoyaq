/**
 * ShiftSubmission関連の型定義
 */

export interface ShiftSubmission {
  id: string
  staff_id: string
  date: string
  morning: boolean
  afternoon: boolean
  evening: boolean
  all_day: boolean
  submitted_at: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
}

export interface DayInfo {
  date: string
  dayOfWeek: string
  day: number
  displayDate: string
}

