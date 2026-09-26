// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StaffEditForm } from './StaffEditForm'
import { assignmentApi } from '@/lib/assignmentApi'
import type { Staff } from '@/types'
vi.mock('@/lib/assignmentApi', () => ({ assignmentApi: { getAllStaffAssignments: vi.fn() } }))
vi.mock('@/components/ui/multi-select', () => ({ MultiSelect: ({ selectedValues, onSelectionChange, placeholder }: { selectedValues: string[], onSelectionChange: (v: string[]) => void, placeholder: string }) => <button type="button" onClick={() => onSelectionChange([...selectedValues, 'new'])}>{placeholder}</button> }))
const staff = (id: string) => ({ id, name: id, role: [], stores: [], status: 'active', special_scenarios: [] }) as unknown as Staff
const rows = [{ scenario_master_id: 'sub', scenario_id: 'sub', can_main_gm: false, can_sub_gm: true, is_experienced: false }, { scenario_master_id: 'experienced', scenario_id: 'experienced', can_main_gm: false, can_sub_gm: false, is_experienced: true }, { scenario_master_id: 'inactive', scenario_id: 'inactive', can_main_gm: false, can_sub_gm: false, is_experienced: false }]
const save = vi.fn()
let root: Root, container: HTMLDivElement
const render = async (id: string) => { await act(async () => root.render(<StaffEditForm staff={staff(id)} stores={[]} scenarios={[]} onSave={save} onCancel={() => {}} />)) }
const submit = async () => { await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }
const click = async (label: string) => { const button = Array.from(container.querySelectorAll('button')).find(x => x.textContent === label)!; expect(button).toBeTruthy(); await act(async () => button.click()) }
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.resetAllMocks(); save.mockResolvedValue(true); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
it('basic save leaves assignments out; explicit selection preserves sub-only roles and baseline', async () => {
  vi.mocked(assignmentApi.getAllStaffAssignments).mockResolvedValue(rows as never)
  await render('alice'); await submit()
  expect(save.mock.calls[0][0].assignment_edit).toBeUndefined()
  await click('担当シナリオ'); await click('GM可能なシナリオを選択'); await submit()
  expect(save.mock.calls[1][0].assignment_edit).toMatchObject({ baseline: rows.map(({ scenario_id: _id, ...r }) => r), records: [{ scenarioId: 'sub', can_main_gm: false, can_sub_gm: true }, { scenarioId: 'new', can_main_gm: true, can_sub_gm: true }, { scenarioId: 'experienced', is_experienced: true }, { scenarioId: 'inactive', can_main_gm: false, can_sub_gm: false, is_experienced: false }] })
})
it('late responses after staff switching cannot replace the next staff baseline', async () => {
  let resolve!: (value: never) => void
  vi.mocked(assignmentApi.getAllStaffAssignments).mockReturnValueOnce(new Promise(r => { resolve = r })).mockResolvedValueOnce([])
  await render('alice'); await render('bob'); await act(async () => resolve(rows as never))
  await click('担当シナリオ'); await click('GM可能なシナリオを選択'); await submit()
  expect(save.mock.calls[0][0]).toMatchObject({ id: 'bob', assignment_edit: { baseline: [], records: [{ scenarioId: 'new' }] } })
})
it('load failure permits basic save without treating missing assignments as an empty roster', async () => {
  vi.mocked(assignmentApi.getAllStaffAssignments).mockRejectedValue(new Error('offline'))
  await render('alice'); await click('担当シナリオ'); expect(container.textContent).toContain('担当を読み込めませんでした'); await submit()
  expect(save.mock.calls[0][0].assignment_edit).toBeUndefined()
})
it.each([['inactive','利用停止'],['on-leave','休職中'],['resigned','退職']])('保存済み状態%sを表示し正規値で再保存できる',async(status,label)=>{
 vi.mocked(assignmentApi.getAllStaffAssignments).mockResolvedValue([])
 await act(async()=>root.render(<StaffEditForm staff={{...staff('state-fixture'),status:status as Staff['status']}} stores={[]} scenarios={[]} onSave={save} onCancel={()=>{}} />))
 expect(Array.from(container.querySelectorAll('[role="combobox"]')).some(element=>element.textContent===label)).toBe(true)
 await submit()
 expect(save.mock.calls[0][0].status).toBe(status)
})
