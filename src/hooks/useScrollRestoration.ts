// スクロール位置の保存と復元（汎用版）
//
// アプリ全体では `RouteScrollRestorationProvider`（AppRoot）が pathname+search ごとに本フックを呼ぶ。
// データ取得中は各画面から `useReportRouteScrollRestoration` で isLoading / isFetching を報告する。
//
// stickyLayout ページ（AppLayout stickyLayout={true}）はウィンドウではなく内側 div がスクロールする。
// その div には `data-scroll-container` 属性が付いており、本フックはそれを優先的に使用する。

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { stripNonNavigationParams } from '@/lib/scrollNavigation'

interface UseScrollRestorationOptions {
  pageKey?: string
  isLoading?: boolean
  isFetching?: boolean
}

/**
 * 保存・復元の単位。画面の中の状態だけを持つ query（希望店舗 stores・絞り込み・選んだ公演 event など。
 * 一覧は src/lib/scrollNavigation.ts）は外す。ScrollToTop と同じ「同じ画面」の判定にそろえる。
 * 2026-10-22（QW-20261022-013）: 外さないと、希望店舗のチップを押して URL が変わるたびに、
 * その組み合わせで前に保存した位置へ飛び、選んだ店舗が画面の外へ追い出されていた。
 */
export function scrollRestorationPageKeyFromLocation(pathname: string, search: string): string {
  return `route:${pathname}${stripNonNavigationParams(search || '')}`
}

/** 利用者が自分で動かした・操作したとみなす入力（スクロールのための指・ホイール・キー、押す操作） */
const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

export function saveScrollPositionForCurrentUrl(): void {
  if (typeof window === 'undefined') return
  saveScrollPositionForPage(
    scrollRestorationPageKeyFromLocation(window.location.pathname, window.location.search || '')
  )
}

