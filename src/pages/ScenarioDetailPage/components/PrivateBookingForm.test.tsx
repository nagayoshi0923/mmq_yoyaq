// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
const seen = vi.hoisted(() => ({ grid: {} as Record<string, unknown>, store: {} as Record<string, unknown> }))
vi.mock('@/components/private-booking/PrivateBookingSlotGrid', () => ({ PrivateBookingSlotGrid: (p: Record<string, unknown>) => { seen.grid = p; return <div data-testid="slot-grid" /> } }))
vi.mock('./StoreSelector', () => ({ StoreSelector: (p: Record<string, unknown>) => { seen.store = p; return <div /> } }))
vi.mock('./BookingNotice', () => ({ BookingNotice: () => <div /> }))
import { PrivateBookingForm } from './PrivateBookingForm'
import { PrivateBookingPanel } from './PrivateBookingPanel'
import { PrivateBookingEntryChoice } from './PrivateBookingEntryChoice'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const formProps = {
  stores: [{ id: 's1', name: '大塚店', short_name: '大塚' }],
  selectedStoreIds: ['s1'], onStoreIdsChange: () => {}, currentMonth: new Date(2030, 0, 1), onMonthChange: () => {},
  availableDates: ['2030-01-20'], slotAvailability: { slotsByDate: {}, unavailableReasons: {} },
  selectedSlots: [], onTimeSlotToggle: () => {}, maxSelections: 6,
}

it('空き状況を読めなかったときは「空きなし」に見える枠を出さず、赤い案内と再読み込みを出す（Codex staging 点検）', async () => {
  const retry = vi.fn()
  await act(async () => root.render(<PrivateBookingForm {...formProps} availabilityError="読めませんでした" onRetryAvailability={retry} />))
  expect(host.querySelector('[data-testid="slot-grid"]')).toBeNull()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('空き状況を読み込めませんでした。通信を確認して再読み込みしてください')
  const button = host.querySelector<HTMLButtonElement>('[data-testid="private-booking-availability-retry"]')!
  expect(button.textContent).toContain('空き状況を再読み込み')
  await act(async () => button.click())
  expect(retry).toHaveBeenCalledTimes(1)
})

it('希望店舗はバッジで並べ、他の公演と重なる枠は「満席」で出す（QW-20261022-001）', async () => {
  await act(async () => root.render(<PrivateBookingForm {...formProps} />))
  expect(seen.store.selectedDisplay).toBe('badges')
  expect(seen.grid.conflictAsFull).toBe(true)
})

it('読めているときは枠を出し、案内は出さない', async () => {
  await act(async () => root.render(<PrivateBookingForm {...formProps} availabilityError={null} onRetryAvailability={() => {}} />))
  expect(host.querySelector('[data-testid="slot-grid"]')).not.toBeNull()
  expect(host.querySelector('[data-testid="private-booking-availability-error"]')).toBeNull()
})

it('受付範囲を読めなかったときは枠を出さず、再試行を出す。読めたら枠を出す（Codex 点検 不具合 5）', async () => {
  const retry = vi.fn()
  await act(async () => root.render(<PrivateBookingForm {...formProps} horizon={{ days: null, loading: false, failed: true, retry }} />))
  expect(host.querySelector('[data-testid="slot-grid"]')).toBeNull()
  expect(host.querySelector('[data-testid="private-booking-horizon-failed"]')!.textContent).toContain('受付範囲を確認できませんでした')
  await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="private-booking-horizon-retry"]')!.click())
  expect(retry).toHaveBeenCalledTimes(1)
  await act(async () => root.render(<PrivateBookingForm {...formProps} horizon={{ days: null, loading: true, failed: false, retry }} />))
  expect(host.querySelector('[data-testid="slot-grid"]')).toBeNull()
  expect(host.textContent).toContain('受付範囲を確認しています')
  await act(async () => root.render(<PrivateBookingForm {...formProps} horizon={{ days: 90, loading: false, failed: false, retry }} />))
  expect(host.querySelector('[data-testid="slot-grid"]')).not.toBeNull()
})

it('貸切タブ上部の「まずはメンバーを招待して貸切グループを作成」は選んでいる希望店舗を引き継ぐ。料金パネルには同じボタンを出さない（2026-11-14 段階1）', async () => {
  let path = ''
  function Where() { const l = useLocation(); path = l.pathname + l.search; return null }
  await act(async () => root.render(
    <MemoryRouter initialEntries={['/queens-waltz/scenario/x']}>
      <Routes>
        <Route path="/queens-waltz/scenario/x" element={<>
          <PrivateBookingEntryChoice scenarioMasterId="m1" scenarioTitle="作品" organizationSlug="queens-waltz" preferredStoreIds={['s1', 's2']} isLoggedIn />
          <PrivateBookingPanel participationFee={4000} maxParticipants={6} selectedTimeSlotsCount={0}
            isLoggedIn onRequestBooking={() => {}} scenarioId="m1" organizationSlug="queens-waltz" preferredStoreIds={['s1', 's2']} />
        </>} />
        <Route path="/group/create" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  ))
  const buttons = [...host.querySelectorAll('button')].filter(b => b.textContent?.includes('まずはメンバーを招待して貸切グループを作成'))
  expect(buttons).toHaveLength(1)
  expect(host.textContent).toContain('日程が決まっている')
  await act(async () => buttons[0].click())
  expect(path).toBe('/group/create?scenarioId=m1&org=queens-waltz&mode=no-dates&stores=s1,s2')
})

it('締切済みの日は 1 行にたたみ、空きのない日は省く。押すと空きのない日も出す（2026-11-14 段階1）', async () => {
  const slot = (label: '午前' | '午後' | '夜', key: 'morning' | 'afternoon' | 'evening', start = '19:00') => ({ key, label, startTime: start, endTime: '22:00' })
  const availability = {
    slotsByDate: { '2030-01-20': [slot('夜', 'evening')], '2030-01-21': [slot('夜', 'evening')] },
    unavailableReasons: { '2030-01-21-夜': '他の公演と重なります' },
  }
  await act(async () => root.render(<PrivateBookingForm {...formProps} currentMonth={new Date(2030, 0, 1)}
    availableDates={['2030-01-01', '2030-01-20', '2030-01-21']} slotAvailability={availability}
    deadlineDays={0} />))
  expect(seen.grid.availableDates).toEqual(['2030-01-20'])
  await act(async () => root.render(<PrivateBookingForm {...formProps} currentMonth={new Date(2030, 0, 1)}
    availableDates={['2030-01-01', '2030-01-20', '2030-01-21']} slotAvailability={availability}
    deadlineDays={0} dateFilter={(d: string) => d !== '2030-01-20'} />))
  expect(seen.grid.availableDates).toEqual([])
  // 時間帯で絞ったら、その時間帯に空きのある日だけ（夜だけ空いている日は「午前」では出さない。Codex 指摘）
  await act(async () => root.render(<PrivateBookingForm {...formProps} currentMonth={new Date(2030, 0, 1)}
    availableDates={['2030-01-01', '2030-01-20', '2030-01-21']} slotAvailability={availability}
    deadlineDays={0} slotFilter="午前" nextOpenMonth={{ label: '2月', onClick: () => {} }} />))
  expect(seen.grid.availableDates).toEqual([])
})
