// スクロール位置の保存と復元（汎用版）
//
// アプリ全体では `RouteScrollRestorationProvider`（AppRoot）が pathname+search ごとに本フックを呼ぶ。
// データ取得中は各画面から `useReportRouteScrollRestoration` で isLoading / isFetching を報告する。

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'

interface UseScrollRestorationOptions {
  /** ページ識別用のキー（デフォルト: 'page'） */
  pageKey?: string
  /** データ読み込み中かどうか */
  isLoading?: boolean
  /**
   * バックグラウンド再取得中。レイアウトが一瞬崩れて scrollY=0 が保存されるのを防ぐ
   */
  isFetching?: boolean
}

/**
 * ルート単位のスクロール保存キー（`RouteScrollRestorationProvider` と一致させる）
 * pathname は先頭スラッシュ付き、search は `?foo=bar` 形式（空なら省略）
 */
export function scrollRestorationPageKeyFromLocation(pathname: string, search: string): string {
  return `route:${pathname}${search || ''}`
}

/** 現在の URL に対応するキーで即座に保存（遷移直前の明示保存用） */
export function saveScrollPositionForCurrentUrl(): void {
  if (typeof window === 'undefined') return
  saveScrollPositionForPage(
    scrollRestorationPageKeyFromLocation(window.location.pathname, window.location.search || '')
  )
}

/** sessionStorage のキーは useScrollRestoration と同じ規則（一覧→詳細の直前に明示保存する用） */
export function saveScrollPositionForPage(pageKey: string): void {
  try {
    sessionStorage.setItem(`${pageKey}ScrollY`, window.scrollY.toString())
  } catch {
    // ignore
  }
}

export function useScrollRestoration(options: UseScrollRestorationOptions = {}) {
  const { pageKey = 'page', isLoading = false, isFetching = false } = options
  const suspendPersistence = isLoading || isFetching

  const scrollYKey = `${pageKey}ScrollY`
  const restoringRef = useRef(false)
  const prevIsFetchingRef = useRef(false)
  /**
   * プログラムの scrollTo 以外で一度でも scroll が走ったら true。
   * 上/下どちらに動かしたかは見ない（位置ヒューリスティックは使わない）。
   */
  const userAdjustedScrollRef = useRef(false)

  // ブラウザのデフォルトのスクロール復元を無効化
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
  }, [])

  useEffect(() => {
    if (isLoading) userAdjustedScrollRef.current = false
  }, [isLoading])

  // スクロール位置の保存 + ユーザー操作検知（復元中の scroll はプログラム起因なので無視）
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
          sessionStorage.setItem(scrollYKey, window.scrollY.toString())
        }
      }, 200)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimer)
    }
  }, [scrollYKey, suspendPersistence])

  // リロード直前は debounce 200ms が間に合わないことがある → 即フラッシュ
  useEffect(() => {
    const flush = () => {
      if (restoringRef.current) return
      try {
        sessionStorage.setItem(scrollYKey, window.scrollY.toString())
      } catch {
        /* ignore */
      }
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

  // データ読み込み完了後にスクロール位置を復元（リトライ付き）
  // useLayoutEffect でペイント前に試行し、一覧→戻る時のチラつきを抑える
  useLayoutEffect(() => {
    if (isLoading) return

    const savedY = sessionStorage.getItem(scrollYKey)
    if (!savedY) return

    const targetY = parseInt(savedY, 10)
    if (targetY <= 0) return

    restoringRef.current = true
    let attempts = 0
    const maxAttempts = 40
    let timerId: ReturnType<typeof setTimeout> | undefined
    let rafId: number | undefined

    const tryRestore = () => {
      attempts++

      const maxScroll = document.documentElement.scrollHeight - window.innerHeight

      if (maxScroll >= targetY || attempts >= maxAttempts) {
        window.scrollTo(0, Math.min(targetY, Math.max(0, maxScroll)))
        setTimeout(() => {
          restoringRef.current = false
        }, 300)
      } else {
        timerId = setTimeout(tryRestore, 50)
      }
    }

    // レイアウト確定後に 1 フレーム遅らせて試行
    rafId = requestAnimationFrame(tryRestore)

    return () => {
      if (timerId) clearTimeout(timerId)
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      restoringRef.current = false
    }
  }, [isLoading, scrollYKey])

  // React Query の refetch 完了時は isLoading が true にならないため、上の effect が走らず
  // ドキュメント高さの変化で scroll が 0 付近に落ちたままになる。fetch 終了時に必ず復元する。
  useLayoutEffect(() => {
    if (isLoading) {
      prevIsFetchingRef.current = isFetching
      return
    }

    const wasFetching = prevIsFetchingRef.current
    prevIsFetchingRef.current = isFetching

    if (!wasFetching || isFetching) return

    const raw = sessionStorage.getItem(scrollYKey)
    if (!raw) return
    const targetY = parseInt(raw, 10)
    if (targetY <= 0) return

    restoringRef.current = true
    let attempts = 0
    const maxAttempts = 30
    let timerId: ReturnType<typeof setTimeout> | undefined

    const tryRestore = () => {
      attempts++
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      if (maxScroll >= targetY - 8 || attempts >= maxAttempts) {
        window.scrollTo(0, Math.min(targetY, Math.max(0, maxScroll)))
        setTimeout(() => {
          restoringRef.current = false
        }, 200)
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

  // 画像・非同期レンダーで document 高さが後から伸びると、初回復元が届かないことがある
  useEffect(() => {
    if (isLoading) return
    const raw = sessionStorage.getItem(scrollYKey)
    if (!raw) return
    const targetY = parseInt(raw, 10)
    if (targetY <= 0) return

    const delays = [300, 800, 2000]
    const ids = delays.map((ms) =>
      setTimeout(() => {
        if (restoringRef.current || userAdjustedScrollRef.current) return
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight
        if (maxScroll < targetY - 8) return
        const y = Math.min(targetY, Math.max(0, maxScroll))
        // ユーザーが一度でもスクロールしていたらここには来ない。来るのは「高さ不足で届かず残っている」だけ。
        if (Math.abs(window.scrollY - y) <= 12) return
        restoringRef.current = true
        window.scrollTo(0, y)
        setTimeout(() => {
          restoringRef.current = false
        }, 200)
      }, ms)
    )
    return () => ids.forEach(clearTimeout)
  }, [isLoading, scrollYKey])

  // スクロール位置をクリアする関数を返す
  const clearScrollPosition = useCallback(() => {
    sessionStorage.removeItem(scrollYKey)
  }, [scrollYKey])

  return { clearScrollPosition }
}
