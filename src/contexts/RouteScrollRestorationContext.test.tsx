// @vitest-environment jsdom
// 画面の中の操作（希望店舗のチップなど URL の書き換え）や読込完了で、利用者の位置を奪う強制スクロールをしない（QW-20261022-013）。
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteScrollRestorationProvider, useReportRouteScrollRestoration } from './RouteScrollRestorationContext'
import { ScrollToTop } from '@/components/routing/ScrollToTop'
import { saveScrollPositionForPage, scrollRestorationPageKeyFromLocation } from '@/hooks/useScrollRestoration'

let root: Root
let host: HTMLDivElement
let scrollSpy: { mock: { calls: unknown[][] }; mockRestore: () => void }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const saveFor = (pathname: string, search: string, y: number) => {
  window.scrollY = y
  saveScrollPositionForPage(scrollRestorationPageKeyFromLocation(pathname, search))
  window.scrollY = 0
}

function Page() {
  const [loading, setLoading] = useState(false)
  useReportRouteScrollRestoration('test-page', { isLoading: loading })
  const [, setParams] = useSearchParams()
  const navigate = useNavigate()
  const loc = useLocation()
  return (
    <div>
      <output data-testid="where">{loc.pathname + loc.search}</output>
      <button onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('stores', 'a'); return n }, { replace: true })}>店舗A</button>
      <button onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('stores', 'a,b'); return n }, { replace: true })}>店舗AB</button>
      <button onClick={() => setLoading(true)}>読込開始</button>
      <button onClick={() => setLoading(false)}>読込完了</button>
      <button onClick={() => navigate(-1)}>戻る</button>
      <button onClick={() => navigate(1)}>進む</button>
    </div>
  )
}

async function render(entries: string[], index = entries.length - 1) {
  await act(async () => root.render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <RouteScrollRestorationProvider>
        <ScrollToTop />
        <Routes><Route path="*" element={<Page />} /></Routes>
      </RouteScrollRestorationProvider>
    </MemoryRouter>,
  ))
}
const click = async (label: string) => {
  const b = [...host.querySelectorAll('button')].find((x) => x.textContent === label)!
  await act(async () => b.click())
}
const where = () => host.querySelector('[data-testid="where"]')?.textContent
const restoredTo = (y: number) => scrollSpy.mock.calls.some((c) => c[0] === 0 && c[1] === y)

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  sessionStorage.clear()
  Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true })
  scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation((() => {}) as typeof window.scrollTo) as unknown as typeof scrollSpy
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); scrollSpy.mockRestore()
})

describe('スクロール位置の復元（強制スクロールの抑止）', () => {
  it('希望店舗のチップで URL の stores だけが変わっても、前に保存した位置へ飛ばさない', async () => {
    // 以前「店舗 A だけ」のときに下の作品一覧まで送っていた（1500。修正前は希望店舗の組み合わせごとに位置を保存していた）。
    // いまは「A と B」で上のチップを見ていて、B を外す
    sessionStorage.setItem('route:/private-booking/select-organization?org=qw&stores=aScrollY', '1500')
    await render(['/private-booking/select-organization?org=qw&stores=a,b'])
    await click('店舗A')
    await act(async () => { await wait(400) })
    expect(where()).toBe('/private-booking/select-organization?org=qw&stores=a')
    expect(restoredTo(1500)).toBe(false)
  })

  it('戻るでは前のページの位置を復元し、URL の希望店舗も保つ', async () => {
    saveFor('/private-booking/select-organization', '?org=qw&stores=a', 1500)
    await render(['/private-booking/select-organization?org=qw&stores=a', '/qw/scenario/x?tab=private&stores=a'])
    await click('戻る')
    await act(async () => { await wait(400) })
    expect(where()).toBe('/private-booking/select-organization?org=qw&stores=a')
    expect(restoredTo(1500)).toBe(true)
  })

  it('一度来た画面へ戻ったときも復元する（途中の画面の読込が終わっていなくても）', async () => {
    await render(['/p?org=qw', '/next'], 0)
    // この画面に一度来た（保存位置なし）→ 下へ送ってから次の画面へ（次の画面は読込中のまま）→ 戻る
    saveFor('/p', '?org=qw', 1500)
    await click('読込開始')
    await click('進む')
    await click('戻る')
    await click('読込完了')
    await act(async () => { await wait(400) })
    expect(restoredTo(1500)).toBe(true)
  })

  it('読込中に利用者が自分でスクロールしたら、読込完了後に保存位置へ引き戻さない', async () => {
    saveFor('/p', '?org=qw', 1500)
    await render(['/p?org=qw', '/next'])
    await click('読込開始')
    await click('戻る')
    await act(async () => { await wait(50) })
    // 利用者の操作（ホイール）
    await act(async () => { document.dispatchEvent(new WheelEvent('wheel', { bubbles: true })) })
    await click('読込完了')
    await act(async () => { await wait(400) })
    expect(restoredTo(1500)).toBe(false)
  })

  it('読込中に操作しなければ、読込完了後に 1 回だけ保存位置へ戻す（初回の表示位置）', async () => {
    saveFor('/p', '?org=qw', 1500)
    await render(['/p?org=qw', '/next'])
    await click('読込開始')
    await click('戻る')
    await click('読込完了')
    await act(async () => { await wait(400) })
    expect(restoredTo(1500)).toBe(true)
    const count = scrollSpy.mock.calls.filter((c) => c[1] === 1500).length
    // 同じ画面で再び読込が終わっても、もう一度は飛ばさない
    await click('読込開始')
    await click('読込完了')
    await act(async () => { await wait(400) })
    expect(scrollSpy.mock.calls.filter((c) => c[1] === 1500).length).toBe(count)
  })
})
