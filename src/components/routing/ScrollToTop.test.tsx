// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, useNavigate, useSearchParams } from 'react-router-dom'
import { ScrollToTop } from './ScrollToTop'
import { isNavigationChange, stripNonNavigationParams } from '@/lib/scrollNavigation'
import { usePerformanceSearchParams } from '@/components/public-top/usePerformanceSearchParams'

function FilterButtons() {
  const { update } = usePerformanceSearchParams()
  const [, setParams] = useSearchParams()
  const navigate = useNavigate()
  return (
    <div>
      <button onClick={() => update({ preset: 'week' })}>今週</button>
      <button onClick={() => update({ preset: 'nextweek' })}>来週</button>
      <button onClick={() => update({ view: 'calendar' })}>カレンダー</button>
      <button onClick={() => update({ view: 'list' })}>リスト</button>
      <button onClick={() => update({ storeIds: ['s1'] })}>店舗</button>
      <button onClick={() => update({ onlyAvailable: false })}>空席あり</button>
      <button onClick={() => update({ beginnerOnly: true })}>初心者向け</button>
      <button onClick={() => setParams({ tab: 'coupons' })}>タブ</button>
      <button onClick={() => navigate('/queens-waltz/scenario/abc')}>作品へ</button>
    </div>
  )
}


let root: Root | null = null
let host: HTMLDivElement | null = null

function mount(node: ReactNode) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(node) })
}

function unmount() {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
}

function text(): string {
  return host?.textContent ?? ''
}

function click(label: string) {
  const btn = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === label)!
  act(() => { btn.click() })
}

function renderAt(path: string) {
  mount(
    <MemoryRouter initialEntries={[path]}>
      <ScrollToTop />
      <FilterButtons />
    </MemoryRouter>,
  )
}

describe('ScrollToTop', () => {
  let scrollSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => {
    scrollSpy.mockRestore()
    unmount()
  })

  it.each(['/queens-waltz', '/'])('%s: 絞り込み（クエリだけの変更）では scrollTo を呼ばない', (path) => {
    renderAt(path)
    for (const name of ['今週', '来週', 'カレンダー', 'リスト', '店舗', '空席あり', '初心者向け']) {
      click(name)
    }
    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('別のパスへ移ったら先頭へ戻す', () => {
    renderAt('/queens-waltz')
    click('作品へ')
    expect(scrollSpy).toHaveBeenCalledWith(0, 0)
  })

  it('?tab= の切替はこれまでどおり先頭へ戻す', () => {
    renderAt('/mypage')
    click('タブ')
    expect(scrollSpy).toHaveBeenCalledWith(0, 0)
  })
})

describe('stripNonNavigationParams / isNavigationChange', () => {
  it('絞り込みとダイアログのキーだけ外し、tab は残す', () => {
    expect(stripNonNavigationParams('?when=week&stores=a,b&avail=0&beginner=1&area=x&view=list&date=2026-10-20&people=2&event=e&count=3&tab=t')).toBe('?tab=t')
  })
  it('初回は変化扱いしない', () => {
    expect(isNavigationChange(null, '/', '')).toBe(false)
  })
  it('同じパスで絞り込みだけ違えば変化なし、パスが違えば変化あり', () => {
    expect(isNavigationChange('/queens-waltz', '/queens-waltz', '?when=week')).toBe(false)
    expect(isNavigationChange('/queens-waltz', '/queens-waltz/scenario/a', '')).toBe(true)
  })
})
