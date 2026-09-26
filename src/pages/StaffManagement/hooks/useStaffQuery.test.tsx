// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStaffMutation, useStaffQuery } from './useStaffQuery'
import { staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import type { StaffEditData } from '@/lib/staffAssignmentEdit'
vi.mock('@/lib/api', () => ({ staffApi: { update: vi.fn(), create: vi.fn(), getAll: vi.fn() } }))
vi.mock('@/lib/assignmentApi', () => ({ assignmentApi: { updateStaffAssignments: vi.fn(), getBatchStaffAssignments: vi.fn() } }))
let root: Root
let client: QueryClient
let mutation: ReturnType<typeof useStaffMutation>
let query: ReturnType<typeof useStaffQuery>
const staff = { id: 'alice', name: 'Alice', special_scenarios: ['main', 'sub'], gm_scenario_modes: { main: 'main_only', sub: 'sub_only' } } as unknown as StaffEditData
function Harness() { mutation = useStaffMutation(); return null }
function QueryHarness() { query = useStaffQuery(); return null }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.resetAllMocks()
  vi.mocked(staffApi.update).mockResolvedValue(staff)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>))
})
afterEach(async () => { await act(async () => root.unmount()); client.clear() })
describe('staff editor assignment preservation', () => {
  it('does not rewrite assignments or derived modes when basic staff information is saved', async () => {
    await act(async () => { await mutation.mutateAsync({ staff, isEdit: true }) })
    expect(assignmentApi.updateStaffAssignments).not.toHaveBeenCalled()
    expect(staffApi.update).toHaveBeenCalledWith('alice', { id: 'alice', name: 'Alice' })
  })
  it('passes explicit roles and the loaded baseline without changing main-only or sub-only to both', async () => {
    const records = [
      { scenarioId: 'main', can_main_gm: true, can_sub_gm: false, is_experienced: false },
      { scenarioId: 'sub', can_main_gm: false, can_sub_gm: true, is_experienced: false },
    ]
    const baseline = records.map(({ scenarioId, ...flags }) => ({ scenario_master_id: scenarioId, ...flags }))
    const edit = { ...staff, assignment_edit: { records, baseline } }
    await act(async () => { await mutation.mutateAsync({ staff: edit, isEdit: true }) })
    expect(assignmentApi.updateStaffAssignments).toHaveBeenCalledWith('alice', records, undefined, { confirmClear: false, expectedAssignments: baseline })
    expect(staffApi.update).toHaveBeenCalledWith('alice', { id: 'alice', name: 'Alice' })
  })
  it('retains the baseline on confirmed removal and does not update the profile after a failed assignment write', async () => {
    vi.mocked(assignmentApi.updateStaffAssignments).mockRejectedValue(new Error('changed elsewhere'))
    const edit = { ...staff, assignment_edit: { records: [], baseline: [{ scenario_master_id: 'main', can_main_gm: true, can_sub_gm: false, is_experienced: false }] } }
    await act(async () => { await expect(mutation.mutateAsync({ staff: edit, isEdit: true, confirmDecrease: true })).rejects.toThrow('changed elsewhere') })
    expect(staffApi.update).not.toHaveBeenCalled()
    expect(assignmentApi.updateStaffAssignments).toHaveBeenCalledWith('alice', [], undefined, { confirmClear: true, expectedAssignments: edit.assignment_edit.baseline })
  })
  it('does not turn assignment loading failures into a successful empty roster', async () => {
    vi.mocked(staffApi.getAll).mockResolvedValue([staff])
    vi.mocked(assignmentApi.getBatchStaffAssignments).mockRejectedValue(new Error('offline'))
    await act(async () => root.render(<QueryClientProvider client={client}><QueryHarness /></QueryClientProvider>))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    expect(query.isError).toBe(true)
    expect(query.data).toBeUndefined()
  })
})
