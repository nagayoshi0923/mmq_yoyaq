// スクロール位置の保存と復元（汎用版）

import { useEffect, useLayoutEffect } from 'react'

// useLayoutEffectのフォールバック
const useLayoutEffectSafe = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface UseScrollRestorationOptions {
  /** ページ識別用のキー（デフォルト: 'page'） */
  pageKey?: string
  /** データ読み込み中かどうか */
  isLoading?: boolean
}

export function useScrollRestoration(options: UseScrollRestorationOptions = {}) {
  const { pageKey = 'page', isLoading = false } = options
  
  const scrollYKey = `${pageKey}ScrollY`
  const scrollTimeKey = `${pageKey}ScrollTime`

  // スクロール位置を保持（シンプル版）
  useEffect(() => {
    // ブラウザのデフォルトのスクロール復元を無効化
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
    
    // スクロール位置を定期的に保存（デバウンス付き）
    let scrollTimer: NodeJS.Timeout
    const handleScroll = () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        sessionStorage.setItem(scrollYKey, window.scrollY.toString())
        sessionStorage.setItem(scrollTimeKey, Date.now().toString())
      }, 100)
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      // scrollRestorationはmanualのままにしておく
    }
  }, [scrollYKey, scrollTimeKey])

  // マウント時にスクロール位置を即座に復元（リロード直後のみ）
  useLayoutEffectSafe(() => {
    const savedY = sessionStorage.getItem(scrollYKey)
    const savedTime = sessionStorage.getItem(scrollTimeKey)
    
    if (savedY && savedTime) {
      const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
      // 10秒以内のスクロール位置のみ復元（リロード直後と判定）
      if (timeSinceScroll < 10000) {
        // 少し待ってからスクロール位置を復元
        setTimeout(() => {
          window.scrollTo(0, parseInt(savedY, 10))
        }, 100)
      }
    }
  }, [scrollYKey, scrollTimeKey]) // マウント時のみ実行

  // データ読み込み完了後に再度復元
  useEffect(() => {
    if (!isLoading) {
      const savedY = sessionStorage.getItem(scrollYKey)
      const savedTime = sessionStorage.getItem(scrollTimeKey)
      
      if (savedY && savedTime) {
        const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
        // 10秒以内のスクロール位置のみ復元（リロード直後と判定）
        if (timeSinceScroll < 10000) {
          // データ読み込み後にスクロール復元
          setTimeout(() => {
            window.scrollTo(0, parseInt(savedY, 10))
          }, 200)
        }
      }
    }
  }, [isLoading, scrollYKey, scrollTimeKey])

  // スクロール位置をクリアする関数を返す
  const clearScrollPosition = () => {
    sessionStorage.removeItem(scrollYKey)
    sessionStorage.removeItem(scrollTimeKey)
  }

  return { clearScrollPosition }
}

