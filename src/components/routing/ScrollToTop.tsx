import React, { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { isNavigationChange, stripNonNavigationParams } from '@/lib/scrollNavigation'

// ページ遷移時にスクロール位置をトップに戻す
// - POP（戻る/進む）: 何もしない（各ページの sessionStorage 復元に任せる）
// - 初回マウント（リロード・新規タブの直リンク）: トップへ飛ばさない
//   → さもないと navType が POP 以外になり、scrollTo(0,0) が sessionStorage 復元より後に効いて潰す
// - それ以外の同一タブ内のパス変更（PUSH/REPLACE）: トップへ
// - ?tab= などの切替は「別の画面」として扱い、これまでどおりトップへ戻す
//
// ⚠️ 画面の中の状態を持つだけの query param は無視する（一覧は src/lib/scrollNavigation.ts）。

export function ScrollToTop() {
  const { pathname, search } = useLocation()
  const navType = useNavigationType()
  const prevKeyRef = React.useRef<string | null>(null)

  useLayoutEffect(() => {
    const currentKey = `${pathname}${stripNonNavigationParams(search)}`
    if (navType === 'POP') {
      prevKeyRef.current = currentKey
      return
    }
    if (isNavigationChange(prevKeyRef.current, pathname, search)) {
      const container = document.querySelector('[data-scroll-container]') as HTMLElement | null
      if (container) {
        container.scrollTop = 0
      } else {
        window.scrollTo(0, 0)
      }
      // PUSH遷移では新ページの保存済みスクロール位置を削除して復元を抑制
      sessionStorage.removeItem(`route:${pathname}${search}ScrollY`)
    }
    prevKeyRef.current = currentKey
  }, [pathname, search, navType])

  return null
}
