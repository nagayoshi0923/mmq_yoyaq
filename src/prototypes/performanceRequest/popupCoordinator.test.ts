import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProtoNotification } from './notify'
import { PopupCoordinator, type PopupChannel, type PopupChannelMessage, type PopupCoordinatorDeps } from './popupCoordinator'

function notification(id: string): ProtoNotification {
  return {
    id, userId: 'u1', dedupeKey: `k-${id}`, kind: 'performance_added', variant: 'new_performance', sources: ['bell'],
    scenarioId: 's', performanceId: id, storeId: 'st', date: '2026-11-21', startTime: '13:00', title: 't', message: 'm',
    link: '/x', createdAt: '2026-10-24T00:00:00Z', readAt: null, popupShownAt: null, popupDismissedAt: null,
  }
}

/** 同じブラウザの複数タブを模擬する: localStorage の代わりの共有の「表示済み」と、BroadcastChannel の代わり */
function sharedWorld() {
  const shown = new Set<string>()
  const listeners = new Set<(m: PopupChannelMessage) => void>()
  const channel = (): PopupChannel => ({
    post: (m) => { for (const l of listeners) l(m) },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
  })
  return { shown, channel }
}

function makeDeps(overrides: Partial<PopupCoordinatorDeps> = {}) {
  const world = sharedWorld()
  const shownItems: ProtoNotification[][] = []
  const deps: PopupCoordinatorDeps = {
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    fetchCandidates: vi.fn(async () => [notification('n1')]),
    claim: async (ids) => ids.filter((id) => { if (world.shown.has(id)) return false; world.shown.add(id); return true }),
    getBusyReason: () => null,
    isPopupDisabled: () => false,
    onShow: (items) => { shownItems.push(items) },
    tabId: 'tab-a',
    channel: world.channel(),
    ...overrides,
  }
  return { deps, shownItems, world }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T10:00:00+09:00')) })
afterEach(() => { vi.useRealTimers() })

describe('確認のきっかけ', () => {
  it('ログイン・最初に開いた・タブ復帰・focus・ページ移動が立て続けでも、取得は 1 回にまとめる', async () => {
    const { deps, shownItems } = makeDeps()
    const c = new PopupCoordinator(deps)
    c.request('initial'); c.request('login'); c.request('visibility'); c.request('focus'); c.request('route')
    await vi.advanceTimersByTimeAsync(400)
    expect(deps.fetchCandidates).toHaveBeenCalledTimes(1)
    expect(shownItems).toHaveLength(1)
  })

  it('取得中に来たきっかけで 2 本目を並べて走らせず、終わってから 1 回だけやり直す', async () => {
    let resolveFirst: (v: ProtoNotification[]) => void = () => {}
    const fetchCandidates = vi.fn()
      .mockImplementationOnce(() => new Promise<ProtoNotification[]>((r) => { resolveFirst = r }))
      .mockImplementation(async () => [])
    const { deps } = makeDeps({ fetchCandidates })
    const c = new PopupCoordinator(deps, { debounceMs: 100, minIntervalMs: 0 })
    c.request('initial')
    await vi.advanceTimersByTimeAsync(150)
    c.request('focus'); c.request('route')
    await vi.advanceTimersByTimeAsync(500)
    expect(fetchCandidates).toHaveBeenCalledTimes(1) // 取得中は重ねない
    resolveFirst([])
    await vi.advanceTimersByTimeAsync(500)
    expect(fetchCandidates).toHaveBeenCalledTimes(2)
  })

  it('最短間隔より短い間のきっかけは、間隔があくまで待つ（間引き）', async () => {
    const { deps } = makeDeps({ fetchCandidates: vi.fn(async () => []) })
    const c = new PopupCoordinator(deps, { debounceMs: 100, minIntervalMs: 5000 })
    c.request('initial')
    await vi.advanceTimersByTimeAsync(200)
    c.request('route')
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.fetchCandidates).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(deps.fetchCandidates).toHaveBeenCalledTimes(2)
  })

  it('ログインし直す前の古い応答は捨て、新しい応答で決める', async () => {
    let resolveOld: (v: ProtoNotification[]) => void = () => {}
    const fetchCandidates = vi.fn()
      .mockImplementationOnce(() => new Promise<ProtoNotification[]>((r) => { resolveOld = r }))
      .mockImplementation(async () => [notification('new-user')])
    const { deps, shownItems } = makeDeps({ fetchCandidates })
    const c = new PopupCoordinator(deps, { debounceMs: 100, minIntervalMs: 0 })
    c.request('initial')
    await vi.advanceTimersByTimeAsync(150)
    c.request('login')
    resolveOld([notification('old-user')])
    await vi.advanceTimersByTimeAsync(500)
    expect(shownItems.flat().map((n) => n.id)).toEqual(['new-user'])
  })
})

