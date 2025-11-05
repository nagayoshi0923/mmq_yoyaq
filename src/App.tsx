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
  // 認証リンク（type=signup, type=recovery, type=invite）を最優先で処理
  // user状態やloadingに関係なく、URLパラメータを優先
  const fullUrl = window.location.href
  const hasAuthToken = fullUrl.includes('access_token=')
  const isSignupFlow = hasAuthToken && (fullUrl.includes('type=signup') || fullUrl.includes('type=invite'))
  const isRecoveryFlow = hasAuthToken && fullUrl.includes('type=recovery')
  
  // パスワード設定/リセットフローは最優先で表示（user状態に関係なく）
  if (isSignupFlow) {
    return <SetPassword />
  }
  if (isRecoveryFlow) {
    return <ResetPassword />
  }

  // 以下は通常のルーティング
  const { user, loading } = useAuth()
  const [currentHash, setCurrentHash] = React.useState(() => window.location.hash.slice(1))

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

  // ログインページを明示的に要求された場合（クエリパラメータを含む場合も考慮）
  const hashWithoutQuery = currentHash.split('?')[0]
  if (hashWithoutQuery === 'login') {
    return <LoginForm />
  }

  // 新規登録ページ
  if (hashWithoutQuery === 'signup') {
    return <LoginForm signup={true} />
  }

  // 未ログインまたは顧客アカウントの場合は予約サイトを表示
  // AdminDashboard内で管理ツールへのアクセスを制限する
  if (!user || (user && user.role === 'customer')) {
    // 管理ツールのページにアクセスしようとした場合は予約サイトにリダイレクト
    const adminPages = ['dashboard', 'stores', 'staff', 'scenarios', 'schedule', 'shift-submission', 'gm-availability', 'private-booking-management', 'reservations', 'customer-management', 'user-management', 'sales', 'settings']
    if (adminPages.some(page => currentHash.startsWith(page))) {
      window.location.hash = 'customer-booking'
      return <AdminDashboard />
    }
    return <AdminDashboard />
  }

  // 管理ツールのユーザー（admin/staff）は通常通りAdminDashboardを表示
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
