/**
 * 参加者追加フォームの入力状態の型。
 * ReservationList と AddParticipantSection で共有する。
 */
export interface NewParticipant {
  customer_name: string
  participant_count: number
  payment_method: 'onsite' | 'online' | 'staff'
  notes: string
}
