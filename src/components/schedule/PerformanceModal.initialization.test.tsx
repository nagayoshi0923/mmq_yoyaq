// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PerformanceModal } from './PerformanceModal'
import type { EventFormData, ScheduleEvent } from '@/types/schedule'
import type { Scenario } from '@/types'
import type { SearchableSelectOption } from '@/components/ui/searchable-select'
import { renderToStaticMarkup } from 'react-dom/server'

const api = vi.hoisted(() => ({ participation: vi.fn(), memo: vi.fn(), close: vi.fn(), save: vi.fn(), optionsSeen: vi.fn(), slotsLoading: false, slotsVersion: 0 }))
vi.mock('@/lib/reservationApi', () => ({ reservationApi: { getStaffParticipation: api.participation } }))
vi.mock('./SlotMemoInput', () => ({ getEmptySlotMemo: api.memo, clearEmptySlotMemo: vi.fn() }))
vi.mock('@/lib/api', () => ({ staffApi: {} }))
vi.mock('@/lib/api/kitApi', () => ({ kitApi: { getKitLocationsByScenario: async () => [] } }))
vi.mock('@/lib/api/scheduleUiApi', () => ({ scheduleUiApi: { getBusinessHours: async () => ({ data: null }) } }))
vi.mock('@/lib/api/scheduleApi', () => ({ scheduleApi: { getByDateRange: async () => [] } }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: async () => 'test-org' }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organizationId: 'test-org' }) }))
vi.mock('@/hooks/usePreparationSettings', () => ({ usePreparationSettings: () => ({ data: {}, resolve: () => 0 }) }))
vi.mock('@/hooks/useOperatingSettings', () => ({ useOperatingSettings: () => ({ data: {}, loading: false, resolve: () => ({ value: 180 }) }) }))
vi.mock('@/hooks/useTimeSlotSettings', () => {
  const getDefaultsForDate = () => ({ morning: { start_time: '10:00', end_time: '14:00' }, afternoon: { start_time: '14:30', end_time: '18:30' }, evening: { start_time: '19:00', end_time: '23:00' } })
  const refreshedDefaults = (...args: Parameters<typeof getDefaultsForDate>) => getDefaultsForDate(...args)
  return { useTimeSlotSettings: () => ({ getDefaultsForDate: api.slotsVersion === 0 ? getDefaultsForDate : refreshedDefaults, isLoading: api.slotsLoading }) }
})
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <>{children}</> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}))
vi.mock('./performanceModal/sections/StaffNotesSection', () => ({ StaffNotesSection: ({ formData, setFormData }: { formData: EventFormData; setFormData: (fn: (value: EventFormData) => EventFormData) => void }) => <textarea aria-label="備考" value={formData.notes} onChange={e => setFormData(value => ({ ...value, notes: e.target.value }))} /> }))
vi.mock('./performanceModal/sections/DateLocationSection', () => ({ DateLocationSection: () => null }))
vi.mock('./performanceModal/sections/PerformanceContentSection', () => ({ PerformanceContentSection: (props: { scenarioOptions: SearchableSelectOption[]; scenarioOptionsNote?: string; formData: EventFormData }) => { api.optionsSeen(props); return <button>作品を編集</button> } }))
vi.mock('./performanceModal/sections/CategorySelectSection', () => ({ CategorySelectSection: () => null }))
vi.mock('./performanceModal/sections/PerformanceSummary', () => ({ PerformanceSummary: () => null }))
vi.mock('./performanceModal/dialogs/PerformanceConfirmDialogs', () => ({ ScenarioChangeConfirmDialog: () => null, DeleteEventConfirmDialog: () => null }))
vi.mock('@/components/modals/ScenarioEditDialogV2', () => ({ ScenarioEditDialogV2: () => null }))
vi.mock('@/components/modals/StaffEditModal', () => ({ StaffEditModal: () => null }))
vi.mock('@/components/settings/PerformanceOperatingSettings', () => ({ PerformanceOperatingSettings: () => <button>運用設定を保存</button> }))
vi.mock('./BookingDeadlineTab', () => ({ BookingDeadlineTab: () => null }))
vi.mock('./modal/ReservationList', () => ({ ReservationList: () => <button>参加者を追加</button> }))
vi.mock('./modal/EventHistoryTab', () => ({ EventHistoryTab: () => null }))
vi.mock('./modal/SurveyResponsesTab', () => ({ SurveyResponsesTab: () => null }))

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
const participation = { entries: [], reservations: [], assignment: { gms: [], gm_roles: {} } }
const eventA = { id: 'test-event-a', scenario: '架空作品', date: '2026-10-22', venue: 'test-store', start_time: '10:00', end_time: '14:00', time_slot: '朝', category: 'open', gms: [], gm_roles: {}, notes: 'Aの元メモ', max_participants: 6 } as unknown as ScheduleEvent
const eventB = { ...eventA, id: 'test-event-b', notes: 'Bの元メモ' }
let root: Root, container: HTMLDivElement
const props = { isOpen: true, mode: 'edit' as const, event: eventA, onClose: api.close, onSave: api.save, onDeleteEvent: vi.fn(), stores: [], scenarios: [], staff: [] }
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === name)!
const render = async (overrides: Partial<Parameters<typeof PerformanceModal>[0]> = {}) => { await act(async () => root.render(<PerformanceModal {...props} {...overrides} />)) }
async function settle(pending: ReturnType<typeof deferred<typeof participation>>) { await act(async () => pending.resolve(participation)) }
async function typeNotes(value: string) {
  await act(async () => {
    const input = container.querySelector<HTMLTextAreaElement>('textarea')!
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks(); api.slotsLoading = false; api.slotsVersion = 0; api.memo.mockResolvedValue(''); api.save.mockResolvedValue(false)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('公演の非同期初期化と編集の境界', () => {
  it.each(['add', 'edit'] as const)('%sでも月次件数と順位を表示し、編集時の選択作品を先頭に保つ', async (mode) => {
    api.participation.mockResolvedValue(participation)
    await render({ mode, event: mode === 'edit' ? eventA : null, initialData: { date: eventA.date, venue: eventA.venue, time_slot: 'morning' },
      scenarios: [{ id: 'old', title: '架空作品', created_at: '2020-01-01', organization_id: 'test-org', play_count: 0 }] as Scenario[],
      scenarioPlacement: { organizationId: 'test-org', month: '2026-10', organizationStoreIds: ['test-store'], selectedStoreIds: [], storeLabel: '全店舗', events: [{ ...eventA, scenario_master_id: 'old' }], ready: true } })
    const content = api.optionsSeen.mock.calls.at(-1)?.[0]
    expect(content?.scenarioOptionsNote).toContain('2026年10月・全店舗')
    expect(renderToStaticMarkup(<>{content?.scenarioOptions[0]?.displayInfo}</>)).toContain('貸切 0件／オープン 1件')
    expect(content.formData.scenario).toBe(mode === 'edit' ? '架空作品' : '')
    expect(content.scenarioOptions[0]?.group).toBe(mode === 'edit' ? '選択中' : '3 その他（既存の表示順）')
    expect(api.save).not.toHaveBeenCalled()
  })
  it('遅い取得中は入力・別タブ・削除・保存を開始できず、閉じる操作は使える', async () => {
    const pending = deferred<typeof participation>(); api.participation.mockReturnValue(pending.promise)
    await render()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('読み込んでいます')
    expect(container.querySelector('textarea')).toBeNull(); expect(button('作品を編集')).toBeUndefined()
    expect(button('保存').disabled).toBe(true); expect(button('この予定を削除').disabled).toBe(true)
    expect([...container.querySelectorAll('nav button')].every(item => (item as HTMLButtonElement).disabled)).toBe(true)
    await act(async () => { button('保存').click(); button('この予定を削除').click(); button('キャンセル').click() })
    expect(api.save).not.toHaveBeenCalled(); expect(api.close).toHaveBeenCalledTimes(1)
    await settle(pending)
    expect(button('保存').disabled).toBe(false); expect(container.querySelector('textarea')?.value).toBe('Aの元メモ')
    await typeNotes('利用者が入力したメモ')
    expect(container.querySelector('textarea')?.value).toBe('利用者が入力したメモ')
  })
  it('編集開始後の時間帯設定の遅着は、入力済みのメモを初期化し直さない', async () => {
    api.participation.mockResolvedValue(participation); api.slotsLoading = true
    await render(); await typeNotes('設定を待たずに編集したメモ')
    api.slotsLoading = false; api.slotsVersion = 1
    await render()
    expect(api.participation).toHaveBeenCalledTimes(1)
    expect(container.querySelector('textarea')?.value).toBe('設定を待たずに編集したメモ')
  })
  it('追加は時間帯設定が揃うまで枠メモ読込も入力も開始しない', async () => {
    api.slotsLoading = true
    const initialData = { date: '2026-10-22', venue: 'test-store', time_slot: 'morning' }
    await render({ mode: 'add', event: null, initialData })
    expect(api.memo).not.toHaveBeenCalled(); expect(container.querySelector('textarea')).toBeNull()
    api.slotsLoading = false; api.slotsVersion = 1
    await render({ mode: 'add', event: null, initialData })
    expect(api.memo).toHaveBeenCalledTimes(1); expect(container.querySelector('textarea')).not.toBeNull()
  })
  it('閉じて再び開いた後の入力を、閉じる前の遅着結果が上書きしない', async () => {
    const old = deferred<typeof participation>(), current = deferred<typeof participation>()
    api.participation.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    await render(); await render({ isOpen: false }); await render(); await settle(current)
    await typeNotes('再度開いた後の入力'); await settle(old)
    expect(container.querySelector('textarea')?.value).toBe('再度開いた後の入力')
  })
  it('別公演に切り替わったら再び入力を閉じ、古い公演の失敗を反映しない', async () => {
    const old = deferred<typeof participation>(), current = deferred<typeof participation>()
    api.participation.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    await render(); await render({ event: eventB })
    expect(container.querySelector('textarea')).toBeNull()
    await settle(current); await typeNotes('Bの入力')
    await act(async () => old.reject(new Error('古い要求の失敗')))
    expect(container.querySelector('[role="alert"]')).toBeNull(); expect(container.querySelector('textarea')?.value).toBe('Bの入力')
  })
  it('取得失敗時は入力・保存を許さず、再試行が成功すれば編集できる', async () => {
    const first = deferred<typeof participation>(), retry = deferred<typeof participation>()
    api.participation.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise)
    await render(); await act(async () => first.reject(new Error('架空の通信失敗')))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('再試行')
    expect(container.querySelector('textarea')).toBeNull(); expect(button('保存').disabled).toBe(true)
    expect(button('キャンセル').disabled).toBe(false)
    await act(async () => button('再試行').click()); expect(container.querySelector('[role="status"]')).not.toBeNull()
    await settle(retry); expect(container.querySelector('textarea')?.value).toBe('Aの元メモ'); expect(button('保存').disabled).toBe(false)
  })
  it('初期化完了後の連続保存でもonSaveは一回だけ呼ぶ', async () => {
    api.participation.mockResolvedValue(participation); const save = deferred<boolean>(); api.save.mockReturnValue(save.promise)
    await render(); await act(async () => { button('保存').click(); button('保存').click() })
    expect(api.save).toHaveBeenCalledTimes(1); await act(async () => save.resolve(false))
    expect(api.close).not.toHaveBeenCalled()
  })
  it('追加モードのメモ読込中も入力を許さず、読込完了後にメモを引き継ぐ', async () => {
    const memo = deferred<string>(); api.memo.mockReturnValue(memo.promise)
    await render({ mode: 'add', event: null, initialData: { date: '2026-10-22', venue: 'test-store', time_slot: 'morning' } })
    expect(container.querySelector('textarea')).toBeNull(); expect(button('追加').disabled).toBe(true)
    await act(async () => memo.resolve('架空の枠メモ'))
    expect(container.querySelector('textarea')?.value).toBe('架空の枠メモ')
  })
})
