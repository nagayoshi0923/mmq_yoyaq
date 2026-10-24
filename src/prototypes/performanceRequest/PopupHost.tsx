/**
 * 「MMQ を開いたときのお知らせ」の試作（公演追加の通知だけ。全体へのお知らせとは別の枠）。
 * - 画面の右下に出す小さな枠。Radix の Dialog を使わないので、スクロールの固定・入力欄からのフォーカスの移動・URL の変更をしない。
 * - 閉じても既読にしない（通知一覧に未読のまま残る）。閉じたものは次の訪問で繰り返し出さない。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BellRing, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { claimPopup, dismissPopup, releasePopup, markRead, popupCandidatesNow, setPopupDisabled } from './actions'
import { getPrototypeBusyReason, onPrototypeIdle } from './busy'
import { findProtoScenario, findProtoStore } from './fixtures'
import { formatWhen, type ProtoNotification } from './notify'
import { createBrowserPopupChannel, PopupCoordinator, type CheckTrigger } from './popupCoordinator'
import { readProtoState, PROTO_STORAGE_SCOPE_LABEL } from './storage'

export const PROTO_LOGIN_EVENT = 'mmq-proto-login-success'

export interface PopupDebugLog {
  at: string
  text: string
}

export function PopupHost({ onLog }: { onLog?: (log: PopupDebugLog) => void }) {
  const location = useLocation()
  const [items, setItems] = useState<ProtoNotification[] | null>(null)
  const coordinatorRef = useRef<PopupCoordinator | null>(null)
  const logRef = useRef(onLog)
  logRef.current = onLog

  useEffect(() => {
    const tabId = `tab-${Math.random().toString(36).slice(2, 8)}`
    const log = (text: string) => logRef.current?.({ at: new Date().toLocaleTimeString('ja-JP'), text })
    const coordinator = new PopupCoordinator({
      now: () => Date.now(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      fetchCandidates: async () => popupCandidatesNow(),
      claim: async (ids) => {
        // 本番の案: navigator.locks で「表示済み」を付ける処理を 1 タブずつにする（試作でも使えるときは使う）
        const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
        if (locks?.request) return locks.request('mmq-proto-performance-popup', async () => claimPopup(ids))
        return claimPopup(ids)
      },
      release: (ids) => releasePopup(ids),
      // 通知一覧を見ている間は、同じ内容を重ねて出さない
      getBusyReason: () => (window.location.pathname.endsWith('/notifications') ? '通知一覧を表示中' : getPrototypeBusyReason()),
      isPopupDisabled: () => readProtoState().settings.popupDisabled,
      onShow: (shown) => { setItems(shown); log(`ポップアップを表示（${shown.length}件）`) },
      onDefer: (reason) => log(`表示を待機: ${reason}`),
      onCheck: (trigger: CheckTrigger) => log(`確認: ${TRIGGER_LABEL[trigger]}`),
      channel: createBrowserPopupChannel(),
      tabId,
    })
    coordinatorRef.current = coordinator
    coordinator.request('initial')

    const onVisibility = () => { if (document.visibilityState === 'visible') coordinator.request('visibility') }
    const onFocus = () => coordinator.request('focus')
    const onLogin = () => coordinator.request('login')
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener(PROTO_LOGIN_EVENT, onLogin)
    const offIdle = onPrototypeIdle(() => coordinator.request('idle'))
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(PROTO_LOGIN_EVENT, onLogin)
      offIdle()
      coordinator.dispose()
      coordinatorRef.current = null
    }
  }, [])

  // ページを移ったとき（URL の変化）。出すのは次の安全なときだけ（入力中なら待つ）
  const firstRoute = useRef(true)
  useEffect(() => {
    if (firstRoute.current) { firstRoute.current = false; return }
    coordinatorRef.current?.request('route')
  }, [location.pathname, location.search])

  const close = () => {
    if (!items) return
    dismissPopup(items.map((n) => n.id))
    coordinatorRef.current?.dismissed()
    setItems(null)
  }

  const content = useMemo(() => items?.map((n) => ({
    n,
    scenario: findProtoScenario(n.scenarioId),
    store: findProtoStore(n.storeId),
  })) ?? [], [items])

  if (!items || items.length === 0) return null

  return (
    <section
      aria-label="公演追加のお知らせ"
      data-testid="proto-popup"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] z-50 rounded-lg border border-amber-300 bg-background shadow-lg"
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-amber-600" aria-hidden />
          登録・リクエストした作品に新しい公演
        </p>
        <button type="button" onClick={close} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="閉じる">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-[50vh] overflow-y-auto divide-y">
        {content.map(({ n, scenario, store }) => (
          <li key={n.id} className="px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">{n.title}</p>
            <p className="font-medium">{scenario?.title}</p>
            <p className="text-xs">{formatWhen(n.date, n.startTime)} ／ {store?.name}</p>
            <div className="mt-1 flex justify-end">
              <Button asChild size="sm" variant="outline">
                <Link to={n.link} onClick={() => { markRead([n.id]); close() }}>公演を見る</Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="space-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
        <p>予約の確定・お席の確保ではありません。ご参加には別途ご予約が必要です。</p>
        <p>試作: 架空の通知です（保存は{PROTO_STORAGE_SCOPE_LABEL}）。閉じても通知一覧には未読で残ります。</p>
        <button
          type="button"
          className="underline"
          onClick={() => { setPopupDisabled(true); close() }}
        >
          今後このお知らせを出さない
        </button>
      </div>
    </section>
  )
}

const TRIGGER_LABEL: Record<CheckTrigger, string> = {
  login: 'ログインに成功',
  initial: '最初に開いた',
  visibility: 'タブに戻った',
  focus: 'ウィンドウに戻った',
  route: 'ページを移った',
  idle: '待機の解除・再確認',
}
