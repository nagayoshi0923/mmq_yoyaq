// @vitest-environment jsdom
/**
 * 起動をまたいだ自動の再読み込みの回数（QW-20261023-001 のページ内の繰り返しの候補）。
 * main.tsx をモジュールごと読み込み直して「ページの起動」を模す。保存領域（sessionStorage）は同じタブとして残る。
 * 通信はすべて架空（fetch を差し替え）、画面本体（AppRoot）は空にしている。
 */
import { act, Component, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./AppRoot.tsx', () => ({ default: () => null }))
vi.mock('@/lib/sentry', () => ({ initSentry: vi.fn() }))

type LazyModule = typeof import('@/utils/lazyWithRetry')

const entry = (hash: string) => `<script type="module" src="/assets/index-${hash}.js"></script>`
let servedHash = 'NEW'
const fetchMock = vi.fn(async () => new Response(entry(servedHash)))
const reload = vi.fn()
const replace = vi.fn()

const chunkError = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/Settings-OLD.js'))
const screenOk = () => Promise.resolve({ default: () => <p>画面</p> })

class Boundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

/** ページの起動を模す（そのページが読んだ版を pageHash で与える） */
const bootListeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = []

/** 前の起動の待ち受けを外す（実際の再読み込みでは前のページの待ち受けは残らない） */
function shutdownPreviousBoot() {
  for (const [target, type, listener] of bootListeners.splice(0)) target.removeEventListener(type, listener)
}

async function boot(pageHash: string): Promise<LazyModule> {
  shutdownPreviousBoot()
  vi.resetModules()
  const spies = ([window, document] as EventTarget[]).map((target) => {
    const original = target.addEventListener.bind(target)
    return vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
      if (listener) bootListeners.push([target, type, listener])
      original(type, listener, options)
    })
  })
  document.head.innerHTML = entry(pageHash)
  document.body.innerHTML = '<div id="root"></div>'
  try {
    await act(async () => { await import('./main') })
  } finally {
    spies.forEach((spy) => spy.mockRestore())
  }
  return import('@/utils/lazyWithRetry')
}

/** 遅延読み込みの画面を開き、結果を返す */
async function openScreen(mod: LazyModule, importFn: () => Promise<{ default: () => ReactNode }>) {
  const Screen = mod.lazyWithRetry(importFn, 0)
  let failed = false
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(
      <Boundary onError={() => { failed = true }}>
        <Suspense fallback={<p>読み込み中</p>}><Screen /></Suspense>
      </Boundary>,
    )
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
  })
  return failed ? 'error' : host.textContent === '画面' ? 'ok' : 'waiting'
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval'] })
  vi.stubGlobal('fetch', fetchMock)
  const real = window.location
  vi.stubGlobal('location', {
    get href() { return real.href }, get origin() { return real.origin }, get pathname() { return real.pathname },
    get search() { return real.search }, get hash() { return real.hash }, reload, replace, assign: vi.fn(),
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  sessionStorage.clear()
  servedHash = 'NEW'
  reload.mockReset()
  replace.mockReset()
  fetchMock.mockClear()
})

afterEach(() => {
  shutdownPreviousBoot()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('チャンクが読めないときの自動の再読み込み', () => {
  it('読み込み直しても古い版で起動し続けるなら、自動の再読み込みは 1 回だけで、その後は画面のエラー表示に任せる', async () => {
    expect(await openScreen(await boot('OLD'), chunkError)).toBe('waiting')
    expect(await openScreen(await boot('OLD'), chunkError)).toBe('error')
    expect(await openScreen(await boot('OLD'), chunkError)).toBe('error')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('新しい版で起動できたらそのまま使え、さらに新しい版が出たら改めて 1 回だけ切り替える', async () => {
    expect(await openScreen(await boot('OLD'), chunkError)).toBe('waiting')
    expect(await openScreen(await boot('NEW'), screenOk)).toBe('ok')
    servedHash = 'NEWER'
    expect(await openScreen(await boot('NEW'), chunkError)).toBe('waiting')
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('配信が A・B 交互に返っても、起動をまたいで際限なく読み込み直さない', async () => {
    const results: string[] = []
    for (const [page, served] of [['B', 'A'], ['A', 'B'], ['B', 'A'], ['A', 'B'], ['B', 'A']]) {
      servedHash = served
      results.push(await openScreen(await boot(page), chunkError))
    }
    expect(results).toEqual(['waiting', 'waiting', 'error', 'error', 'error'])
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('サーバーの版が同じなら読み込み直さない', async () => {
    servedHash = 'OLD'
    expect(await openScreen(await boot('OLD'), chunkError)).toBe('error')
    expect(reload).not.toHaveBeenCalled()
  })

  it('保存領域が使えないときは自動では読み込み直さない', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
    expect(await openScreen(await boot('OLD'), chunkError)).toBe('error')
    expect(reload).not.toHaveBeenCalled()
  })

  it('手動の「最新版を読み込む」の後は、自動の切り替えが再び 1 回効く', async () => {
    await openScreen(await boot('OLD'), chunkError)
    const mod = await boot('OLD')
    expect(await openScreen(mod, chunkError)).toBe('error')
    mod.forceReloadLatest()
    expect(replace).toHaveBeenCalledTimes(1)
    expect(await openScreen(await boot('OLD'), chunkError)).toBe('waiting')
    expect(reload).toHaveBeenCalledTimes(2)
  })
})

describe('版の印なしで届く読み込み失敗（vite:preloadError）', () => {
  const preloadError = async () => {
    await act(async () => {
      window.dispatchEvent(new Event('vite:preloadError'))
      for (let i = 0; i < 10; i += 1) await Promise.resolve()
    })
  }

  it('サーバーの版を確かめてから切り替え、古い版で起動し続けても 1 回だけ', async () => {
    await boot('OLD')
    await preloadError()
    await boot('OLD')
    await preloadError()
    expect(fetchMock).toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('サーバーの版が同じなら切り替えない', async () => {
    servedHash = 'OLD'
    await boot('OLD')
    await preloadError()
    expect(reload).not.toHaveBeenCalled()
  })
})
