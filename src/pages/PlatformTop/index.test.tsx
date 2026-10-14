// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformTopData } from './hooks/platformTopData'

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('./hooks/platformTopData', () => ({ PLATFORM_RANGE_DAYS: 55, fetchPlatformTopData: mocks.fetch }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))
vi.mock('@/components/seo/JsonLd', () => ({ JsonLd: () => null }))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }))
vi.mock('@/contexts/RouteScrollRestorationContext', () => ({ useReportRouteScrollRestoration: vi.fn() }))
vi.mock('@/hooks/useScrollRestoration', () => ({ saveScrollPositionForCurrentUrl: vi.fn() }))
vi.mock('@/components/public-top/useScenarioMarks', () => ({ useScenarioMarks: () => ({ marks: null, dialog: null }) }))
import { PlatformTop } from './index'

const data: PlatformTopData = {
  performances: [],
  scenarios: [],
  prefectures: ['東京都'],
  organizations: [
    { id: 'o1', slug: 'queens-waltz', name: 'クインズワルツ', logo_url: null, store_names: ['大塚店'], store_count: 1, prefectures: ['東京都'], scenario_count: 12 },
  ],
} as unknown as PlatformTopData

let root: Root
let host: HTMLDivElement
function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}
async function render(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="*" element={<><PlatformTop /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  ))
  await vi.waitFor(() => expect(host.querySelector('#organizations a')).not.toBeNull())
}
const where = () => host.querySelector('[data-testid="where"]')?.textContent
const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label)
const section = (id: string) => host.querySelector(`#${id}`)
const cardHrefs = (id: string) => [...(section(id)?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Element.prototype.scrollIntoView = vi.fn()
  mocks.fetch.mockResolvedValue(data)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks() })

describe('友だちと貸切で遊ぶ →「参加店舗から選ぶ」', () => {
  it('はじめは貸切用の一覧を出さず、通常の参加店舗は組織トップへ', async () => {
    await render()
    expect(section('private-organizations')).toBeNull()
    expect(cardHrefs('organizations')).toEqual(['/queens-waltz'])
    expect(section('organizations')?.textContent).toContain('今月の空きはありません')
  })

  it('押すと「貸切する店舗を選ぶ」が開き、店舗のカードは貸切できる作品の一覧へ', async () => {
    await render()
    await act(async () => button('参加店舗から選ぶ')!.click())
    const picker = section('private-organizations')
    expect(picker?.querySelector('h2')?.textContent).toBe('貸切する店舗を選ぶ')
    expect(cardHrefs('private-organizations')).toEqual(['/queens-waltz/private-booking-select?from=mmq'])
    expect(where()).toBe('/?pick=private')
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
    // 通常の参加店舗の一覧は組織トップのまま
    expect(cardHrefs('organizations')).toEqual(['/queens-waltz'])
  })

  it('作品一覧の「別の店舗を選ぶ」（/?pick=private）から来ると開いた状態。閉じると URL からも消える', async () => {
    await render('/?pick=private')
    expect(cardHrefs('private-organizations')).toEqual(['/queens-waltz/private-booking-select?from=mmq'])
    await act(async () => button('閉じる')!.click())
    expect(section('private-organizations')).toBeNull()
    expect(where()).toBe('/')
  })
})
