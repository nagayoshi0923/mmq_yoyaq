// @vitest-environment jsdom
/**
 * 受付範囲を読めないとき、既定の 180 日で選ばせない（Codex 点検 不具合 5）。
 * 組織が 90 日などのとき、画面だけ 180 日で選べて保存で拒否されるのを防ぐ。
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ horizon: vi.fn() }))
vi.mock('@/lib/api/scheduleHookReadApi', () => ({ privateBookingSlotReadApi: { getEffectiveHorizonDays: api.horizon } }))
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } }))

import { addYmdDays, isBeyondPrivateBookingHorizon, PRIVATE_BOOKING_HORIZON_QUERY_KEY, usePrivateBookingHorizonDays, type PrivateBookingHorizonState } from './privateBookingHorizon'
import { PrivateBookingHorizonNotice } from '@/components/private-booking/PrivateBookingHorizonNotice'
import { toJstYmd } from '@/utils/jstDate'

const today = toJstYmd(new Date())
const day30 = addYmdDays(today, 30)
const day120 = addYmdDays(today, 120)
let state: PrivateBookingHorizonState
let root: Root
let host: HTMLElement
let client: QueryClient
function Probe({ organizationId = 'org' }: { organizationId?: string | null }) {
  state = usePrivateBookingHorizonDays({ organizationId, scenarioId: 'sc' })
  return <PrivateBookingHorizonNotice horizon={state} />
}
const settle = async () => { await act(async () => { await new Promise(r => setTimeout(r, 10)) }) }
async function mount(organizationId: string | null = 'org') {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement('div')
  root = createRoot(host)
  await act(async () => root.render(<QueryClientProvider client={client}><Probe organizationId={organizationId} /></QueryClientProvider>))
  await settle()
}
const selectable = (ymd: string) => !isBeyondPrivateBookingHorizon(ymd, state.days)
beforeEach(() => { api.horizon.mockReset(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterEach(async () => { await act(async () => root.unmount()); client.clear() })

it('読み込み中は「受付範囲を確認しています」で、どの日も選べない', async () => {
  api.horizon.mockReturnValue(new Promise(() => {}))
  await mount()
  expect(state).toMatchObject({ days: null, loading: true, failed: false })
  expect(selectable(day30)).toBe(false)
  expect(host.querySelector('[data-testid="private-booking-horizon-checking"]')!.textContent).toContain('受付範囲を確認しています')
})

it('読めなかったときは 180 日の枠を選べる状態にせず、再試行で読めたら設定どおり選べる', async () => {
  api.horizon.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch', code: '' } })
  await mount()
  expect(state).toMatchObject({ days: null, loading: false, failed: true })
  expect(selectable(day30)).toBe(false)
  expect(selectable(day120)).toBe(false)
  expect(host.querySelector('[data-testid="private-booking-horizon-failed"]')).not.toBeNull()

  api.horizon.mockResolvedValueOnce({ data: 90, error: null })
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="private-booking-horizon-retry"]')!.click() })
  await settle()
  expect(state).toMatchObject({ days: 90, loading: false, failed: false })
  expect(selectable(day30)).toBe(true)
  expect(selectable(day120)).toBe(false)
  expect(host.textContent).toBe('')
})

it('読めたが設定が無いときだけ既定の 180 日', async () => {
  api.horizon.mockResolvedValueOnce({ data: null, error: null })
  await mount()
  expect(state.days).toBe(180)
  expect(selectable(day120)).toBe(true)
})

it('読み直しに失敗しても、同じセッションで最後に読めた値を使い続ける（180 日に戻さない）', async () => {
  api.horizon.mockResolvedValueOnce({ data: 90, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'Bad Gateway', code: '' } })
  await mount()
  expect(state.days).toBe(90)
  await act(async () => { await client.invalidateQueries({ queryKey: [PRIVATE_BOOKING_HORIZON_QUERY_KEY] }) })
  await settle()
  expect(api.horizon).toHaveBeenCalledTimes(2)
  expect(state).toMatchObject({ days: 90, failed: false })
  expect(selectable(day120)).toBe(false)
})
