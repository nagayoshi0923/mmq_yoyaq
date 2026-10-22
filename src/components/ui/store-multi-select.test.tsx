// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// Radix Popover は jsdom で開閉が進まないため、中身を常に出す素の部品に置き換える（選択と表示の連動だけを見る）
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div data-testid="popover-content">{children}</div>,
}))
import { StoreMultiSelect } from './store-multi-select'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const longName = 'とても長い店舗名のマーダーミステリー専門店・駅前本館の二階にある貸切ルーム'
const stores = [
  { id: 's1', name: '大塚店', short_name: '大塚', region: '東京都' },
  { id: 's2', name: '馬場店', short_name: '馬場', region: '東京都' },
  { id: 's3', name: longName, region: '北海道' },
]

function Harness({ initial, display }: { initial: string[]; display?: 'trigger' | 'badges' }) {
  const [ids, setIds] = useState(initial)
  return <StoreMultiSelect stores={stores} selectedStoreIds={ids} onStoreIdsChange={setIds} placeholder="店舗を選択してください" selectedDisplay={display} />
}

const badgeNames = () => [...host.querySelectorAll('[data-testid="selected-store-badges"] li')].map(li => li.textContent)
const trigger = () => host.querySelector('button')!

it('badges: 選択済み店舗はボタンにまとめず、直下に 1 店舗ずつバッジで出し、× で解除できる', async () => {
  await act(async () => root.render(<Harness initial={['s1', 's3']} display="badges" />))
  expect(trigger().textContent).toBe('2店舗を選択中')
  expect(trigger().textContent).not.toContain('大塚')
  expect(badgeNames()).toEqual(['大塚店', longName])
  const list = host.querySelector('[data-testid="selected-store-badges"]')!
  expect(list.className).toContain('flex-wrap')
  expect(host.querySelector(`[aria-label="${longName}を解除"]`)).not.toBeNull()
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="大塚店を解除"]')!.click())
  expect(badgeNames()).toEqual([longName])
  expect(trigger().textContent).toBe('1店舗を選択中')
  await act(async () => host.querySelector<HTMLButtonElement>(`[aria-label="${longName}を解除"]`)!.click())
  expect(host.querySelector('[data-testid="selected-store-badges"]')).toBeNull()
  expect(trigger().textContent).toBe('店舗を選択してください')
})

it('badges: プルダウンで追加・解除するとバッジにすぐ反映する', async () => {
  await act(async () => root.render(<Harness initial={[]} display="badges" />))
  const option = (name: string) => [...host.querySelectorAll('[data-testid="popover-content"] button')].find(b => b.textContent?.trim().endsWith(name)) as HTMLButtonElement
  await act(async () => option('馬場店').click())
  expect(badgeNames()).toEqual(['馬場店'])
  await act(async () => option('大塚店').click())
  expect(badgeNames()).toEqual(['大塚店', '馬場店'])
  await act(async () => option('馬場店').click())
  expect(badgeNames()).toEqual(['大塚店'])
})

it('既定（trigger）は従来どおりボタンに店舗名を並べ、バッジは出さない', async () => {
  await act(async () => root.render(<Harness initial={['s1', 's2']} />))
  expect(trigger().textContent).toBe('大塚, 馬場')
  expect(host.querySelector('[data-testid="selected-store-badges"]')).toBeNull()
})
