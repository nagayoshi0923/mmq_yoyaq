// @vitest-environment jsdom
// 毎日点検（2026-11-17 本番で再現）: 4名を選んでから空き3の公演へ切り替えると、人数欄は「1名」と表示されるのに
// 料金・URL・予約は 4名のままだった。切り替えたら人数をその公演の残席までに収める
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventSchedule } from '../utils/types'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }))
vi.mock('@/hooks/useRequireCompleteProfile', () => ({ useRequireCompleteProfile: () => async () => true }))
vi.mock('@/lib/api/scenarioPageReadApi', () => ({ scenarioPageReadApi: { findEventSeats: vi.fn() } }))

import { useBookingActions } from './useBookingActions'

const ev = (id: string, available: number): EventSchedule => ({
  event_id: id, date: '2026-11-29', start_time: '14:00:00', end_time: '17:00:00', store_id: 's1',
  store_name: '店', store_short_name: '店', store_color: '#000', max_participants: 6,
  current_participants: 6 - available, available_seats: available, reservation_deadline_hours: 0, is_available: available > 0,
} as EventSchedule)
const EVENTS = [ev('wide', 6), ev('narrow', 3), ev('full', 0)]

let api: ReturnType<typeof useBookingActions>
let search = ''
function Page() {
  api = useBookingActions({ events: EVENTS, onReload: () => {} })
  search = useLocation().search
  return null
}
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()) })
const mount = (url = '/queens-waltz/scenario/x') =>
  act(async () => root.render(<MemoryRouter initialEntries={[url]}><Page /></MemoryRouter>))

describe('公演を切り替えたときの人数', () => {
  it('空きの少ない公演へ切り替えると、人数を残席までに収め URL も合わせる', async () => {
    await mount()
    await act(async () => { api.setSelectedEventId('wide') })
    await act(async () => { api.setParticipantCount(4) })
    expect(api.participantCount).toBe(4)
    await act(async () => { api.setSelectedEventId('narrow') })
    expect(api.participantCount).toBe(3)
    expect(new URLSearchParams(search).get('count')).toBe('3')
  })

  it('残席以内の人数は変えない', async () => {
    await mount()
    await act(async () => { api.setSelectedEventId('wide') })
    await act(async () => { api.setParticipantCount(2) })
    await act(async () => { api.setSelectedEventId('narrow') })
    expect(api.participantCount).toBe(2)
  })

  it('満席の公演（キャンセル待ち）では人数を変えない', async () => {
    await mount()
    await act(async () => { api.setSelectedEventId('wide') })
    await act(async () => { api.setParticipantCount(4) })
    await act(async () => { api.setSelectedEventId('full') })
    expect(api.participantCount).toBe(4)
  })
})
