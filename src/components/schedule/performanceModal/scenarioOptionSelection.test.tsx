// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { buildScenarioSelectOptions } from './scenarioSelectOptions'
import type { Scenario } from '@/types'
import type { ScheduleEvent } from '@/types/schedule'
import { toJstYmd } from '@/utils/jstDate'
vi.mock('@/components/ui/popover', () => ({ Popover: ({ children }: { children: ReactNode }) => <>{children}</>, PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>, PopoverContent: ({ children }: { children: ReactNode }) => <div data-options>{children}</div> }))
const recent = toJstYmd(new Date())
const rows = [{ id: 'old', title: '既存作品', created_at: '2020-01-01', organization_id: 'org', play_count: 99 }, { id: 'new', title: '新作作品', release_date: recent, organization_id: 'org', play_count: 1 }] as Scenario[]
const events = [{ id: '1', date: '2026-11-20', store_id: 'a', scenario_master_id: 'new', category: 'private' }, { id: '2', date: '2026-12-01', store_id: 'b', scenario_master_id: 'new', category: 'open' }] as ScheduleEvent[]
function Harness({ initialValue = '' }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue)
  const [month, setMonth] = useState('2026-11')
  const [store, setStore] = useState<string[]>([])
  const options = buildScenarioSelectOptions(rows, '', [], [], { organizationId: 'org', month, organizationStoreIds: ['a', 'b'], selectedStoreIds: store, storeLabel: '全店舗', ready: true, events }, value)
  return <><button onClick={() => setMonth('2026-12')}>次月</button><button onClick={() => setStore(['a'])}>A店</button><SearchableSelect options={options} value={value} onValueChange={setValue} /><output>{value}</output></>
}
let host: HTMLDivElement, root: Root
beforeEach(async () => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(async () => root.render(<Harness />)) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
const click = async (el: Element) => act(async () => (el as HTMLElement).click())
const option = (text: string) => [...host.querySelectorAll('.scrollable-list > div')].find((el) => el.textContent?.includes(text))!
it('無選択のまま新作を先頭表示し、検索と選択で件数を増やさない', async () => {
  expect(host.querySelector('output')?.textContent).toBe('')
  expect(host.querySelector('.scrollable-list')?.textContent).toMatch(/2 新作.*新作作品.*貸切 1件／オープン 0件.*3 その他.*既存作品/s)
  const input = host.querySelector('input')!
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '新作'); input.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(host.querySelector('.scrollable-list')?.textContent).not.toContain('既存作品')
  await click(option('新作作品'))
  expect(host.querySelector('output')?.textContent).toBe('新作作品')
  expect(option('新作作品').textContent).toContain('貸切 1件／オープン 0件')
})
it('表示月と店舗の切替で件数を更新しても選択作品は変更しない', async () => {
  await click(option('新作作品'))
  await click([...host.querySelectorAll('button')].find((b) => b.textContent === '次月')!)
  expect(option('新作作品').textContent).toContain('貸切 0件／オープン 1件')
  await click([...host.querySelectorAll('button')].find((b) => b.textContent === 'A店')!)
  expect(option('新作作品').textContent).toContain('貸切 0件／オープン 0件')
  expect(host.querySelector('output')?.textContent).toBe('新作作品')
})
it('編集相当の選択済み作品を先頭表示し、検索不一致では混ぜず、解除で先頭へ戻す', async () => {
  await act(async () => root.render(<Harness key="selected" initialValue="既存作品" />))
  expect(host.querySelector('.scrollable-list')?.textContent).toMatch(/^選択中既存作品貸切 0件／オープン 0件2 新作/s)
  const input = host.querySelector('input')!
  const search = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
  await search('新作')
  expect(host.querySelector('.scrollable-list')?.textContent).not.toContain('既存作品')
  expect(host.querySelector('output')?.textContent).toBe('既存作品')
  await search('')
  expect(host.querySelector('.scrollable-list')?.textContent).toMatch(/^選択中既存作品/)
  expect(events).toHaveLength(2)
})
