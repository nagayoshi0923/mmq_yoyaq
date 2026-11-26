import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BookingRequestCard } from './BookingRequestCard'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

// #1256: 店舗承認待ち（gm_confirmed）でも Discord 再通知を出す
const base = {
  id: 'r', reservation_number: 'R-1', scenario_title: '作品', customer_name: '幹事', participant_count: 4,
  created_at: '2026-11-20T00:00:00Z',
  gm_responses: [
    { staff_id: 's1', gm_name: 'GM甲', response_status: 'available', available_candidates: [1], notified_at: '2026-11-20T01:00:00Z', responded_at: '2026-11-20T02:00:00Z' },
    { staff_id: 's2', gm_name: 'GM乙', response_status: 'pending', available_candidates: null, notified_at: '2026-11-20T01:00:00Z' },
  ],
}

function render(status: string) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <BookingRequestCard
        request={{ ...base, status } as never}
        onResendDiscordNotification={async () => {}}
        onResendDiscordGm={async () => {}}
      />
    </QueryClientProvider>,
  )
}

describe('Discord再通知ボタン', () => {
  it.each(['pending', 'pending_gm', 'gm_confirmed', 'pending_store'])('承認前（%s）は全体と未回答GMへの再通知を出す', (status) => {
    const html = render(status)
    expect(html).toContain('Discord再通知')
    expect(html).toContain('再通知</button>')
  })
  it.each(['confirmed', 'cancelled'])('承認後・取消後（%s）は出さない', (status) => {
    expect(render(status)).not.toContain('再通知')
  })
})
