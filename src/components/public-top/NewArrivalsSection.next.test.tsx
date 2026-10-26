// @vitest-environment jsdom
// 点検 R1247-B: 新作のカードの次回公演を読めなかったときは「公演予定未定」ではなく、読めなかったことと再読み込みを出す
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewArrivalsSection } from './NewArrivalsSection'
import { nextEventsNote } from './newArrivalNextNote'
import type { ScenarioCardData } from './scenarioCards'

const card = { key: 'k', scenario_id: 's1', title: '架空の作品', key_visual_url: null, author: '', player_count_min: 4, player_count_max: 6, duration_minutes: 120, fee: 3000, events: [], total_events_count: 0, is_recommended: false, favorite_count: 0, release_date: null, path: '/x', private_booking_path: '/x?tab=private' } as ScenarioCardData
let root: ReturnType<typeof createRoot>, host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()) })
const render = (state: 'loading' | 'error' | 'ready', retry = vi.fn(), c = card) => act(async () => root.render(
  <MemoryRouter><NewArrivalsSection items={[{ card: c, date: { kind: 'release', date: '2026-10-20' }, ...nextEventsNote(c, state, retry) }]} lead="" allPath="/" onOpen={vi.fn()} /></MemoryRouter>,
))

describe('新作のカードの次回公演の欄', () => {
  it('読めなかったら「公演予定未定」を出さず、読めなかったことと再読み込み。押すと取り直す', async () => {
    const retry = vi.fn()
    await render('error', retry)
    expect(host.textContent).toContain('公演日を読み込めませんでした')
    expect(host.textContent).not.toContain('公演予定未定')
    await act(async () => (host.querySelector('[data-testid="new-arrival-next-error"] button') as HTMLButtonElement).click())
    expect(retry).toHaveBeenCalledTimes(1)
  })
  it('読み込み中は「公演日を確認中…」', async () => {
    await render('loading')
    expect(host.textContent).toContain('公演日を確認中')
    expect(host.textContent).not.toContain('公演予定未定')
  })
  it('読めて 0 件なら従来どおり「公演予定未定」', async () => {
    await render('ready')
    expect(host.textContent).toContain('公演予定未定')
  })
})
