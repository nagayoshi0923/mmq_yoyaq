// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  listByUserId: vi.fn(),
  getCurrentOrganizationId: vi.fn(),
  fetchOrganizationForStaffSession: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: mocks.getUser } } }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock('@/lib/api/settingsReadApi', () => ({ staffSettingsReadApi: { listByUserId: mocks.listByUserId } }))
vi.mock('@/lib/organization', () => ({
  QUEENS_WALTZ_ORG_ID: 'hq',
  getOrganizations: vi.fn(),
  getCurrentOrganizationId: mocks.getCurrentOrganizationId,
  fetchOrganizationForStaffSession: mocks.fetchOrganizationForStaffSession,
}))

import { useOrganization } from './useOrganization'

type Result = ReturnType<typeof useOrganization>

async function loadOrganization(): Promise<Result> {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const current: { value: Result | null } = { value: null }
  function Probe() {
    current.value = useOrganization()
    return null
  }
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  for (let i = 0; i < 10 && current.value?.isLoading; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  }
  await act(async () => root.unmount())
  return current.value!
}

describe('useOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mocks.fetchOrganizationForStaffSession.mockImplementation(async (id: string) => ({ id, name: id }))
  })

  it('マスターが札幌へ切り替えたら、本部のスタッフ行があっても札幌を見ている組織にする', async () => {
    mocks.getCurrentOrganizationId.mockResolvedValue('sapporo')
    mocks.listByUserId.mockResolvedValue({ data: [{ id: 's1', organization_id: 'hq' }], error: null })

    const result = await loadOrganization()
    expect(result.isLoading).toBe(false)

    expect(result.organizationId).toBe('sapporo')
    expect(result.organization?.id).toBe('sapporo')
    expect(result.staff?.id).toBe('s1')
    expect(mocks.fetchOrganizationForStaffSession).toHaveBeenCalledWith('sapporo')
  })

  it('複数の組織にスタッフ登録がある場合は、見ている組織のスタッフ行を使う', async () => {
    mocks.getCurrentOrganizationId.mockResolvedValue('sapporo')
    mocks.listByUserId.mockResolvedValue({
      data: [{ id: 's1', organization_id: 'hq' }, { id: 's2', organization_id: 'sapporo' }],
      error: null,
    })

    const result = await loadOrganization()
    expect(result.isLoading).toBe(false)

    expect(result.staff?.id).toBe('s2')
    expect(result.organizationId).toBe('sapporo')
  })

  it('スタッフ登録がない利用者には組織を出さない', async () => {
    mocks.getCurrentOrganizationId.mockResolvedValue('hq')
    mocks.listByUserId.mockResolvedValue({ data: [], error: null })

    const result = await loadOrganization()
    expect(result.isLoading).toBe(false)

    expect(result.organizationId).toBeNull()
    expect(result.organization).toBeNull()
    expect(mocks.fetchOrganizationForStaffSession).not.toHaveBeenCalled()
  })
})
