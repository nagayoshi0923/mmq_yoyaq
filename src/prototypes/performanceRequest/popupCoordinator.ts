/**
 * 「MMQ を開いたときのお知らせ」（公演追加のポップアップ）を、いつ確かめて、いつ出すかを決める。
 * 画面の部品から切り離した純粋な仕組み（時計・タイマー・タブ間の連絡は差し替えられる）。試験は popupCoordinator.test.ts。
 *
 * 確かめるきっかけ: ログインに成功したとき / アプリを最初に開いたとき / タブに戻ったとき（visibilitychange・focus） / ページを移ったとき
 * - 立て続けのきっかけは 1 回にまとめる（debounceMs の間引き＋最短間隔 minIntervalMs）。取得中にもう 1 回は走らせず、終わってから 1 回だけやり直す。
 * - ログインのたびに世代を進め、古い世代の応答は捨てる（前の利用者・古い状態で上書きしない）。
 * - 入力中・ログイン直後の戻り途中など（isBusy）は出さずに待ち、落ち着いたら出す（retryMs ごとに確かめる）。
 * - 出した通知は claim でこのタブのものとして印を付け（表示済み）、別のタブにも知らせる（BroadcastChannel 等）。別のタブでは同じ通知を出さない。
 * - 閉じた後しばらく（cooldownMs）は、ページの移動・タブの復帰では新しいポップアップを出さない（移動のたびに割り込まない）。
 *   ログイン・最初に開いたときは出してよい。
 * - 出さない設定（isPopupDisabled）のときは確かめない。通知は一覧に未読のまま残る。
 */
import type { ProtoNotification } from './notify'

export type CheckTrigger = 'login' | 'initial' | 'visibility' | 'focus' | 'route' | 'idle'

export interface PopupChannel {
  post(message: PopupChannelMessage): void
  subscribe(listener: (message: PopupChannelMessage) => void): () => void
}

export type PopupChannelMessage = { type: 'shown'; ids: string[]; tabId: string }

export interface PopupCoordinatorDeps {
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  /** ポップアップに出す候補を読む（本人・未読・未表示・未クローズ） */
  fetchCandidates: () => Promise<ProtoNotification[]>
  /** 候補のうち、まだどのタブも表示していないものに「表示済み」を付けて返す */
  claim: (ids: string[]) => Promise<string[]>
  /** claim したが表示しなかった（dispose・入力中に変わった）ときに「表示済み」を外す */
  release?: (ids: string[]) => Promise<void> | void
  /** 割り込んではいけない理由（無ければ null） */
  getBusyReason: () => string | null
  isPopupDisabled: () => boolean
  onShow: (items: ProtoNotification[]) => void
  onDefer?: (reason: string) => void
  onCheck?: (trigger: CheckTrigger) => void
  channel?: PopupChannel
  tabId: string
}

export interface PopupCoordinatorOptions {
  debounceMs?: number
  minIntervalMs?: number
  retryMs?: number
  cooldownMs?: number
}

export class PopupCoordinator {
  private readonly deps: PopupCoordinatorDeps
  private readonly debounceMs: number
  private readonly minIntervalMs: number
  private readonly retryMs: number
  private readonly cooldownMs: number

  private timer: unknown = null
  private retryTimer: unknown = null
  private inFlight = false
  private rerun = false
  private generation = 0
  private lastRunAt = -Infinity
  private lastDismissAt = -Infinity
  private pendingTriggers = new Set<CheckTrigger>()
  private showing: ProtoNotification[] | null = null
  private shownElsewhere = new Set<string>()
  private unsubscribeChannel: (() => void) | null = null
  private disposed = false
  /** 試験・画面の表示用: 実際に取得した回数 */
  fetchCount = 0

  constructor(deps: PopupCoordinatorDeps, options: PopupCoordinatorOptions = {}) {
    this.deps = deps
    this.debounceMs = options.debounceMs ?? 300
    this.minIntervalMs = options.minIntervalMs ?? 2000
    this.retryMs = options.retryMs ?? 1500
    this.cooldownMs = options.cooldownMs ?? 10 * 60 * 1000
    this.unsubscribeChannel = deps.channel?.subscribe((message) => {
      if (message.type !== 'shown' || message.tabId === deps.tabId) return
      for (const id of message.ids) this.shownElsewhere.add(id)
    }) ?? null
  }

  dispose(): void {
    // 世代を進め、取得中・claim 待ちの応答が後から届いても表示しない
    this.disposed = true
    this.generation += 1
    if (this.timer) this.deps.clearTimer(this.timer)
    if (this.retryTimer) this.deps.clearTimer(this.retryTimer)
    this.timer = null
    this.retryTimer = null
    this.unsubscribeChannel?.()
  }

  get isShowing(): boolean {
    return this.showing !== null
  }

