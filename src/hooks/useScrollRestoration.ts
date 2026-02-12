// スクロール位置の保存と復元（汎用版）

import { useEffect, useRef } from 'react'

interface UseScrollRestorationOptions {
  /** ページ識別用のキー（デフォルト: 'page'） */
  pageKey?: string
  /** データ読み込み中かどうか */
  isLoading?: boolean
}

export function useScrollRestoration(options: UseScrollRestorationOptions = {}) {
  const { pageKey = 'page', isLoading = false } = options
  
  const scrollYKey = `${pageKey}ScrollY`
  const restoredRef = useRef(false)
  const scrollListenerAttached = useRef(false)

  // ブラウザのデフォルトのスクロール復元を無効化
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
  }, [])

  // アンマウント時にスクロール位置を確実に保存
  useEffect(() => {
    return () => {
      sessionStorage.setItem(scrollYKey, window.scrollY.toString())
    }
  }, [scrollYKey])

  // スクロール位置を保存するリスナーを設定（復元完了後に開始）
  useEffect(() => {
    if (isLoading || !restoredRef.current) return

    let scrollTimer: NodeJS.Timeout
    const handleScroll = () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        sessionStorage.setItem(scrollYKey, window.scrollY.toString())
      }, 150)
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    scrollListenerAttached.current = true
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimer)
      scrollListenerAttached.current = false
    }
  }, [scrollYKey, isLoading])

  // データ読み込み完了後にスクロール位置を復元
  useEffect(() => {
    if (isLoading) return

    const savedY = sessionStorage.getItem(scrollYKey)
    
    if (savedY) {
      const targetY = parseInt(savedY, 10)
      if (targetY > 0) {
        // DOMが描画されるのを待ってから復元（requestAnimationFrame + 少し遅延）
        const rafId = requestAnimationFrame(() => {
          setTimeout(() => {
            window.scrollTo(0, targetY)
            // 復元完了後にスクロール保存を開始するフラグを立てる
            restoredRef.current = true
          }, 50)
        })
        return () => cancelAnimationFrame(rafId)
      }
    }
    
    // 保存されたスクロール位置がない場合もフラグを立てる
    restoredRef.current = true
  }, [isLoading, scrollYKey])

  // スクロール位置をクリアする関数を返す
  const clearScrollPosition = () => {
    sessionStorage.removeItem(scrollYKey)
  }

  return { clearScrollPosition }
}
