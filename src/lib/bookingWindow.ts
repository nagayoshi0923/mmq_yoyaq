export interface BookingWindow {
  judgment_deadline: string
  judgment_status: 'pending' | 'active' | 'confirmed' | 'cancelled'
  booking_deadline: string
  effective_booking_deadline: string
  override_minutes: number | null
  default_minutes: number
  updated_at: string
}

export function formatBookingDeadline(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
