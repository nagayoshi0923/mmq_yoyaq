// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ListView } from './ListView'
import { CalendarView } from './CalendarView'
import type { PublicStoreRow, EnrichedPublicEvent } from '../hooks/useBookingData'

const state = vi.hoisted(() => ({ getOptions: vi.fn(), useSlots: vi.fn() }))
vi.mock('../hooks/usePublicPrivateBookingSlots', () => ({ usePublicPrivateBookingSlots: (...args: unknown[]) => { state.useSlots(...args); return state.getOptions } }))
vi.mock('./BookingFilters', () => ({ BookingFilters: () => null }))
vi.mock('../hooks/useBookingData', () => ({ scenarioCardId: () => 'scenario', scenarioCardTitle: () => '架空作品' }))
const stores = [{ id: 'sapporo', name: '札幌', short_name: '札幌', color: 'blue' }, { id: 'okubo', name: '大久保', short_name: '大久保', color: 'orange' }] as PublicStoreRow[]
let root: Root
let host: HTMLDivElement
function Path() { return createElement('output', { id: 'path' }, useLocation().pathname + useLocation().search) }
async function mount(view: 'list' | 'calendar', hideSoldOut = false, hidePlayed = false, events: EnrichedPublicEvent[] = []) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const common = { organizationId: 'org', organizationSlug: 'qa', stores, storeOptions: [], primaryColor: '#000', selectedStoreIds: ['sapporo', 'okubo'], onStoreIdsChange: () => {}, onMonthChange: () => {}, scenarios: [], onCardClick: () => {}, hideSoldOut, hidePlayed, playedScenarioIds: new Set(['scenario']), privateBookingDeadlineDays: 14 }
  const element = view === 'list'
    ? createElement(ListView, { ...common, listViewMonth: new Date(2030, 0, 1), listViewData: [{ date: 8, store: stores[0] }], getEventsForDateStore: () => events, getColorFromName: () => '#000' })
    : createElement(CalendarView, { ...common, currentMonth: new Date(2030, 0, 1), calendarDays: [{ date: new Date(2030, 0, 8), isCurrentMonth: true }], getEventsForDate: () => events, getStoreName: () => '札幌', getStoreColor: () => '#000' })
  await act(async () => root.render(createElement(MemoryRouter, null, element, createElement(Path))))
}
afterEach(async () => { if(root) await act(async () => root.unmount()); host?.remove(); vi.clearAllMocks() })
for (const view of ['list', 'calendar'] as const) {
  it(`${view}: 入口のクリックは受付可能店舗と設定時刻だけを次へ渡す`, async () => {
    state.getOptions.mockImplementation((_date: string, slot: string, ids?: string[]) => slot === 'afternoon' ? [{ storeId: ids?.[0] ?? 'sapporo', startTime: '13:00' }] : [])
    await mount(view)
    const buttons = [...host.querySelectorAll('button')]
    expect(buttons.map(b => b.textContent?.replace(/\s/g, ''))).toEqual(['13:00〜貸切申込'])
    await act(async () => buttons[0].click())
    expect(host.querySelector('#path')?.textContent).toBe('/qa/private-booking-select?date=2030-01-08&store=sapporo&slot=afternoon&time=13:00')
    expect(state.useSlots).toHaveBeenCalledWith('org', ['sapporo', 'okubo'], new Date(2030, 0, 1))
  })
  it(`${view}: 満席・体験済み非表示でも占有枠を申込に変えない`, async () => {
    state.getOptions.mockReturnValue([])
    await mount(view, true, true, [{ id: 'occupied', date: '2030-01-08', store_id: 'sapporo', start_time: '13:00', end_time: '18:00', category: 'private', scenario_master_id: 'scenario', is_private_booking: true }] as EnrichedPublicEvent[])
    expect(host.textContent).not.toContain('貸切申込')
    expect(host.querySelectorAll('button')).toHaveLength(0)
  })
}
