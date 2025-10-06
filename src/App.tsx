import React from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { LoginForm } from '@/components/auth/LoginForm'
import { AdminDashboard } from '@/pages/AdminDashboard'

function AppContent() {
  const { user, loading } = useAuth()
  const [currentHash, setCurrentHash] = React.useState(window.location.hash.slice(1))

  React.useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash.slice(1))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-pulse">
            <div className="w-16 h-16 bg-primary/20 rounded-full mx-auto"></div>
          </div>
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  // ログインページを明示的に要求された場合
  if (currentHash === 'login') {
    if (user) {
      // すでにログイン済みの場合は予約サイトへリダイレクト
      window.location.hash = 'customer-booking'
      return null
    }
    return <LoginForm />
  }

  // 未ログインで予約サイトにアクセスした場合は閲覧可能
  if (!user && (currentHash === 'customer-booking' || currentHash.startsWith('customer-booking/'))) {
    return <AdminDashboard />
  }

  // 未ログインで管理画面にアクセスしようとした場合はログインフォームを表示
  if (!user) {
    return <LoginForm />
  }

  // ロールに応じてルーティング
  // ログインしていない、またはcustomerロールの場合は、
  // AdminDashboard内で自動的に予約サイトが表示される
  return <AdminDashboard />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
