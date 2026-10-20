// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'

const profile = vi.hoisted(() => ({ current: { name: '試験 一子', nickname: 'いちこ', email: 'ichi@x', phone: '09000000011' } as Record<string, string> }))
vi.mock('@/lib/api/bookingConfirmationReadApi', () => ({
  bookingConfirmationReadApi: {
    findCustomerProfileByUserId: async () => ({ data: { ...profile.current }, error: null }),
    findCustomerProfileByEmail: async () => ({ data: null, error: null }),
  },
}))

import { useCustomerData } from './useCustomerData'

it('読み直しで登録情報が変わっても、利用者が入力した電話番号・名前は上書きしない（最初に読めたときだけ入れる）', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let result!: ReturnType<typeof useCustomerData>
  function Harness() { result = useCustomerData({ userId: 'u1', userEmail: 'ichi@x' }); return null }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const root = createRoot(document.createElement('div'))
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>))
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect([result.customerName, result.customerPhone]).toEqual(['試験 一子', '09000000011'])
    await act(async () => { result.setCustomerPhone('08011112222'); result.setCustomerNickname('') })
    profile.current = { name: '試験 一子（更新）', nickname: 'いち', email: 'ichi@x', phone: '09099998888' }
    await act(async () => { await client.refetchQueries() })
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(client.getQueryData(['booking-customer-data', 'u1', 'ichi@x'])).toMatchObject({ phone: '09099998888' })
    expect(result.customerPhone).toBe('08011112222')
    expect(result.customerName).toBe('試験 一子')
    expect(result.customerNickname).toBe('')
  } finally { await act(async () => root.unmount()) }
})
