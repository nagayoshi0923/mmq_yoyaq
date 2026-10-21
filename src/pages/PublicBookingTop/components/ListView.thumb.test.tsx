// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ListView } from './ListView'
import type { EnrichedPublicEvent, PublicStoreRow } from '../hooks/useBookingData'

vi.mock('../hooks/usePublicPrivateBookingSlots', () => ({ usePublicPrivateBookingSlots: () => () => [] }))
vi.mock('./BookingFilters', () => ({ BookingFilters: () => null }))
vi.mock('../hooks/useBookingData', () => ({ scenarioCardId: () => '', scenarioCardTitle: () => '' }))

const store = { id: 's1', name: '試験店', color: 'blue' } as PublicStoreRow
// 残席表示が折り返してカードが高くなる公演（定員5・予約4 → 開催決定＋残少）
const event = {
  id: 'e1', date: '2030-01-02', start_time: '18:30:00', scenario: '試験KV・縦長の館', scenario_id: 'x', scenario_master_id: 'm1',
  category: 'open', current_participants: 4, player_count_max: 5, key_visual_url: 'https://example.invalid/kv-1450x2048.jpg',
} as unknown as EnrichedPublicEvent

function renderThumb(): Element {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ListView, {
    organizationId: 'org', storeOptions: [], primaryColor: '#000', listViewMonth: new Date(2030, 0, 1), onMonthChange: () => {},
    selectedStoreIds: [], onStoreIdsChange: () => {}, stores: [store], listViewData: [{ date: 2, store }],
    getEventsForDateStore: () => [event], getColorFromName: () => '#3366cc', scenarios: [], onCardClick: () => {},
  })))
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const thumbs = doc.querySelectorAll('[data-testid="list-event-thumb"]')
  expect(thumbs).toHaveLength(1)
  return thumbs[0]
}

describe('リストの公演カードの作品画像の枠', () => {
  it('作品画像と同じ 3:4 の固定枠で、カードの高さに引き伸ばさない', () => {
    const cls = renderThumb().className.split(/\s+/)
    expect(cls).toEqual(expect.arrayContaining(['aspect-[3/4]', 'self-start', 'w-8', 'sm:w-[46px]', 'flex-shrink-0', 'overflow-hidden']))
    expect(cls).not.toContain('self-stretch')
    expect(cls.some((c) => /^(sm:)?h-/.test(c))).toBe(false)
  })

  it('画像は枠いっぱいに表示し、縦長は中央基準で切り抜く', () => {
    const img = renderThumb().querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.invalid/kv-1450x2048.jpg')
    expect(img?.getAttribute('alt')).toBe('試験KV・縦長の館')
    expect(img?.className).toContain('object-center')
    expect(img?.className).toContain('object-cover')
  })
})
