// スクロール位置の保存と復元

import { useEffect, useLayoutEffect } from 'react'

export function useScrollRestoration(isLoading: boolean) {
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
        sessionStorage.setItem('scheduleScrollY', window.scrollY.toString())
        sessionStorage.setItem('scheduleScrollTime', Date.now().toString())
      }, 100)
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      // scrollRestorationはmanualのままにしておく
    }
  }, [])

  // マウント時にスクロール位置を即座に復元（リロード直後のみ）
  useLayoutEffect(() => {
    const savedY = sessionStorage.getItem('scheduleScrollY')
    const savedTime = sessionStorage.getItem('scheduleScrollTime')
    
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
  }, []) // マウント時のみ実行

  // データ読み込み完了後に再度復元
  useEffect(() => {
    if (!isLoading) {
      const savedY = sessionStorage.getItem('scheduleScrollY')
      const savedTime = sessionStorage.getItem('scheduleScrollTime')
      
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
  }, [isLoading])

  // スクロール位置をクリアする関数を返す
  const clearScrollPosition = () => {
    sessionStorage.removeItem('scheduleScrollY')
    sessionStorage.removeItem('scheduleScrollTime')
  }

  return { clearScrollPosition }
}

