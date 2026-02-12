// スクロール位置の保存と復元（汎用版）

import { useEffect, useRef, useCallback } from 'react'

interface UseScrollRestorationOptions {
  /** ページ識別用のキー（デフォルト: 'page'） */
  pageKey?: string
  /** データ読み込み中かどうか */
  isLoading?: boolean
}

export function useScrollRestoration(options: UseScrollRestorationOptions = {}) {
  const { pageKey = 'page', isLoading = false } = options
  
  const scrollYKey = `${pageKey}ScrollY`
  const restoringRef = useRef(false)

  // ブラウザのデフォルトのスクロール復元を無効化
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
  }, [])

  // スクロール位置を継続的に保存（復元中はスキップ）
  useEffect(() => {
    let scrollTimer: NodeJS.Timeout
    const handleScroll = () => {
      if (restoringRef.current) return
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        if (!restoringRef.current) {
          sessionStorage.setItem(scrollYKey, window.scrollY.toString())
        }
      }, 200)
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimer)
      // アンマウント時に現在位置を保存
      if (!restoringRef.current) {
        sessionStorage.setItem(scrollYKey, window.scrollY.toString())
      }
    }
  }, [scrollYKey])

  // データ読み込み完了後にスクロール位置を復元（リトライ付き）
  useEffect(() => {
    if (isLoading) return

    const savedY = sessionStorage.getItem(scrollYKey)
    if (!savedY) return
    
    const targetY = parseInt(savedY, 10)
    if (targetY <= 0) return

    restoringRef.current = true
    let attempts = 0
    const maxAttempts = 20
    let timerId: NodeJS.Timeout

    const tryRestore = () => {
      attempts++
      
      // ドキュメントの高さがターゲット位置に達しているか確認
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      
      if (maxScroll >= targetY || attempts >= maxAttempts) {
        window.scrollTo(0, Math.min(targetY, maxScroll))
        // 少し待ってから復元完了フラグを解除（直後のscrollイベントをスキップ）
        setTimeout(() => {
          restoringRef.current = false
        }, 300)
      } else {
        // まだページが短い → 50msごとにリトライ
        timerId = setTimeout(tryRestore, 50)
      }
    }

    // 最初の復元を少し遅らせる（DOM描画を待つ）
    timerId = setTimeout(tryRestore, 100)

    return () => {
      clearTimeout(timerId)
      restoringRef.current = false
    }
  }, [isLoading, scrollYKey])

  // スクロール位置をクリアする関数を返す
  const clearScrollPosition = useCallback(() => {
    sessionStorage.removeItem(scrollYKey)
  }, [scrollYKey])

  return { clearScrollPosition }
}
