// スケジュール関連の型定義

export interface ScheduleEvent {
  id: string
  date: string
  venue: string
  scenario: string
  gms: string[]
  start_time: string
  end_time: string
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package'
  reservation_info?: string
  notes?: string
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
  is_reservation_enabled?: boolean
  is_private_request?: boolean // 貸切リクエストかどうか
  reservation_id?: string // 貸切リクエストの元のreservation ID
  is_private_booking?: boolean // 貸切予約かどうか
  timeSlot?: string // 貸切予約の時間帯（朝/昼/夜）
}

