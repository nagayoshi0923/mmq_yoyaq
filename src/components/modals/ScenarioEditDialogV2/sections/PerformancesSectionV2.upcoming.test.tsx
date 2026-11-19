// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({ storeApi: { getAll: async () => [] } }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }))
import { PerformancesSectionV2 } from './PerformancesSectionV2'

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove() })

const upcoming = (over: Record<string, unknown>) => ({
  date: '2099-01-10', category: 'open', startTime: '19:00:00', storeId: null,
  reservedParticipants: 3, staffParticipants: 0, reservationCount: 2, maxParticipants: 6, ...over,
})

const past = { date: '2026-01-10', category: 'open', participants: 5, demoParticipants: 0, staffParticipants: 0, revenue: 0, startTime: '14:00:00', storeId: null, isCancelled: false }

describe('PerformancesSectionV2 これからの公演', () => {
  it('公演回数とは別にこれからの公演の回数と予約数を出し、一覧に予約人数／定員を出す', async () => {
    await act(async () => {
      root.render(<PerformancesSectionV2 performanceDates={[past]} participationCosts={[]} futurePerformanceCount={2}
        upcomingPerformances={[upcoming({}), upcoming({ date: '2099-01-11', reservedParticipants: 6 })]} />)
    })
    const text = container.textContent ?? ''
    expect(text).toContain('公演回数（今日まで）:')
    expect(text).toContain('これからの公演:2回（予約9名）')
    expect(text).toContain('予約3/6名')
    expect(text).toContain('予約6/6名（満席）')
  })
  it('実績が無い作品でも、これからの公演の欄は出す', async () => {
    await act(async () => {
      root.render(<PerformancesSectionV2 performanceDates={[]} participationCosts={[]} upcomingPerformances={[upcoming({})]} />)
    })
    expect(container.textContent).toContain('公演実績がありません')
    expect(container.textContent).toContain('予約3/6名')
  })
  it('先の公演が無いときも欄を出して、まだ無いことを書く', async () => {
    await act(async () => {
      root.render(<PerformancesSectionV2 performanceDates={[]} participationCosts={[]} upcomingPerformances={[]} />)
    })
    expect(container.textContent).toContain('明日以降の公演はまだ入っていません')
  })
})
