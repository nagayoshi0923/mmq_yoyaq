// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ org: 'a' as string | null, fetch: vi.fn(), refetchOrg: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mock.org || 'unresolved-admin', role: 'admin' }, loading: false }) }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: () => mock.refetchOrg() }))
vi.mock('@/lib/api/customerApi', () => ({ customerApi: { listWithStats: mock.fetch } }))
vi.mock('@/lib/queryInvalidation', () => ({ invalidateEverywhere: (client: QueryClient, key: readonly string[]) => client.invalidateQueries({ queryKey: key }) }))
import { useCustomerData } from './useCustomerData'
const rows = (id: string) => ({ customers: [{ id, name: id }], totalCount: 1 })
let root: Root
let client: QueryClient
let state: ReturnType<typeof useCustomerData>
function Probe() { state = useCustomerData(); return null }
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
async function setup() {
 Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
 client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
 root = createRoot(document.createElement('div'))
 await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
 await settle()
 return { result: { get current() { return state } }, rerender: async () => { await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)) } }
}
afterEach(async () => { await act(async () => root?.unmount()); client?.clear() })
async function waitFor(check: () => void) { await settle(); check() }
beforeEach(() => { mock.org = 'a'; mock.fetch.mockReset(); mock.refetchOrg.mockReset().mockImplementation(async () => mock.org) })
it('does not show the previous organization while the next request is pending', async () => {
 let resolve!: (value: ReturnType<typeof rows>) => void
 mock.fetch.mockResolvedValueOnce(rows('a')).mockImplementationOnce(() => new Promise(r => { resolve = r }))
 const { result, rerender } = await setup()
 await waitFor(() => expect(result.current.customers[0]?.id).toBe('a'))
 mock.org = 'b'; await rerender(); await settle()
 expect(result.current.customers).toEqual([])
 await act(async () => resolve(rows('b')))
 await waitFor(() => expect(result.current.customers[0]?.id).toBe('b'))
})
it('does not fetch or retain rows without an organization', async () => {
 mock.org = null
 const { result } = await setup()
 expect(mock.fetch).not.toHaveBeenCalled()
 expect(result.current.customers).toEqual([])
 expect(result.current.error).toBeTruthy()
})
it('hides stale rows on refetch failure and supports retry', async () => {
 mock.fetch.mockResolvedValueOnce(rows('a')).mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(rows('a'))
 const { result } = await setup()
 await waitFor(() => expect(result.current.customers).toHaveLength(1))
 await act(async () => { await result.current.refreshCustomers() })
 await waitFor(() => expect(result.current.error).toBeTruthy())
 expect(result.current.customers).toEqual([])
 await act(async () => { await result.current.refreshCustomers() })
 await waitFor(() => expect(result.current.customers).toHaveLength(1))
 expect(result.current.error).toBeNull()
})

it('retries organization loading before querying customers', async () => {
 mock.org = null
 mock.refetchOrg.mockResolvedValueOnce(null).mockResolvedValue('a')
 mock.fetch.mockResolvedValue(rows('a'))
 const { result, rerender } = await setup()
 await act(async () => { await result.current.refreshCustomers() })
 expect(mock.refetchOrg).toHaveBeenCalledTimes(2)
 await rerender()
 await waitFor(() => expect(result.current.customers[0]?.id).toBe('a'))
})
