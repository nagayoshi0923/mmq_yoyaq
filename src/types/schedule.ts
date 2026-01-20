// スケジュール関連の型定義

export interface ScheduleEvent {
  id: string
  date: string
  venue: string
  scenario: string
  gms: string[]
  start_time: string
  end_time: string
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package' | 'mtg'
  reservation_info?: string
  notes?: string
  is_cancelled: boolean
  is_tentative?: boolean // 仮状態（非公開）
  current_participants?: number // DBカラム名に統一（旧: participant_count）
  max_participants?: number
  is_reservation_enabled?: boolean
  is_private_request?: boolean // 貸切リクエストかどうか
  reservation_id?: string // 貸切リクエストの元のreservation ID
  is_private_booking?: boolean // 貸切予約かどうか
  time_slot?: string // 貸切予約の時間帯（朝/昼/夜）
  reservation_name?: string // 貸切予約の予約者名
  original_customer_name?: string // MMQからの元の予約者名（上書き検出用）
  is_reservation_name_overwritten?: boolean // 予約者名が手動で上書きされたかどうか
  gm_roles?: Record<string, string> // { "GM名": "main" | "sub" | "staff" }
  venue_rental_fee?: number // 場所貸し公演料金
  organization_id?: string // マルチテナント対応
  scenarios?: {
    id: string
    title: string
    player_count_max: number
  }
}

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
  gmRoles: Record<string, string>
  gm_roles?: Record<string, string>
  notes?: string
  id?: string
  is_private_request?: boolean
  reservation_id?: string
  time_slot?: string
  venue_rental_fee?: number // 場所貸し公演料金
  reservation_name?: string // 貸切予約の予約者名
}
