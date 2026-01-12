import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// 開発モードでService Workerを解除（古いキャッシュをクリア）
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister()
      console.log('Service Worker unregistered for development')
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
