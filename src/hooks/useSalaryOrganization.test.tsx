// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ userId: 'admin-a' as string | null, org: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.userId ? { id: mock.userId, role: 'admin' } : null, loading: false }) }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: mock.org }))
import { useSalaryOrganization } from './useSalaryOrganization'

let root: Root
let client: QueryClient
let result: ReturnType<typeof useSalaryOrganization>
function Harness() { result = useSalaryOrganization(); return null }
async function render() {
  await act(async () => { root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>) })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mock.userId = 'admin-a'
  mock.org.mockReset().mockResolvedValue('org-a')
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()); client.clear() })
it('スタッフ行を追加要求せず、既存の組織解決結果を使う', async () => {
  await render()
  expect(result.organizationId).toBe('org-a')
  expect(result.error).toBeNull()
})
it('アカウント切替時に別ユーザーの組織キャッシュを使わず、ログアウト後も残さない', async () => {
  await render()
  mock.userId = 'admin-b'
  mock.org.mockResolvedValue('org-b')
  await render()
  expect(result.organizationId).toBe('org-b')
  expect(mock.org).toHaveBeenCalledTimes(2)
  mock.userId = null
  await render()
  expect(result.organizationId).toBeNull()
  expect(mock.org).toHaveBeenCalledTimes(2)
})
