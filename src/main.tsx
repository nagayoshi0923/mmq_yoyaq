import ReactDOM from 'react-dom/client'
import App from './AppRoot.tsx'
import './index.css'

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
