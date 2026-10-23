// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScenarioCard } from './ScenarioCard'
import { scenarioBrowseCard } from './scenarioCards'

let root: Root
let host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const card = (private_booking_path: string | null) => scenarioBrowseCard(
  { id: 'm1', title: '架空作品', key_visual_url: null, player_count_min: 4, player_count_max: 6, private_booking_path },
  [], '/aaa/scenario/s1',
)

describe('作品カードの「貸切受付中」', () => {
  it('受付中なら、公演予定が無くても「貸切受付中」と日程相談の案内を出し、押すと貸切リクエストのタブへ', async () => {
    const onOpen = vi.fn()
    await act(async () => root.render(<ScenarioCard card={card('/aaa/scenario/s1?tab=private')} onOpen={onOpen} />))
    const badge = host.querySelector('[data-testid="private-booking-badge"]') as HTMLButtonElement
    expect(badge.textContent).toContain('貸切受付中')
    expect(host.textContent).toContain('公演予定なし・貸切の日程はご相談のうえ決まります')
    await act(async () => badge.click())
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0][0].path).toBe('/aaa/scenario/s1?tab=private')
  })

  it('受付していない・判定できないときは何も出さない（公演予定なしを「貸切不可」とも書かない）', async () => {
    await act(async () => root.render(<ScenarioCard card={card(null)} onOpen={() => {}} />))
    expect(host.querySelector('[data-testid="private-booking-badge"]')).toBeNull()
    expect(host.textContent).not.toContain('貸切')
    expect(host.textContent).not.toContain('公演予定なし')
  })
})
