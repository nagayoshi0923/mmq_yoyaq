// @vitest-environment jsdom
// シフトの先読み・保存済みの値は、利用者・組織ごとに分ける（Codex 独立レビュー #1212 P2）
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Staff } from '@/types'

const mocks = vi.hoisted(() => ({ scope: 'A', calls: [] as string[] }))
vi.mock('@/lib/shiftApi', () => ({
  shiftApi: {
    getAllStaffShifts: async (y: number, m: number) => {
      const scope = mocks.scope
      mocks.calls.push(`${scope}-${y}-${m}`)
      return [{ staff_id: `${scope}-staff`, date: `${y}-${String(m).padStart(2, '0')}-01`, morning: true }]
    },
  },
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: `user-${mocks.scope}` } }) }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organizationId: `org-${mocks.scope}` }) }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }))

import { shiftKeys, useShiftData } from './useShiftData'

let root: Root
let qc: QueryClient
let latest: ReturnType<typeof useShiftData>
const wait = () => new Promise(r => setTimeout(r, 20))

function Probe({ month, scope }: { month: number; scope: string }) {
  latest = useShiftData(new Date(2026, month - 1, 1), [{ id: `${scope}-staff`, name: scope } as Staff], false)
  return null
}
const show = (month: number, scope: string) =>
  act(async () => root.render(<QueryClientProvider client={qc}><Probe month={month} scope={scope} /></QueryClientProvider>))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.scope = 'A'
  mocks.calls = []
  sessionStorage.clear()
  root = createRoot(document.createElement('div'))
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(async () => {
  await act(async () => root.unmount())
  qc.clear()
})

it('A で先読みした月を、組織 B に替わってから開くと、B のシフトを新しく取る', async () => {
  await show(11, 'A')
  await act(async () => { await wait() })
  expect(latest.shiftData['2026-11-01-morning']?.[0].id).toBe('A-staff')
  expect(mocks.calls).toContain('A-2026-12') // 先読み
  mocks.scope = 'B'
  await show(12, 'B')
  await act(async () => { await wait() })
  expect(mocks.calls).toContain('B-2026-12')
  expect(latest.shiftData['2026-12-01-morning']?.some(s => s.id === 'B-staff')).toBe(true)
})

it('利用者・組織を持たない旧形式の保存（shifts_YYYY_MM）は初期値に使わず、消す', async () => {
  sessionStorage.setItem('shifts_2026_12', JSON.stringify([{ staff_id: 'A-staff', date: '2026-12-01', morning: true }]))
  sessionStorage.setItem('shifts_2026_12_ts', String(Date.now()))
  mocks.scope = 'B'
  await show(12, 'B')
  await act(async () => { await wait() })
  expect(mocks.calls).toContain('B-2026-12')
  expect(latest.shiftData['2026-12-01-morning']?.map(s => s.id)).toEqual(['B-staff'])
  expect(sessionStorage.getItem('shifts_2026_12')).toBeNull()
})

it('同じ利用者・組織なら先読みした月はそのまま使い、取り直さない。保存後の取り直し（shifts の無効化）は効く', async () => {
  await show(11, 'A')
  await act(async () => { await wait() })
  await show(12, 'A')
  await act(async () => { await wait() })
  expect(mocks.calls.filter(c => c === 'A-2026-12')).toHaveLength(1)
  await act(async () => { await qc.invalidateQueries({ queryKey: ['shifts'] }); await wait() })
  expect(mocks.calls.filter(c => c === 'A-2026-12')).toHaveLength(2)
  expect(shiftKeys.month('user-A:org-A', 2026, 12)).toEqual(['shifts', 'user-A:org-A', 2026, 12])
})