describe('割り込まない', () => {
  it('入力中は出さずに待ち、入力が終わったら出す', async () => {
    let busy: string | null = '予約・リクエストの入力中'
    const onDefer = vi.fn()
    const { deps, shownItems } = makeDeps({ getBusyReason: () => busy, onDefer })
    const c = new PopupCoordinator(deps, { debounceMs: 100, retryMs: 1000 })
    c.request('initial')
    await vi.advanceTimersByTimeAsync(3000)
    expect(shownItems).toHaveLength(0)
    expect(onDefer).toHaveBeenCalledWith('予約・リクエストの入力中')
    busy = null
    await vi.advanceTimersByTimeAsync(3000)
    expect(shownItems).toHaveLength(1)
  })

  it('ログイン直後で戻り先へ戻る途中も待つ', async () => {
    let busy: string | null = 'ログイン直後で戻り先へ戻る途中'
    const { deps, shownItems } = makeDeps({ getBusyReason: () => busy })
    const c = new PopupCoordinator(deps, { debounceMs: 100, retryMs: 500 })
    c.request('login')
    await vi.advanceTimersByTimeAsync(1200)
    expect(shownItems).toHaveLength(0)
    busy = null
    c.request('idle')
    await vi.advanceTimersByTimeAsync(2500)
    expect(shownItems).toHaveLength(1)
  })

  it('出さない設定のときは確認もしない（通知は一覧に残る）', async () => {
    const { deps, shownItems } = makeDeps({ isPopupDisabled: () => true })
    const c = new PopupCoordinator(deps)
    c.request('initial')
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.fetchCandidates).not.toHaveBeenCalled()
    expect(shownItems).toHaveLength(0)
  })

  it('閉じた後しばらくは、ページを移るたびに新しいポップアップを出さない（ログインのときは出す）', async () => {
    let n = 0
    const { deps, shownItems } = makeDeps({ fetchCandidates: vi.fn(async () => [notification(`n${++n}`)]) })
    const c = new PopupCoordinator(deps, { debounceMs: 100, minIntervalMs: 0, cooldownMs: 60_000 })
    c.request('initial')
    await vi.advanceTimersByTimeAsync(200)
    expect(shownItems).toHaveLength(1)
    c.dismissed()
    c.request('route'); await vi.advanceTimersByTimeAsync(200)
    c.request('focus'); await vi.advanceTimersByTimeAsync(200)
    expect(shownItems).toHaveLength(1)
    c.request('login'); await vi.advanceTimersByTimeAsync(200)
    expect(shownItems).toHaveLength(2)
  })

  it('出ている間は重ねて出さない', async () => {
    let n = 0
    const { deps, shownItems } = makeDeps({ fetchCandidates: vi.fn(async () => [notification(`n${++n}`)]) })
    const c = new PopupCoordinator(deps, { debounceMs: 100, minIntervalMs: 0 })
    c.request('initial'); await vi.advanceTimersByTimeAsync(200)
    c.request('login'); await vi.advanceTimersByTimeAsync(200)
    expect(shownItems).toHaveLength(1)
  })
})