  /** きっかけを受け取る。すぐには取得せず、まとめてから 1 回だけ確かめる */
  request(trigger: CheckTrigger): void {
    if (this.disposed) return
    if (trigger === 'login') this.generation += 1
    this.pendingTriggers.add(trigger)
    if (this.timer) return
    const now = this.deps.now()
    const wait = Math.max(this.debounceMs, this.lastRunAt + this.minIntervalMs - now)
    this.timer = this.deps.setTimer(() => {
      this.timer = null
      void this.run()
    }, wait)
  }

  /** ポップアップを閉じた（既読にはしない。閉じた時刻は呼び出し側が保存する） */
  dismissed(): void {
    this.showing = null
    this.lastDismissAt = this.deps.now()
  }

  private async run(): Promise<void> {
    if (this.inFlight) {
      this.rerun = true
      return
    }
    const triggers = new Set(this.pendingTriggers)
    this.pendingTriggers.clear()
    if (this.deps.isPopupDisabled()) return
    if (this.showing) return // 出ている間は重ねない。閉じた後の次のきっかけで出す
    const strong = triggers.has('login') || triggers.has('initial')
    if (!strong && this.deps.now() - this.lastDismissAt < this.cooldownMs) return

    const generation = this.generation
    this.inFlight = true
    this.lastRunAt = this.deps.now()
    this.fetchCount += 1
    for (const t of triggers) this.deps.onCheck?.(t)
    let candidates: ProtoNotification[] = []
    try {
      candidates = await this.deps.fetchCandidates()
    } catch {
      candidates = []
    } finally {
      this.inFlight = false
    }

    if (this.disposed) return
    if (generation !== this.generation) {
      // 古い応答（ログインし直す前の取得など）は捨てて、新しい世代で取り直す
      this.rerun = false
      for (const t of triggers) this.pendingTriggers.add(t)
      this.request('idle')
      return
    }
    if (this.rerun) {
      this.rerun = false
      this.pendingTriggers.add('idle')
      for (const t of triggers) this.pendingTriggers.add(t)
      this.request('idle')
      return
    }

    const fresh = candidates.filter((n) => !this.shownElsewhere.has(n.id))
    if (fresh.length === 0) return

    const busy = this.deps.getBusyReason()
    if (busy) {
      this.deps.onDefer?.(busy)
      for (const t of triggers) this.pendingTriggers.add(t)
      this.scheduleRetry()
      return
    }

    const claimedIds = await this.deps.claim(fresh.map((n) => n.id))
    const claimed = new Set(claimedIds)
    const items = fresh.filter((n) => claimed.has(n.id))
    if (this.disposed || generation !== this.generation) {
      // 画面を離れた・ログインし直した: 取った claim を返して、次の世代（再マウント後など）で出せるようにする
      if (claimedIds.length > 0) await this.deps.release?.(claimedIds)
      return
    }
    if (items.length === 0) return
    // claim を待つ間に入力中・ログインの戻り途中になったら、claim を返して後で出す
    const busyAfterClaim = this.deps.getBusyReason()
    if (busyAfterClaim) {
      await this.deps.release?.(claimedIds)
      this.deps.onDefer?.(busyAfterClaim)
      for (const t of triggers) this.pendingTriggers.add(t)
      this.scheduleRetry()
      return
    }
    this.deps.channel?.post({ type: 'shown', ids: items.map((n) => n.id), tabId: this.deps.tabId })
    this.showing = items
    this.deps.onShow(items)
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.disposed) return
    this.retryTimer = this.deps.setTimer(() => {
      this.retryTimer = null
      this.request('idle')
    }, this.retryMs)
  }
}

/** BroadcastChannel が使えるブラウザではそれを、無ければ localStorage の storage イベントでタブ間に「表示済み」を知らせる */
export function createBrowserPopupChannel(name = 'mmq-proto-performance-popup'): PopupChannel {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(name)
    return {
      post: (message) => channel.postMessage(message),
      subscribe: (listener) => {
        const onMessage = (e: MessageEvent<PopupChannelMessage>) => listener(e.data)
        channel.addEventListener('message', onMessage)
        return () => { channel.removeEventListener('message', onMessage); channel.close() }
      },
    }
  }
  const key = `${name}:last`
  return {
    post: (message) => {
      try { window.localStorage.setItem(key, JSON.stringify({ ...message, at: Date.now() })) } catch { /* 試作のため無視 */ }
    },
    subscribe: (listener) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key !== key || !e.newValue) return
        try { listener(JSON.parse(e.newValue) as PopupChannelMessage) } catch { /* 壊れた値は無視 */ }
      }
      window.addEventListener('storage', onStorage)
      return () => window.removeEventListener('storage', onStorage)
    },
  }
}
