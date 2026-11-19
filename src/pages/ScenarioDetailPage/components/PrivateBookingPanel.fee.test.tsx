// @vitest-environment jsdom
// 作品ページの貸切の料金欄: 独自休日が分からないときは金額の代わりに「確認中／確認できません」（2026-10-25）
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('./BookingNotice', () => ({ BookingNotice: () => null }))
import { PrivateBookingPanel } from './PrivateBookingPanel'

function render(feeUnknownText: string | null) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); const root = createRoot(host)
  act(() => root.render(<PrivateBookingPanel participationFee={4500} maxParticipationFee={5000} feeUnknownText={feeUnknownText} maxParticipants={4} selectedTimeSlotsCount={2} isLoggedIn availabilityReady onRequestBooking={() => {}} />))
  const text = host.textContent ?? ''
  act(() => root.unmount())
  return text
}

describe('作品ページの貸切の料金欄', () => {
  it('料金が分かれば幅を出す', () => {
    expect(render(null)).toContain('¥4,500〜¥5,000')
    expect(render(null)).toContain('¥18,000〜¥20,000')
  })
  it('独自休日が分からないときは金額を出さない（平日の料金で代わりに出さない）', () => {
    const text = render('確認できません')
    expect(text).toContain('確認できません')
    expect(text).not.toContain('¥4,500')
    expect(text).not.toContain('¥18,000')
  })
})
