import { useEffect, useState, useCallback } from 'react'

interface UsePageStateOptions {
  pageKey: string // ページを識別するキー（例: 'staff', 'schedule', 'sales'）
  scrollRestoration?: boolean // スクロール位置の復元を有効にするか（デフォルト: true）
  stateKeys?: string[] // 保存する状態のキー（例: ['searchTerm', 'statusFilter']）
}

interface PageState {
  [key: string]: unknown
}

/**
 * ページの状態（スクロール位置、フィルタ、検索条件など）を自動保存・復元するカスタムフック
 * 
 * @example
 * ```tsx
 * function MyPage() {
 *   const { restoreState, saveState } = usePageState({
 *     pageKey: 'mypage',
 *     stateKeys: ['searchTerm', 'statusFilter']
 *   })
 * 
 *   const [searchTerm, setSearchTerm] = useState(() => restoreState('searchTerm', ''))
 *   const [statusFilter, setStatusFilter] = useState(() => restoreState('statusFilter', 'all'))
 * 
 *   useEffect(() => { saveState('searchTerm', searchTerm) }, [searchTerm])
 *   useEffect(() => { saveState('statusFilter', statusFilter) }, [statusFilter])
 * }
 * ```
 */
export function usePageState(options: UsePageStateOptions) {
  const { pageKey, scrollRestoration = true } = options
  const [loading, setLoading] = useState(true)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)

  // スクロール位置を復元する関数
  const restoreScrollPosition = useCallback(() => {
    const savedY = sessionStorage.getItem(`${pageKey}_scrollY`)
    const savedTime = sessionStorage.getItem(`${pageKey}_scrollTime`)
    
    if (savedY && savedTime) {
      const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
      // 10秒以内のスクロール位置のみ復元
      if (timeSinceScroll < 10000) {
        setTimeout(() => {
          window.scrollTo(0, parseInt(savedY, 10))
        }, 100)
      }
    }
  }, [pageKey])

  // スクロール位置を保存する関数
  const saveScrollPosition = useCallback(() => {
    sessionStorage.setItem(`${pageKey}_scrollY`, window.scrollY.toString())
    sessionStorage.setItem(`${pageKey}_scrollTime`, Date.now().toString())
  }, [pageKey])

  // 状態を復元する関数
  const restoreState = useCallback(<T = any>(key: string, defaultValue: T): T => {
    const saved = sessionStorage.getItem(`${pageKey}_${key}`)
    if (saved === null) return defaultValue
    
    try {
      // JSON形式で保存されている場合はパース
      return JSON.parse(saved) as T
    } catch {
      // 文字列として保存されている場合はそのまま返す
      return saved as T
    }
  }, [pageKey])

  // 状態を保存する関数
  const saveState = useCallback((key: string, value: unknown) => {
    if (value === null || value === undefined) {
      sessionStorage.removeItem(`${pageKey}_${key}`)
    } else if (typeof value === 'string') {
      sessionStorage.setItem(`${pageKey}_${key}`, value)
    } else {
      // オブジェクトや配列はJSON形式で保存
      sessionStorage.setItem(`${pageKey}_${key}`, JSON.stringify(value))
    }
  }, [pageKey])

  // 全ての状態をクリアする関数
  const clearState = useCallback(() => {
    const keysToRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith(`${pageKey}_`)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key))
  }, [pageKey])

  // スクロール位置の保存設定
  useEffect(() => {
    if (!scrollRestoration) return

    // ブラウザのデフォルトスクロール復元を無効化
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }

    let scrollTimer: NodeJS.Timeout
    const handleScroll = () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        saveScrollPosition()
      }, 100)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'auto'
      }
    }
  }, [scrollRestoration, saveScrollPosition])

  // マウント時のスクロール位置復元
  useEffect(() => {
    if (scrollRestoration) {
      restoreScrollPosition()
    }
  }, [scrollRestoration, restoreScrollPosition])

  // データロード完了後のスクロール位置復元
  useEffect(() => {
    if (scrollRestoration && !loading && !initialLoadComplete) {
      setInitialLoadComplete(true)
      setTimeout(() => {
        restoreScrollPosition()
      }, 200)
    }
  }, [scrollRestoration, loading, initialLoadComplete, restoreScrollPosition])

  return {
    restoreState,
    saveState,
    clearState,
    setLoading,
    loading,
    initialLoadComplete
  }
}

/**
 * 簡易版: スクロール位置のみを保存・復元するフック
 */
export function useScrollRestoration(pageKey: string, loading = false) {
  const { setLoading: setLoadingState } = usePageState({
    pageKey,
    scrollRestoration: true
  })

  useEffect(() => {
    setLoadingState(loading)
  }, [loading, setLoadingState])
}

