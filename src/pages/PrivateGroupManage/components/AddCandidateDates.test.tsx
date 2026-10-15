// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { AddCandidateDates } from './AddCandidateDates'
const mocks = vi.hoisted(() => ({ save: vi.fn(), toast: vi.fn(), holiday: vi.fn(), holidayState: { isCustomHoliday: () => false, isLoading: false, error: null as string | null } }))
vi.mock('@/lib/privateGroupCandidateDates', () => ({ addPrivateGroupCandidates: mocks.save }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/utils/toast', () => ({ showToast: { error: mocks.toast } }))
vi.mock('@/hooks/useCustomHolidays', () => ({ useCustomHolidays: (options: unknown) => { mocks.holiday(options); return mocks.holidayState } }))
vi.mock('@/hooks/usePrivateBookingDeadlineDays', () => ({ DEFAULT_PRIVATE_BOOKING_DEADLINE_DAYS: 0, usePrivateBookingDeadlineState: () => ({ days: 0, loading: false }) }))
vi.mock('@/hooks/useCandidateSlotAvailability', () => {
 const stable = { availability: { slotsByDate: {}, unavailableReasons: {} }, loading: false, ready: true, error: null, reload: () => {} }
 return { useCandidateSlotAvailability: () => stable }
})
vi.mock('@/hooks/useScenarioStoreHint', () => ({ useScenarioStoreHint: () => null }))
vi.mock('@/components/private-booking/PrivateBookingSlotGrid', () => ({ PrivateBookingSlotGrid: (props: { availableDates: string[]; onSlotToggle: (date: string, slot: unknown) => void }) => <button onClick={() => props.onSlotToggle(props.availableDates[0], { key: 'afternoon', label: '午後', startTime: '13:00', endTime: '16:00' })}>テスト候補</button> }))
let root: Root
let container: HTMLDivElement
const updated = vi.fn()
const button = (text: string) => [...container.querySelectorAll('button')].find(node => node.textContent === text)!
const render = () => act(async () => { root.render(<AddCandidateDates groupId="group" organizationId="org" scenarioId="scenario" storeIds={['store']} existingDates={[]} onDatesAdded={updated} />) })
beforeEach(() => {
 Object.assign(globalThis,{ IS_REACT_ACT_ENVIRONMENT: true })
 mocks.holidayState.isLoading = false; mocks.holidayState.error = null
 container = document.createElement('div'); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); vi.clearAllMocks() })
it('二重保存を防ぎ、通信失敗後は選択と送信番号を維持して再送する', async () => {
 let rejectSave!: (reason: unknown) => void
 mocks.save.mockReturnValueOnce(new Promise((_,reject) => { rejectSave = reject }))
 await render()
 expect(mocks.holiday).toHaveBeenCalledWith({ organizationId: 'org' })
 await act(async () => button('候補日を追加').click())
 await act(async () => button('テスト候補').click())
 await act(async () => { const save=button('候補日を保存'); save.click(); save.click() })
 expect(mocks.save).toHaveBeenCalledTimes(1)
 expect(button('キャンセル').disabled).toBe(true)
 await act(async () => rejectSave(new Error('通信切断')))
 expect(button('候補日を保存').disabled).toBe(false)
 expect(updated).not.toHaveBeenCalled()
 mocks.save.mockResolvedValueOnce(undefined)
 await act(async () => button('候補日を保存').click())
 expect(mocks.save).toHaveBeenCalledTimes(2)
 expect(mocks.save.mock.calls[1][0]).toEqual(mocks.save.mock.calls[0][0])
 expect(updated).toHaveBeenCalledTimes(1)
 expect(button('候補日を追加')).toBeDefined()
})
it('休日取得失敗中は候補を保存しない', async () => {
 mocks.holidayState.error = '休日設定を取得できません'
 await render()
 await act(async () => button('候補日を追加').click())
 await act(async () => button('テスト候補').click())
 expect(container.querySelector('[role="alert"]')?.textContent).toContain('休日設定')
 expect(button('候補日を保存').disabled).toBe(true)
 expect(mocks.save).not.toHaveBeenCalled()
})
