// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchTerms = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/publicCancellationPolicy', () => ({ fetchPublicCancellationTerms: (...args: unknown[]) => fetchTerms(...args) }))

import {
  cancellationTermsGate,
  useBookingCancellationTerms,
  type BookingCancellationTerms,
  type BookingCancellationTermsState,
} from './useBookingCancellationTerms'

const terms = (inside: boolean): BookingCancellationTerms => ({
  summary: 's', freeDeadlineLabel: 'd', freeHoursLabel: '48時間前', insideNoFreeCancelWindow: inside, changeDeadlineLabel: null,
})

describe('cancellationTermsGate（予約を確定できるか・公開前検証 P1）', () => {
  it('読込中は確定不可', () => {
    const gate = cancellationTermsGate('loading', null, false)
    expect(gate.canSubmit).toBe(false)
    expect(gate.message).toBe('キャンセル規定を読み込んでいます…')
  })
  it('取得失敗・既定値は確定不可（同意済みでも不可）', () => {
    for (const status of ['error', 'fallback'] as const) {
      const gate = cancellationTermsGate(status, terms(false), true)
      expect(gate.canSubmit).toBe(false)
      expect(gate.message).toBe('店舗のキャンセル規定を取得できませんでした。再読み込みしてください')
    }
  })
  it('ready で 48 時間以内は同意必須、同意後は確定可', () => {
    expect(cancellationTermsGate('ready', terms(true), false)).toMatchObject({ canSubmit: false, needsLateCancelAgreement: true })
    expect(cancellationTermsGate('ready', terms(true), true)).toMatchObject({ canSubmit: true, needsLateCancelAgreement: false })
  })
  it('ready で期限前は同意なしで確定可', () => {
    expect(cancellationTermsGate('ready', terms(false), false)).toMatchObject({ canSubmit: true, message: null })
  })
})

describe('useBookingCancellationTerms の状態', () => {
  let root: Root
  let host: HTMLDivElement
  let latest: BookingCancellationTermsState | null = null
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    fetchTerms.mockReset(); latest = null
  })
  afterEach(() => { act(() => root.unmount()); host.remove() })

  function Probe() {
    latest = useBookingCancellationTerms({ organizationSlug: 'org', storeId: 's', eventId: 'e', eventDate: '2099-01-10', startTime: '19:00' })
    return null
  }
  const render = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
    act(() => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  }
  const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }

  it('取得前は loading', () => {
    fetchTerms.mockReturnValue(new Promise(() => {}))
    render()
    expect(latest?.status).toBe('loading')
    expect(latest?.terms).toBeNull()
  })
  it('既定値（isFallback）は fallback で値を渡さない', async () => {
    fetchTerms.mockResolvedValue({ deadlineHours: 48, fees: [], changeDeadlineHours: null, isFallback: true })
    render(); await flush()
    expect(latest?.status).toBe('fallback')
    expect(latest?.terms).toBeNull()
  })
  it('取得失敗は error、再取得で ready になる', async () => {
    fetchTerms.mockRejectedValue(new Error('x'))
    render(); await flush()
    expect(latest?.status).toBe('error')
    fetchTerms.mockReset()
    fetchTerms.mockResolvedValue({ deadlineHours: 72, fees: [{ hours_before: 72, fee_percentage: 50 }], changeDeadlineHours: 24, isFallback: false })
    act(() => latest?.retry()); await flush()
    expect(latest?.status).toBe('ready')
    expect(latest?.terms?.insideNoFreeCancelWindow).toBe(false)
  })
})
