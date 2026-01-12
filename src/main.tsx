import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Service Workerを完全に解除してキャッシュも削除
if ('serviceWorker' in navigator) {
  // すべてのService Workerを解除
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister()
      console.log('🧹 Service Worker unregistered')
    }
  })
  
  // workboxのキャッシュを削除
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
