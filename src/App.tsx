import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { LoginForm } from '@/components/auth/LoginForm'
import { AdminDashboard } from '@/pages/AdminDashboard'
import { ResetPassword } from '@/pages/ResetPassword'
import { SetPassword } from '@/pages/SetPassword'

// QueryClient の設定
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分間キャッシュ
      gcTime: 10 * 60 * 1000, // 10分間メモリ保持（旧cacheTime）
      retry: 1, // 失敗時1回リトライ
      refetchOnWindowFocus: true, // タブに戻ったら再取得
    },
    mutations: {
      retry: 0, // ミューテーションはリトライしない
    },
  },
})

function AppContent() {
  const { user, loading } = useAuth()
  const [currentHash, setCurrentHash] = React.useState(() => window.location.hash.slice(1))

  React.useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash.slice(1))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // 認証リンク（type=signup, type=recovery, type=invite）を優先的に処理
  const fullUrl = window.location.href
  if (fullUrl.includes('access_token=') && (fullUrl.includes('type=signup') || fullUrl.includes('type=invite'))) {
    return <SetPassword />
  }
  if (fullUrl.includes('access_token=') && fullUrl.includes('type=recovery')) {
    return <ResetPassword />
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  // パスワード設定ページ（招待メールから）- 念のため残す
  if (currentHash.includes('type=invite') || currentHash.includes('type=signup')) {
    return <SetPassword />
  }

  // パスワードリセットページ
  if (currentHash.startsWith('reset-password') || currentHash.includes('type=recovery')) {
    return <ResetPassword />
  }

  // ログインページを明示的に要求された場合
  if (currentHash === 'login') {
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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}

export default App
