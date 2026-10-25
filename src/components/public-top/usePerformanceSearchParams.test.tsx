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
  it('何も無ければ今日から 30 日・空席あり（人数の項目は無い。2026-10-25 社長指示で「今月」から変更）', () => {
    const { hook } = open('/queens-waltz')
    expect(hook.state.preset).toBe('upcoming')
    expect(hook.state.windows).toBe(1)
    expect(hook.state.onlyAvailable).toBe(true)
    expect('people' in hook.state).toBe(false)
  })
  it.each(['weekend', 'today', 'tomorrow'])('古い ?when=%s は「今週」として開く', (when) => {
    expect(open(`/queens-waltz?when=${when}`).hook.state.preset).toBe('week')
  })
  it('?when=nextweek・week はそのまま、古い month と知らない値は既定（今日から 30 日）', () => {
    expect(open('/?when=nextweek').hook.state.preset).toBe('nextweek')
    act(() => root?.unmount())
    expect(open('/?when=month').hook.state.preset).toBe('upcoming')
    act(() => root?.unmount())
    expect(open('/?when=week').hook.state.preset).toBe('week')
    act(() => root?.unmount())
    expect(open('/?when=xyz').hook.state.preset).toBe('upcoming')
  })
  it('「もっと見る」の期間は ?more= に持ち（戻ったときも同じ期間）、店舗・空席は保ったまま、日付のチップ・見方を変えたら消す', () => {
    const { hook } = open('/queens-waltz?stores=s1&avail=0')
    act(() => hook.update({ windows: 3 }))
    expect(latest!.search).toBe('?stores=s1&avail=0&more=3')
    expect(latest!.hook.state.windows).toBe(3)
    act(() => root?.unmount())
    // 作品ページから戻った（同じ URL を開き直した）とき
    const back = open('/queens-waltz?stores=s1&avail=0&more=3').hook
    expect(back.state.windows).toBe(3)
    expect(back.state.storeIds).toEqual(['s1'])
    expect(back.state.onlyAvailable).toBe(false)
    act(() => back.update({ onlyAvailable: true }))
    expect(latest!.search).toBe('?stores=s1&more=3')
    act(() => latest!.hook.update({ preset: 'week' }))
    expect(latest!.search).toBe('?stores=s1&when=week')
    act(() => latest!.hook.update({ windows: 2 }))
    act(() => latest!.hook.update({ view: 'calendar' }))
    expect(latest!.search).toBe('?stores=s1&when=week&view=calendar')
    act(() => root?.unmount())
    // おかしな値は 1、上限は 24
    expect(open('/?more=abc').hook.state.windows).toBe(1)
    act(() => root?.unmount())
    expect(open('/?more=999').hook.state.windows).toBe(24)
  })
  it('古い ?people= はエラーにせず無視し、次の操作で URL から消す', () => {
    const { hook } = open('/queens-waltz?people=4&when=weekend')
    expect(hook.state.preset).toBe('week')
    act(() => hook.update({ preset: 'nextweek' }))
    expect(latest!.search).toBe('?when=nextweek')
    act(() => latest!.hook.update({ preset: 'week' }))
    expect(latest!.search).toBe('?when=week')
    // 既定（今日から 30 日）は URL に書かない
    act(() => latest!.hook.update({ preset: 'upcoming' }))
    expect(latest!.search).toBe('')
  })
})
