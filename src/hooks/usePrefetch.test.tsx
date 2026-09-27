// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrefetch } from './usePrefetch'
import { staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import type { Staff } from '@/types'
vi.mock('@/lib/api', () => ({ staffApi: { getAll: vi.fn() }, scenarioApi: { getAll: vi.fn() }, storeApi: { getAll: vi.fn() } }))
vi.mock('@/lib/assignmentApi', () => ({ assignmentApi: { getBatchStaffAssignments: vi.fn() } }))
vi.mock('./useScheduleEventsQuery', () => ({ scheduleEventKeys: {}, fetchScheduleEventsForMonth: vi.fn() }))
let root: Root
let client: QueryClient
let prefetch: ReturnType<typeof usePrefetch>
function Harness() { prefetch = usePrefetch(); return null }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.resetAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = createRoot(document.createElement('div'))
  vi.mocked(staffApi.getAll).mockResolvedValue([{ id: 'staff', special_scenarios: ['legacy'] }] as Staff[])
  await act(async () => root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>))
})
afterEach(async () => { await act(async () => root.unmount()); client.clear() })
async function load() {
  await act(async () => { await prefetch.prefetchAdminPages(); await new Promise(resolve => setTimeout(resolve, 10)) })
}
describe('staff prefetch canonical assignments', () => {
  it('does not cache an empty assignment list when the first request fails', async () => {
    vi.mocked(assignmentApi.getBatchStaffAssignments).mockRejectedValue(new Error('offline'))
    await load()
    expect(client.getQueryState(['staff'])?.status).toBe('error')
    expect(client.getQueryData(['staff'])).toBeUndefined()
  })
  it('keeps previously confirmed assignments after a refresh failure', async () => {
    const confirmed = [{ id: 'staff', special_scenarios: ['canonical'], gm_scenario_modes: { canonical: 'sub_only' } }]
    client.setQueryData(['staff'], confirmed, { updatedAt: 1 })
    vi.mocked(assignmentApi.getBatchStaffAssignments).mockRejectedValue(new Error('offline'))
    await load()
    expect(client.getQueryData(['staff'])).toEqual(confirmed)
    expect(client.getQueryState(['staff'])?.status).toBe('error')
  })
  it('replaces legacy arrays with canonical main/sub roles on success', async () => {
    vi.mocked(assignmentApi.getBatchStaffAssignments).mockResolvedValue(new Map([['staff', { gmScenarios: ['canonical'], experiencedScenarios: ['played'], gm_scenario_modes: { canonical: 'sub_only' } }]]))
    await load()
    expect(client.getQueryData(['staff'])).toEqual([{ id: 'staff', special_scenarios: ['canonical'], experienced_scenarios: ['played'], gm_scenario_modes: { canonical: 'sub_only' } }])
  })
})
