import { useEffect } from 'react'
import { useOrganization } from '@/hooks/useOrganization'

/**
 * 組織のファビコンを動的に設定するフック
 * 組織設定にfavicon_urlがあればそれを使用し、なければデフォルトを使用
 */
export function useFavicon() {
  const { organization } = useOrganization()

  useEffect(() => {
    const faviconUrl = organization?.favicon_url

    // 既存のファビコンリンクを取得または作成
    let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
    
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }

    if (faviconUrl) {
      link.href = faviconUrl
      link.type = faviconUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/x-icon'
    } else {
      // デフォルトファビコン（設定なしの場合は空にして404を防ぐ）
      // または、プロジェクトにデフォルトファビコンがあればそのパスを指定
      link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect fill="%23E60012" width="32" height="32" rx="4"/><text x="16" y="22" text-anchor="middle" fill="white" font-size="16" font-weight="bold">M</text></svg>'
      link.type = 'image/svg+xml'
    }
  }, [organization])
}
