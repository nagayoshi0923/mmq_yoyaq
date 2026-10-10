// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { PriceSection, priceNote } from './PriceSection'

it('補助文: 参加人数分・最低人数に満たなければ不成立。候補日で変わる注記は先頭', () => {
  expect(priceNote(false, 4)).toBe('税込。当日、店舗で現金またはカードでお支払いください。料金は参加人数分です。参加人数が最低人数（4名）に満たない場合は公演不成立となります。')
  expect(priceNote(true, 4).startsWith('候補日（平日・土日祝など）によって変わります。')).toBe(true)
  expect(priceNote(false, 4)).not.toContain('定員')
})

it('合計はいまの参加人数で出し、最低人数未満なら「あと ○ 名で成立」を添える', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'), root = createRoot(host)
  const price = { perPersonMin: 4500, perPersonMax: 4500, people: 4, totalMin: 18000, totalMax: 18000 }
  await act(async () => root.render(<PriceSection price={price} phase="pre_request" minPlayers={6} />))
  expect(host.textContent).toContain('いまの参加人数 4 名の合計¥18,000')
  expect(host.querySelector('[data-testid="overview-price-short"]')?.textContent).toBe('あと 2 名で成立')
  await act(async () => root.render(<PriceSection price={{ ...price, people: 6, totalMin: 27000, totalMax: 27000 }} phase="pre_request" minPlayers={6} />))
  expect(host.querySelector('[data-testid="overview-price-short"]')).toBeNull()
  await act(async () => root.unmount())
})
