import ReactDOM from 'react-dom/client'
import App from './AppRoot.tsx'
import './index.css'
import { initSentry } from '@/lib/sentry'
import { initVersionCheck, clearChunkReloadFlag } from '@/utils/lazyWithRetry'

// パッシブイベントリスナーの警告を抑制
// UIライブラリ（Radix UI等）がtouchstartにpassive: falseを使用するため
if (typeof window !== 'undefined') {
  const originalAddEventListener = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = function(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ) {
    if (type === 'touchstart' || type === 'touchmove' || type === 'wheel') {
      if (typeof options === 'boolean') {
        options = { capture: options, passive: true }
      } else if (typeof options === 'object' && options !== null) {
        if (options.passive === undefined) {
          options = { ...options, passive: true }
        }
      } else {
        options = { passive: true }
      }
    }
    return originalAddEventListener.call(this, type, listener, options)
  }
}

// Sentry エラー監視を初期化（VITE_SENTRY_DSN が設定されている場合のみ有効）
initSentry()

// 古いリロードフラグをクリア（後方互換）
clearChunkReloadFlag()

// バージョン変更検知を初期化
// チャンク読み込みエラー時に新バージョンを検知したら更新バナーを表示する
initVersionCheck(() => {
  showUpdateBanner()
})

/**
 * 更新通知バナーを表示する
 * リロードを強制せず、ユーザーが自分のタイミングで更新できる
 */
function showUpdateBanner(): void {
  // 既にバナーが表示されていたら何もしない
  if (document.getElementById('app-update-banner')) return

  const banner = document.createElement('div')
  banner.id = 'app-update-banner'
  banner.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 99999;
    background: #18181b;
    color: white;
    padding: 12px 20px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.24);
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    max-width: calc(100vw - 32px);
    animation: slideUp 0.3s ease-out;
  `

  banner.innerHTML = `
    <span style="flex:1">新しいバージョンが利用可能です</span>
    <button id="app-update-btn" style="
      background: white;
      color: #18181b;
      border: none;
      padding: 6px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    ">更新する</button>
    <button id="app-update-dismiss" style="
      background: none;
      border: none;
      color: #a1a1aa;
      cursor: pointer;
      padding: 4px;
      font-size: 18px;
      line-height: 1;
    ">&times;</button>
  `

  // アニメーション用のスタイルを追加
  if (!document.getElementById('app-update-style')) {
    const style = document.createElement('style')
    style.id = 'app-update-style'
    style.textContent = `
      @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `
    document.head.appendChild(style)
  }

  document.body.appendChild(banner)

  document.getElementById('app-update-btn')?.addEventListener('click', () => {
    window.location.reload()
  })
  document.getElementById('app-update-dismiss')?.addEventListener('click', () => {
    banner.remove()
  })
}

// Service Worker を解除するのは基本的に開発時のみ
// 本番で毎回キャッシュを削除すると表示速度が落ちるため、必要な場合だけ明示的に無効化する
const shouldDisableServiceWorker =
  import.meta.env.DEV || import.meta.env.VITE_DISABLE_SW === 'true'

if (shouldDisableServiceWorker && 'serviceWorker' in navigator) {
  // すべての Service Worker を解除
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister()
      console.log('🧹 Service Worker unregistered')
    }
  })

  // workbox のキャッシュを削除
  if ('caches' in window) {
    caches.keys().then((cacheNames) => {
      cacheNames.forEach((cacheName) => {
        if (cacheName.includes('workbox')) {
          caches.delete(cacheName)
          console.log('🧹 Cache deleted:', cacheName)
        }
      })
    })
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
