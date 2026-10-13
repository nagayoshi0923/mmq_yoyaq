import ReactDOM from 'react-dom/client'
import App from './AppRoot.tsx'
import './index.css'
import { initSentry } from '@/lib/sentry'
import { initVersionCheck, clearChunkReloadFlag, isChunkLoadError } from '@/utils/lazyWithRetry'
import { installSilentAppUpdate, markUpdateAvailable } from '@/lib/silentAppUpdate'
import { isPushServiceWorker } from '@/lib/webPushSupport'

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

// 新しい版は、お知らせを出さずに自動で切り替える（次の画面遷移・タブに戻ったとき・何も入力していないとき）。
// 入力の途中では切り替えず、次の遷移まで待つ。判定は silentAppUpdate.ts を参照。
installSilentAppUpdate()

// Vite の modulepreload 失敗（<link rel="modulepreload"> が 404 になるケース）を捕捉する。
// デプロイ後の古いチャンク参照なので、新しい版への切り替えを予約する。
window.addEventListener('vite:preloadError', () => {
  markUpdateAvailable()
})

// lazyWithRetry でカバーされない静的 import やベンダーチャンクの読み込みエラーを捕捉する
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && isChunkLoadError(event.reason)) {
    event.preventDefault()
    markUpdateAvailable()
  }
})

// 古いリロードフラグをクリア（後方互換）
clearChunkReloadFlag()

// バージョン変更検知を初期化（新しい版を見つけたら切り替えを予約する）
initVersionCheck(() => {
  markUpdateAvailable()
})

// PWA プラグインは現在使用していないため、古い Service Worker が残っている場合は解除する。
// 古い SW がナビゲーションリクエストをキャッシュしていると、デプロイ後に古い HTML が返され、
// バージョンチェックリロードと Supabase のトークンリフレッシュが競合してログインが切れる原因になる。
// 例外: プッシュ通知だけの /sw.js（貸切グループ 段階 3）。画面のファイルを一切キャッシュしない（fetch を扱わない）ので残す。
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      const script = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || ''
      if (isPushServiceWorker(script)) continue
      registration.unregister()
    }
  })

  if ('caches' in window) {
    caches.keys().then((cacheNames) => {
      cacheNames.forEach((cacheName) => {
        caches.delete(cacheName)
      })
    })
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
