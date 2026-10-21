// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useEventModalState } from './useEventModalState'
import type { ScheduleEvent } from '@/types/schedule'

vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }))

const event = { id: 'event-1', date: '2026-10-01', venue: 'store', start_time: '10:00' } as ScheduleEvent
let container: HTMLDivElement
let root: Root
let latest: ReturnType<typeof useEventModalState> | null = null
let search = ''
const handlers: Array<ReturnType<typeof useEventModalState>['handleEditPerformance']> = []

function Probe() {
  latest = useEventModalState({ events: [event] })
  search = useLocation().search
  handlers.push(latest.handleEditPerformance)
  return null
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  root = createRoot(container)
  handlers.length = 0
})
afterEach(() => act(() => root.unmount()))

it('公演を開く・閉じるで URL が変わっても、表に渡す開く処理は同じ関数のまま（表全体を描き直さない）', async () => {
  await act(async () => root.render(<MemoryRouter initialEntries={['/org/schedule']}><Probe /></MemoryRouter>))
  const first = latest!.handleEditPerformance
  await act(async () => latest!.handleEditPerformance(event))
  expect(latest!.isPerformanceModalOpen).toBe(true)
  expect(search).toBe('?event=event-1')
  await act(async () => { await latest!.handleCloseModal() })
  expect(latest!.isPerformanceModalOpen).toBe(false)
  expect(search).toBe('')
  expect(new Set(handlers)).toEqual(new Set([first]))
})
