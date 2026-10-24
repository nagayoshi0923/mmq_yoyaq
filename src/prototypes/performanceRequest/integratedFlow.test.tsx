// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const touches: string[] = []
vi.mock('@/lib/supabase', () => {
  const handler: ProxyHandler<object> = { get: (_t, p) => { touches.push(String(p)); return new Proxy(() => {}, handler) }, apply: () => { touches.push('call'); return new Proxy(() => {}, handler) } }
  return { supabase: new Proxy(() => {}, handler) }
})
vi.mock('@/components/ui/popover', () => ({ Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>, PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>, PopoverContent: ({ children }: { children: ReactNode }) => <div data-preview-popover>{children}</div> }))
import Prototype from './index'
import { CustomerScenarioPage } from './CustomerScenarioPage'
import { submitRequest } from './actions'
import { readProtoState } from './storage'
import { __resetPrototypeBusyForTest } from './busy'
let host: HTMLDivElement, root: Root
const fetchSpy = vi.fn()
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('fetch', fetchSpy); vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  window.localStorage.clear(); touches.length = 0; fetchSpy.mockClear(); __resetPrototypeBusyForTest()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const click = async (el?: Element | null) => { expect(el).toBeTruthy(); await act(async () => (el as HTMLElement).click()) }
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
function Location() { const l = useLocation(); return <span data-location>{l.pathname}{l.search}</span> }
const render = async (path: string) => act(async () => root.render(<MemoryRouter initialEntries={[path]}><Prototype /><Location /></MemoryRouter>))

it.each(['platform', 'organization'])('両TOP(%s)のカードから同じ作品名入りフォームへ進み、閉じると詳細を保持する', async (scope) => {
  await render(`/prototype/performance-request/top?scope=${scope}`)
  expect(host.querySelectorAll('#new-arrivals li')).toHaveLength(12)
  await click(host.querySelector('#new-arrivals [aria-label="星空のマリス"] [data-testid="performance-request-card"]'))
  expect(document.querySelector<HTMLInputElement>('#proto-request-title')?.value).toBe('星空のマリス')
  expect(document.querySelector('[data-testid="proto-request-form"]')?.textContent).not.toContain('希望店舗')
  expect(document.querySelector('[data-testid="proto-request-form"] input[type="checkbox"]')).toBeNull()
  expect(document.querySelector('[data-testid="proto-request-form"]')?.textContent).toContain('リクエストした作品の公演が追加されたら、メールとマイページでお知らせします')
  expect(host.querySelector('[data-location]')?.textContent).toContain(`scope=${scope}`)
  await click(document.querySelector('[aria-label="入力をやめる"]'))
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(host.querySelector('[data-location]')?.textContent).toContain('scenario=proto-scn-public')
  expect(readProtoState().requests).toHaveLength(0); expect(touches).toEqual([]); expect(fetchSpy).not.toHaveBeenCalled()
})
it('新作すべて見るは12件を超えて同じ90日条件のカタログへ、一般カタログは全作品へ進む', async () => {
  await render('/prototype/performance-request/top?scope=platform')
  await click(host.querySelector('#new-arrivals a'))
  expect(host.textContent).toContain('新作で絞り込み中')
  expect(host.querySelector('[data-chip="新作"]')?.getAttribute('aria-pressed')).toBe('true')
  expect(host.querySelectorAll('[data-testid="preview-catalog-results"] [role="link"]')).toHaveLength(16)
  await click(button('すべて'))
  expect(host.querySelectorAll('[data-testid="preview-catalog-results"] [role="link"]')).toHaveLength(18)
  expect(host.querySelector('[data-location]')?.textContent).not.toContain('genre=')
})
it('ボタンは日付を選択の既存空枠内に一つだけあり、別の開催希望カードを作らない', async () => {
  await render('/prototype/performance-request?scenario=proto-scn-public')
  const empty = host.querySelector('[data-testid="performance-request-empty"]')!
  expect(empty.textContent).toBe('公演をリクエストする')
  expect(empty.parentElement?.textContent).not.toContain('現在予約可能な公演はありません')
  expect(empty.closest('[role="tabpanel"]')?.textContent).toContain('日付を選択')
  expect([...host.querySelectorAll('button')].filter((b) => b.textContent?.trim() === '公演をリクエストする')).toHaveLength(1)
  expect(host.textContent).not.toContain('1人からオープン公演の開催を希望できます。')
})
it.each(['load=loading', 'load=error', 'schedule=scheduled', 'schedule=full', 'schedule=closed'])('読込/失敗/公演あり(%s)に開催希望ボタンを出さない', async (query) => {
  await act(async () => root.render(<MemoryRouter initialEntries={[`/prototype/performance-request?scenario=proto-scn-public&${query}`]}><CustomerScenarioPage /></MemoryRouter>))
  expect(button('公演をリクエストする')).toBeUndefined()
  expect(host.querySelector('[data-testid="performance-request-empty"]')).toBeNull()
})
it('カード内のクリック・Enterはカードの通常リンクへ重複伝播しない', async () => {
  await render('/prototype/performance-request/top?scope=platform')
  const cardRoot = host.querySelector('#new-arrivals [aria-label="星空のマリス"]')!
  const b = cardRoot.querySelector('[data-testid="performance-request-card"]')!
  await act(async () => b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(host.querySelector('[data-location]')?.textContent).toContain('/top?')
  await click(b)
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
})
it('希望保存から該当追加セル・未選択の公演ダイアログ・上位候補まで連携し、公演は作らない', async () => {
  for (const scenarioId of ['proto-scn-public', 'proto-scn-public', 'proto-scn-1']) submitRequest({ scenarioId, storeIds: [], organizationId: 'proto-org', dates: ['2026-11-20'], timeSlots: ['morning'], period: { kind: 'anytime' }, weekdays: [], participants: 2 })
  await render('/prototype/performance-request/admin')
  const cell = host.querySelector('[data-request-cell="2026-11-20:proto-store-b:morning"]')!
  expect(cell.textContent).toContain('（リクエストあり）')
  expect(host.querySelector('[data-request-cell="2026-11-20:proto-store-a:morning"]')?.textContent).toContain('リクエストあり')
  expect(host.querySelector('[data-request-cell="2026-11-20:proto-store-c:morning"]')?.textContent).not.toContain('星空のマリス')
  expect(host.querySelector('[data-request-cell="2026-11-20:proto-store-b:afternoon"]')?.textContent).not.toContain('リクエストあり')
  await click(cell.querySelector('button'))
  const dialog = document.querySelector('[data-perf-modal]')!
  const select = [...dialog.querySelectorAll('[role="combobox"]')].find((b) => b.textContent?.trim() === 'シナリオ')
  expect(select).toBeTruthy()
  const priorities = dialog.querySelector('[data-testid="proto-priority-titles"]')?.textContent
  expect(priorities).toContain('星空のマリス'); expect(priorities).toContain('霧の館の晩餐会')
  await click(select)
  const options = [...document.querySelectorAll('[data-preview-popover] .scrollable-list > div')].map((b) => b.textContent ?? '').filter((s) => s.includes('リクエストあり') || s.includes('晩餐会'))
  expect(options[0]).toContain('霧の館の晩餐会')
  expect(options[1]).toContain('星空のマリス')
  expect(options.filter((s) => s.includes('星空のマリス'))).toHaveLength(1)
  await click(button('追加'))
  expect(document.querySelector('[data-testid="proto-dialog-save-message"]')?.textContent).toContain('試作のため保存しません')
  expect(readProtoState().requests).toHaveLength(3); expect(touches).toEqual([]); expect(fetchSpy).not.toHaveBeenCalled()
})
