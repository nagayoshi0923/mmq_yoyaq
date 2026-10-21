// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { usePerformanceSearchParams } from './usePerformanceSearchParams'

let root: Root | null = null
let latest: { hook: ReturnType<typeof usePerformanceSearchParams>; search: string } | null = null

function Probe() {
  const hook = usePerformanceSearchParams()
  const location = useLocation()
  latest = { hook, search: location.search }
  return null
}

function open(url: string) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const el = document.createElement('div')
  root = createRoot(el)
  act(() => { root!.render(createElement(MemoryRouter, { initialEntries: [url] }, createElement(Probe))) })
  return latest!
}

afterEach(() => { act(() => root?.unmount()); root = null; latest = null })

describe('トップの絞り込み URL', () => {
  it('何も無ければ「今月」・空席あり（人数の項目は無い。2026-10-13 社長指示で「今週」から「今月」に）', () => {
    const { hook } = open('/queens-waltz')
    expect(hook.state.preset).toBe('month')
    expect(hook.state.onlyAvailable).toBe(true)
    expect('people' in hook.state).toBe(false)
  })
  it.each(['weekend', 'today', 'tomorrow'])('古い ?when=%s は「今週」として開く', (when) => {
    expect(open(`/queens-waltz?when=${when}`).hook.state.preset).toBe('week')
  })
  it('?when=nextweek・month・week はそのまま、知らない値は「今月」', () => {
    expect(open('/?when=nextweek').hook.state.preset).toBe('nextweek')
    act(() => root?.unmount())
    expect(open('/?when=month').hook.state.preset).toBe('month')
    act(() => root?.unmount())
    expect(open('/?when=week').hook.state.preset).toBe('week')
    act(() => root?.unmount())
    expect(open('/?when=xyz').hook.state.preset).toBe('month')
  })
  it('古い ?people= はエラーにせず無視し、次の操作で URL から消す', () => {
    const { hook } = open('/queens-waltz?people=4&when=weekend')
    expect(hook.state.preset).toBe('week')
    act(() => hook.update({ preset: 'nextweek' }))
    expect(latest!.search).toBe('?when=nextweek')
    act(() => latest!.hook.update({ preset: 'week' }))
    expect(latest!.search).toBe('?when=week')
    // 既定の「今月」は URL に書かない
    act(() => latest!.hook.update({ preset: 'month' }))
    expect(latest!.search).toBe('')
  })
})
