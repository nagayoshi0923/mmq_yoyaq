// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { CalendarView } from './CalendarView'
import type { PublicStoreRow } from '../hooks/useBookingData'
import { formatDateJST } from '@/utils/dateUtils'

type Slot = 'morning' | 'afternoon' | 'evening'
type Option = { storeId: string; startTime: string }
// 店舗ごとの受付可の枠（店舗 ID → 時間帯 → 開始時刻）
const state = vi.hoisted(() => ({ ids: [] as string[], open: {} as Record<string, Partial<Record<Slot, string>>>, useSlots: vi.fn() }))
vi.mock('../hooks/usePublicPrivateBookingSlots', () => ({
  usePublicPrivateBookingSlots: (_org: unknown, ids: string[], _month: unknown) => {
    state.useSlots(ids)
    state.ids = ids
    return (_date: string, slot: Slot): Option[] => state.ids
      .flatMap(id => (state.open[id]?.[slot] ? [{ storeId: id, startTime: state.open[id][slot]! }] : []))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  },
}))
vi.mock('./BookingFilters', () => ({ BookingFilters: () => null }))
vi.mock('../hooks/useBookingData', () => ({ scenarioCardId: () => 'scenario', scenarioCardTitle: () => '架空作品' }))

const stores = [
  { id: 'sapporo', name: '札幌', short_name: '札幌', color: 'blue' },
  { id: 'okubo', name: '大久保', short_name: '大久保', color: 'orange' },
  { id: 'temp1', name: '臨時会場', short_name: '臨時', color: 'gray', is_temporary: true },
] as PublicStoreRow[]

let root: Root
let host: HTMLDivElement
function Path() { return createElement('output', { id: 'path' }, useLocation().pathname + useLocation().search) }
const daysFromToday = (n: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d }

async function mount(storeOptions: { id: string; label: string }[], day: Date) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const element = createElement(CalendarView, {
    organizationId: 'org', organizationSlug: 'qa', stores, storeOptions, primaryColor: '#000',
    selectedStoreIds: [], onStoreIdsChange: () => {}, onMonthChange: () => {}, scenarios: [], onCardClick: () => {},
    privateBookingDeadlineDays: 14, currentMonth: new Date(day.getFullYear(), day.getMonth(), 1),
    calendarDays: [{ date: day, isCurrentMonth: true }], getEventsForDate: () => [], getStoreName: () => '', getStoreColor: () => '#000',
  })
  await act(async () => root.render(createElement(MemoryRouter, null, element, createElement(Path))))
}
const chips = () => [...host.querySelectorAll('button')].map(b => b.textContent?.replace(/\s/g, ''))

afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); state.open = {}; vi.clearAllMocks() })

it('店舗未選択・対象店舗 1 つ: その店舗の受付可の枠だけチップを出し、案内文は出さない', async () => {
  state.open = { sapporo: { afternoon: '13:00', evening: '19:00' } }
  const day = daysFromToday(20)
  await mount([{ id: 'sapporo', label: '札幌店' }], day)
  expect(state.useSlots).toHaveBeenCalledWith(['sapporo'])
  expect(chips()).toEqual(['13:00〜貸切申込', '19:00〜貸切申込'])
  expect(host.textContent).not.toContain('店舗を選択して貸切申込')
  await act(async () => host.querySelector('button')!.click())
  expect(host.querySelector('#path')?.textContent).toBe(`/qa/private-booking-select?date=${formatDateJST(day)}&store=sapporo&slot=afternoon&time=13:00`)
})

it('店舗未選択・対象店舗が複数: 受付可の店舗がある枠だけ出し、受付可の店舗をまとめて渡す', async () => {
  state.open = { sapporo: { evening: '19:00' }, okubo: { afternoon: '14:00', evening: '18:30' } }
  const day = daysFromToday(20)
  await mount([{ id: 'sapporo', label: '札幌店' }, { id: 'okubo', label: '大久保店' }], day)
  expect(state.useSlots).toHaveBeenCalledWith(['sapporo', 'okubo'])
  expect(chips()).toEqual(['14:00〜貸切申込', '18:30〜貸切申込'])
  await act(async () => [...host.querySelectorAll('button')][1].click())
  expect(host.querySelector('#path')?.textContent).toBe(`/qa/private-booking-select?date=${formatDateJST(day)}&store=okubo,sapporo&slot=evening&time=18:30`)
})

it('店舗未選択・臨時会場のみ: 判定対象が無いので何も出さない', async () => {
  state.open = { temp1: { afternoon: '13:00' } }
  await mount([], daysFromToday(20))
  expect(state.useSlots).toHaveBeenCalledWith([])
  expect(chips()).toEqual([])
  expect(host.textContent).not.toContain('貸切申込')
})

it('店舗未選択・締切（14 日前）より手前の日: 受付可でも何も出さない', async () => {
  state.open = { sapporo: { afternoon: '13:00', evening: '19:00' } }
  await mount([{ id: 'sapporo', label: '札幌店' }], daysFromToday(3))
  expect(chips()).toEqual([])
  expect(host.textContent).not.toContain('貸切申込')
})

it('店舗未選択・受付可の枠なし（休業日など）: 何も出さない', async () => {
  await mount([{ id: 'sapporo', label: '札幌店' }, { id: 'okubo', label: '大久保店' }], daysFromToday(20))
  expect(chips()).toEqual([])
  expect(host.textContent).not.toContain('貸切申込')
})
