// 公演編集モーダルの型定義

import type { Staff, Scenario, Store, Reservation, Customer } from '@/types'

// スケジュールイベントの型定義
export interface ScheduleEvent {
  id: string
  date: string // YYYY-MM-DD
  venue: string // 店舗ID
  scenario: string
  gms: string[] // GMの名前の配列
  start_time: string // HH:MM
  end_time: string // HH:MM
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package'
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
  notes?: string
  is_private_request?: boolean
  reservation_id?: string
  reservation_info?: string
  timeSlot?: string
}

// イベントフォームデータ
export interface EventFormData {
  date: string
  venue: string
  scenario: string
  scenario_id?: string
  category: string
  start_time: string
  end_time: string
  max_participants: number
  capacity: number
  gms: string[]
  notes?: string
  id?: string
  is_private_request?: boolean
  reservation_id?: string
  time_slot?: string
}

// メールコンテンツ
export interface EmailContent {
  customerEmail: string
  customerName: string
  cancellationReason: string
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  participantCount: number
  totalPrice: number
  reservationNumber: string
  cancellationFee: number
}

// 新規参加者データ
export interface NewParticipant {
  customer_name: string
  participant_count: number
  payment_method: 'onsite' | 'online' | 'staff'
  notes: string
}

// モーダルのモード
export type ModalMode = 'add' | 'edit'

// プロパティ型
export interface PerformanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (eventData: EventFormData) => void
  mode: ModalMode
  event?: ScheduleEvent | null
  initialData?: { date: string; venue: string; timeSlot: string }
  stores: Store[]
  scenarios: Scenario[]
  staff: Staff[]
  availableStaffByScenario?: Record<string, Staff[]>
  onScenariosUpdate?: () => void
  onStaffUpdate?: () => void
  onParticipantChange?: (eventId: string, newCount: number) => void
}