describe('複数のタブ', () => {
  it('同じ通知は 1 つのタブでだけ出る（表示済みを共有）', async () => {
    const world = sharedWorld()
    const shownA: ProtoNotification[][] = []
    const shownB: ProtoNotification[][] = []
    const base = {
      now: () => Date.now(),
      setTimer: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimer: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
      fetchCandidates: async () => [notification('n1')].filter((x) => !world.shown.has(x.id)),
      claim: async (ids: string[]) => ids.filter((id) => { if (world.shown.has(id)) return false; world.shown.add(id); return true }),
      getBusyReason: () => null,
      isPopupDisabled: () => false,
    }
    const a = new PopupCoordinator({ ...base, tabId: 'A', channel: world.channel(), onShow: (i) => { shownA.push(i) } }, { debounceMs: 100 })
    const b = new PopupCoordinator({ ...base, tabId: 'B', channel: world.channel(), onShow: (i) => { shownB.push(i) } }, { debounceMs: 100 })
    a.request('initial'); b.request('initial')
    await vi.advanceTimersByTimeAsync(300)
    b.request('visibility')
    await vi.advanceTimersByTimeAsync(3000)
    expect(shownA.length + shownB.length).toBe(1)
  })

  it('別のタブから「表示済み」の連絡が来た通知は、取得結果に残っていても出さない', async () => {
    const world = sharedWorld()
    const shownB: ProtoNotification[][] = []
    const b = new PopupCoordinator({
      now: () => Date.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      fetchCandidates: async () => [notification('n1')], claim: async (ids) => ids,
      getBusyReason: () => null, isPopupDisabled: () => false, onShow: (i) => { shownB.push(i) }, tabId: 'B', channel: world.channel(),
    }, { debounceMs: 100 })
    world.channel().post({ type: 'shown', ids: ['n1'], tabId: 'A' })
    b.request('initial')
    await vi.advanceTimersByTimeAsync(300)
    expect(shownB).toHaveLength(0)
  })
})

describe('アンマウント（dispose）と claim の待ち', () => {
  it('dispose の後に古い取得の応答が届いても表示しない', async () => {
    let resolveFetch: (v: ProtoNotification[]) => void = () => {}
    const { deps, shownItems } = makeDeps({ fetchCandidates: vi.fn(() => new Promise<ProtoNotification[]>((r) => { resolveFetch = r })) })
    const c = new PopupCoordinator(deps, { debounceMs: 100 })
    c.request('initial')
    await vi.advanceTimersByTimeAsync(150)
    c.dispose()
    resolveFetch([notification('n1')])
    await vi.advanceTimersByTimeAsync(3000)
    expect(shownItems).toHaveLength(0)
  })

  it('別のタブとの claim を待っている間に入力中・ログインの戻り途中になったら、表示を遅らせる', async () => {
    let busy: string | null = null
    let resolveClaim: (v: string[]) => void = () => {}
    const release = vi.fn()
    const claim = vi.fn()
      .mockImplementationOnce((ids: string[]) => new Promise<string[]>((r) => { resolveClaim = () => r(ids) }))
      .mockImplementation(async (ids: string[]) => ids)
    const { deps, shownItems } = makeDeps({ claim, release, getBusyReason: () => busy })
    const c = new PopupCoordinator(deps, { debounceMs: 100, retryMs: 500 })
    c.request('initial')
    await vi.advanceTimersByTimeAsync(150)
    busy = '予約・リクエストの入力中'
    resolveClaim([])
    await vi.advanceTimersByTimeAsync(1200)
    expect(shownItems).toHaveLength(0)
    expect(release).toHaveBeenCalledWith(['n1'])
    busy = null
    await vi.advanceTimersByTimeAsync(2000)
    expect(shownItems).toHaveLength(1)
  })

  it('claim を取った後に dispose されたら、claim を解放する。再マウント後の新しい世代では正常に表示する', async () => {
    const world = sharedWorld()
    let resolveClaim: () => void = () => {}
    const release = vi.fn(async (ids: string[]) => { for (const id of ids) world.shown.delete(id) })
    const realClaim = async (ids: string[]) => ids.filter((id) => { if (world.shown.has(id)) return false; world.shown.add(id); return true })
    const first = makeDeps({
      claim: (ids) => new Promise<string[]>((r) => { resolveClaim = () => { void realClaim(ids).then(r) } }),
      release,
      channel: world.channel(),
    })
    const c1 = new PopupCoordinator(first.deps, { debounceMs: 100 })
    c1.request('initial')
    await vi.advanceTimersByTimeAsync(150)
    c1.dispose()
    resolveClaim()
    await vi.advanceTimersByTimeAsync(500)
    expect(first.shownItems).toHaveLength(0)
    expect(release).toHaveBeenCalledWith(['n1'])
    expect(world.shown.has('n1')).toBe(false)

    const second = makeDeps({ claim: realClaim, release, channel: world.channel() })
    const c2 = new PopupCoordinator(second.deps, { debounceMs: 100 })
    c2.request('initial')
    await vi.advanceTimersByTimeAsync(300)
    expect(second.shownItems.flat().map((n) => n.id)).toEqual(['n1'])
  })
})
