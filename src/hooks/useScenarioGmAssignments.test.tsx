// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScenarioGmAssignments } from './useScenarioGmAssignments'
import { assignmentApi } from '@/lib/assignmentApi'

vi.mock('@/lib/assignmentApi', () => ({ assignmentApi: { getAllScenarioAssignments: vi.fn() } }))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const alice = { staff_id: 'alice', can_main_gm: true, can_sub_gm: false, notes: 'existing' }
const bob = { staff_id: 'bob', can_main_gm: false, can_sub_gm: true }
let root: Root
let result: ReturnType<typeof useScenarioGmAssignments>
function Harness({ id }: { id: string | null }) { result = useScenarioGmAssignments(id); return null }
const render = async (id: string | null) => { await act(async () => { root.render(<Harness id={id} />) }) }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.resetAllMocks()
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()) })

describe('scenario GM editor isolation', () => {
  it('ignores a previous/deleted scenario response arriving after the next scenario', async () => {
    const first = deferred<typeof alice[]>()
    const next = deferred<typeof bob[]>()
    vi.mocked(assignmentApi.getAllScenarioAssignments).mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise)
    await render('deleted-scenario')
    await render('next-scenario')
    expect(result.assignmentsReady).toBe(false)
    expect(() => result.getChanges()).toThrow()
    await act(async () => next.resolve([bob]))
    await act(async () => first.resolve([alice]))
    expect(result.selectedStaffIds).toEqual(['bob'])
    expect(result.assignmentsReady).toBe(true)
    expect(result.getChanges()).toEqual({ removed: [], upserts: [] })
  })

  it('clears previous selections and blocks saves when the next read fails', async () => {
    vi.mocked(assignmentApi.getAllScenarioAssignments).mockResolvedValueOnce([alice]).mockRejectedValueOnce(new Error('offline'))
    await render('first')
    await render('second')
    expect(result.selectedStaffIds).toEqual([])
    expect(result.assignmentsError).toBe(true)
    expect(() => result.getChanges()).toThrow()
  })

  it('does not rewrite unedited GMs when saving unrelated scenario fields', async () => {
    vi.mocked(assignmentApi.getAllScenarioAssignments).mockResolvedValue([alice, bob])
    await render('first')
    expect(result.getChanges()).toEqual({ removed: [], upserts: [] })
    await act(async () => result.setCurrentAssignments(rows => rows.map(a => a.staff_id === 'alice' ? { ...a, can_sub_gm: true } : a)))
    expect(result.getChanges()).toEqual({ removed: [], upserts: [{ ...alice, can_sub_gm: true, is_experienced: false }] })
  })

  it('saves explicit selection changes and preserves untouched GM roles', async () => {
    vi.mocked(assignmentApi.getAllScenarioAssignments).mockResolvedValue([alice, bob])
    await render('first')
    await act(async () => result.setSelectedStaffIds(['bob', 'carol']))
    expect(result.getChanges()).toEqual({ removed: ['alice'], upserts: [{ staff_id: 'carol', can_main_gm: true, can_sub_gm: true, is_experienced: false, notes: null }] })
  })

  it('rejects late failures from an earlier scenario', async () => {
    const first = deferred<typeof alice[]>()
    vi.mocked(assignmentApi.getAllScenarioAssignments).mockReturnValueOnce(first.promise).mockResolvedValueOnce([bob])
    await render('first')
    await render('second')
    await act(async () => first.reject(new Error('late failure')))
    expect(result.assignmentsReady).toBe(true)
    expect(result.selectedStaffIds).toEqual(['bob'])
  })

  it('permits a new scenario with no GMs and ignores the previous response', async () => {
    const first = deferred<typeof alice[]>()
    vi.mocked(assignmentApi.getAllScenarioAssignments).mockReturnValue(first.promise)
    await render('first')
    await render(null)
    await act(async () => first.resolve([alice]))
    expect(result.assignmentsReady).toBe(true)
    expect(result.selectedStaffIds).toEqual([])
  })
})
