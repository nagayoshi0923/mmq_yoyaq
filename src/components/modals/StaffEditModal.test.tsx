// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StaffEditModal } from './StaffEditModal'
import { assignmentApi } from '@/lib/assignmentApi'
import type { Staff } from '@/types'
vi.mock('@/lib/assignmentApi', () => ({ assignmentApi: { getAllStaffAssignments: vi.fn() } }))
vi.mock('@/utils/toast', () => ({ showToast: { error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
let root: Root
let container: HTMLDivElement
const save = vi.fn()
const close = vi.fn()
const staff = (id: string) => ({ id, name: id, role: ['gm'], stores: [], status: 'active', special_scenarios: [], email: '', phone: '', notes: '' }) as unknown as Staff
const row = (id: string) => ({ scenario_master_id: id, scenario_id: id, can_main_gm: false, can_sub_gm: true, is_experienced: false })
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
const render = async (id: string, open = true) => { await act(async () => root.render(<StaffEditModal staff={staff(id)} isOpen={open} onSave={save} onClose={close} stores={[]} scenarios={[]} />)) }
const click = async (label: string) => { const button = Array.from(container.querySelectorAll('button')).find(x => x.textContent === label)!; expect(button).toBeTruthy(); await act(async () => button.click()) }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.resetAllMocks(); save.mockResolvedValue(true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
it('ignores an old staff response after another staff editor is opened', async () => {
  const old = deferred<ReturnType<typeof row>[]>()
  vi.mocked(assignmentApi.getAllStaffAssignments).mockReturnValueOnce(old.promise).mockResolvedValueOnce([row('scenario-b')])
  await render('alice'); await render('bob'); await act(async () => old.resolve([row('scenario-a')]))
  await click('保存')
  expect(save.mock.calls[0][0]).toMatchObject({ id: 'bob', special_scenarios: ['scenario-b'] })
  expect(save.mock.calls[0][0].assignment_edit).toBeUndefined()
})
it('isolates repeated opening of the same staff and does not restore a late response', async () => {
  const old = deferred<ReturnType<typeof row>[]>()
  vi.mocked(assignmentApi.getAllStaffAssignments).mockReturnValueOnce(old.promise).mockResolvedValueOnce([row('new')])
  await render('alice'); await render('alice', false); await render('alice'); await act(async () => old.resolve([row('old')]))
  await click('保存')
  expect(save.mock.calls[0][0].special_scenarios).toEqual(['new'])
})
it('saves only basic information after assignment loading fails', async () => {
  vi.mocked(assignmentApi.getAllStaffAssignments).mockRejectedValue(new Error('offline'))
  await render('alice'); await click('保存')
  expect(save.mock.calls[0][0].assignment_edit).toBeUndefined()
})
it('keeps the editor open when assignment decrease confirmation or an error blocks saving', async () => {
  vi.mocked(assignmentApi.getAllStaffAssignments).mockResolvedValue([row('a')]); save.mockResolvedValue(false)
  await render('alice'); await click('保存して閉じる')
  expect(close).not.toHaveBeenCalled()
})
