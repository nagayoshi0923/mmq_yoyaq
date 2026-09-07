import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type BookingWindow, formatBookingDeadline } from '@/lib/bookingWindow'

export function BookingDeadlineNotice({ eventId }: { eventId: string }) {
  const { data, isError } = useQuery({
    queryKey: ['booking-window', eventId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_performance_booking_window', { p_event_id: eventId })
      if (error) throw error
      return (data?.[0] ?? null) as BookingWindow | null
    },
    staleTime: 0,
  })
  if (isError) return <p role="status">予約締切を確認できません。予約時に再確認します。</p>
  if (!data) return null
  return <p>予約受付：{formatBookingDeadline(data.effective_booking_deadline)}まで（日本時間）{data.judgment_status === 'active' ? '／追加募集の開催判断待ち' : ''}</p>
}