export function saveScrollPositionForPage(pageKey: string): void {
  try {
    const container = document.querySelector('[data-scroll-container]') as HTMLElement | null
    const scrollY = container ? container.scrollTop : window.scrollY
    sessionStorage.setItem(`${pageKey}ScrollY`, scrollY.toString())
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// スクロールターゲット（stickyLayout の内側 div か window か）
// ---------------------------------------------------------------------------
interface ScrollTarget {
  getScrollY: () => number
  scrollTo: (y: number) => void
  getMaxScroll: () => number
  addScrollListener: (fn: EventListener) => () => void
}

function resolveScrollTarget(): ScrollTarget {
  const container = document.querySelector('[data-scroll-container]') as HTMLElement | null
  if (container) {
    return {
      getScrollY: () => container.scrollTop,
      scrollTo: (y) => { container.scrollTop = y },
      getMaxScroll: () => container.scrollHeight - container.clientHeight,
      addScrollListener: (fn) => {
        container.addEventListener('scroll', fn, { passive: true })
        return () => container.removeEventListener('scroll', fn)
      },
    }
  }
  return {
    getScrollY: () => window.scrollY,
    scrollTo: (y) => window.scrollTo(0, y),
    getMaxScroll: () => document.documentElement.scrollHeight - window.innerHeight,
    addScrollListener: (fn) => {
      window.addEventListener('scroll', fn, { passive: true })
      return () => window.removeEventListener('scroll', fn)
    },
  }
}

export function useScrollRestoration(options: UseScrollRestorationOptions = {}) {
  const { pageKey = 'page', isLoading = false, isFetching = false } = options
  const suspendPersistence = isLoading || isFetching

  const scrollYKey = `${pageKey}ScrollY`
  const restoringRef = useRef(false)
  const prevIsFetchingRef = useRef(false)
  const userAdjustedScrollRef = useRef(false)
  // 利用者の入力の通し番号。この画面に来た時点・再取得を始めた時点から増えていれば、利用者が位置を決めたとみなし復元しない
  const inputSeqRef = useRef(0)
  const enteredSeqRef = useRef(0)
  // この画面で初回の復元を済ませた（または利用者の操作で取りやめた）キー。読込が何度終わっても 2 回目は飛ばさない
  const settledKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const onInput = () => { inputSeqRef.current++ }
    for (const type of USER_INPUT_EVENTS) document.addEventListener(type, onInput, { capture: true, passive: true })
    return () => {
      for (const type of USER_INPUT_EVENTS) document.removeEventListener(type, onInput, { capture: true })
    }
  }, [])

  // 画面（キー）が変わった時点の入力の番号を控える。復元の effect より先に宣言する
  useLayoutEffect(() => {
    enteredSeqRef.current = inputSeqRef.current
    settledKeyRef.current = null
  }, [scrollYKey])
  const userMovedSinceEnter = () => inputSeqRef.current !== enteredSeqRef.current

  // ブラウザのデフォルトのスクロール復元を無効化
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
  }, [])

  useEffect(() => {
    if (isLoading) userAdjustedScrollRef.current = false
  }, [isLoading])

  // スクロール位置の保存
  // document レベルで capture 登録することで、lazy load 前に useEffect が走っても
  // [data-scroll-container] の scroll イベントを確実に拾える。
  // 保存時に resolveScrollTarget() を再評価して正しい位置を取得する。
  useEffect(() => {
    let scrollTimer: NodeJS.Timeout

    const handleScroll = () => {
      if (!restoringRef.current) {
        userAdjustedScrollRef.current = true
      }
      if (restoringRef.current || suspendPersistence) return
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        if (!restoringRef.current && !suspendPersistence) {
          const target = resolveScrollTarget()
          sessionStorage.setItem(scrollYKey, target.getScrollY().toString())
        }
      }, 200)
    }

    // capture: true で document に登録 → container・window 両方のスクロールを捕捉
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', handleScroll, { capture: true })
      clearTimeout(scrollTimer)
    }
  }, [scrollYKey, suspendPersistence])

  // リロード直前にスクロール位置を即フラッシュ
  useEffect(() => {
    const flush = () => {
      if (restoringRef.current) return
      try {
        const target = resolveScrollTarget()
        sessionStorage.setItem(scrollYKey, target.getScrollY().toString())
      } catch { /* ignore */ }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [scrollYKey])

  // 初回スクロール復元（ペイント前・データ読み込み完了後に実行）。1 画面につき 1 回だけ。
  // 読込の間に利用者がスクロール・操作していたら、その位置を優先して復元しない
  useLayoutEffect(() => {
    if (isLoading) return
    if (settledKeyRef.current === scrollYKey) return
    if (userMovedSinceEnter()) {
      settledKeyRef.current = scrollYKey
      return
    }

    const savedY = sessionStorage.getItem(scrollYKey)
    const targetY = savedY ? parseInt(savedY, 10) : 0
    if (!savedY || !(targetY > 0)) {
      settledKeyRef.current = scrollYKey
      return
    }

    restoringRef.current = true
    let attempts = 0
    const maxAttempts = 40
    let timerId: ReturnType<typeof setTimeout> | undefined
    const target = resolveScrollTarget()

    const tryRestore = () => {
      attempts++
      if (userMovedSinceEnter()) {
        settledKeyRef.current = scrollYKey
        restoringRef.current = false
        return
      }
      const maxScroll = target.getMaxScroll()

      if (maxScroll >= targetY) {
        target.scrollTo(Math.min(targetY, Math.max(0, maxScroll)))
        settledKeyRef.current = scrollYKey
        setTimeout(() => { restoringRef.current = false }, 300)
      } else if (attempts >= maxAttempts) {
        // コンテンツ不足でタイムアウト → 0 に強制しない。ポーリングフォールバックに委ねる
        restoringRef.current = false
      } else {
        timerId = setTimeout(tryRestore, 50)
      }
    }

    const rafId = requestAnimationFrame(tryRestore)
    return () => {
      if (timerId) clearTimeout(timerId)
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      restoringRef.current = false
    }
  }, [isLoading, scrollYKey])

  // React Query refetch 完了時の復元（再取得の間に利用者が操作していたら、その位置を優先して戻さない）
  const fetchStartSeqRef = useRef(0)
  useLayoutEffect(() => {
    if (isLoading) {
      prevIsFetchingRef.current = isFetching
      return
    }
    const wasFetching = prevIsFetchingRef.current
    prevIsFetchingRef.current = isFetching
    if (!wasFetching && isFetching) fetchStartSeqRef.current = inputSeqRef.current
    if (!wasFetching || isFetching) return
    if (inputSeqRef.current !== fetchStartSeqRef.current) return

    const raw = sessionStorage.getItem(scrollYKey)
    if (!raw) return
    const targetY = parseInt(raw, 10)
    if (targetY <= 0) return

    restoringRef.current = true
    let attempts = 0
    const maxAttempts = 30
    let timerId: ReturnType<typeof setTimeout> | undefined
    const target = resolveScrollTarget()

    const tryRestore = () => {
      attempts++
      const maxScroll = target.getMaxScroll()
      if (maxScroll >= targetY - 8) {
        target.scrollTo(Math.min(targetY, Math.max(0, maxScroll)))
        setTimeout(() => { restoringRef.current = false }, 200)
      } else if (attempts >= maxAttempts) {
        restoringRef.current = false
      } else {
        timerId = setTimeout(tryRestore, 40)
      }
    }

    tryRestore()
    return () => {
      if (timerId) clearTimeout(timerId)
      restoringRef.current = false
    }
  }, [isFetching, isLoading, scrollYKey])

  // ポーリングフォールバック
  // データ読み込みに時間がかかるページ（useReportRouteScrollRestoration 未使用含む）向け。
  // コンテンツが伸びるまで 100ms ごとにチェックし、伸びたら即座に復元する。最大 10 秒。
  useEffect(() => {
    if (isLoading || settledKeyRef.current === scrollYKey) return
    const raw = sessionStorage.getItem(scrollYKey)
    if (!raw) return
    const targetY = parseInt(raw, 10)
    if (targetY <= 0) return

    let attempts = 0
    const maxAttempts = 100  // 100 × 100ms = 10秒
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = () => {
      // ユーザーが手動スクロール・操作済み、またはこの画面の復元が済んだ → 復元不要
      if (userAdjustedScrollRef.current || userMovedSinceEnter() || settledKeyRef.current === scrollYKey) return

      // 他の復元処理が進行中 → 待機して再試行
      if (restoringRef.current) {
        attempts++
        if (attempts < maxAttempts) timer = setTimeout(poll, 100)
        return
      }

      // ポーリング時点で動的にターゲットを解決（lazy load 後に container が現れる場合を考慮）
      const target = resolveScrollTarget()
      const maxScroll = target.getMaxScroll()
      if (maxScroll >= targetY - 8) {
        // コンテンツが十分な高さになった
        const y = Math.min(targetY, Math.max(0, maxScroll))
        if (Math.abs(target.getScrollY() - y) > 12) {
          // まだ復元されていない → 復元する
          restoringRef.current = true
          target.scrollTo(y)
          setTimeout(() => { restoringRef.current = false }, 200)
        }
        settledKeyRef.current = scrollYKey
        // 既に正しい位置にある（useLayoutEffect が成功済み）場合も終了
        return
      }

      // まだ短い → 再試行
      attempts++
      if (attempts < maxAttempts) timer = setTimeout(poll, 100)
    }

    // useLayoutEffect のリトライループより少し遅らせてスタート
    timer = setTimeout(poll, 100)
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isLoading, scrollYKey])

  const clearScrollPosition = useCallback(() => {
    sessionStorage.removeItem(scrollYKey)
  }, [scrollYKey])

  return { clearScrollPosition }
}
