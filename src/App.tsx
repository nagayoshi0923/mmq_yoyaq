import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
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
      refetchOnMount: 'always', // マウント時に必ず再取得（ハードリフレッシュ対応）
      refetchOnReconnect: true, // ネットワーク再接続時に再取得
    },
    mutations: {
      retry: 0, // ミューテーションはリトライしない
    },
  },
})

function AppContent() {
  const { user, loading, isInitialized } = useAuth()
  const [rawHash, setRawHash] = React.useState(() => window.location.hash)

  const parseHashPath = React.useCallback((hashValue: string) => {
    if (!hashValue) return ''
    const withoutHash = hashValue.startsWith('#') ? hashValue.substring(1) : hashValue
    const [path] = withoutHash.split('?')
    if (!path) return ''
    return path.startsWith('/') ? path.substring(1) : path
  }, [])

  React.useEffect(() => {
    const handleHashChange = () => setRawHash(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const hashPath = parseHashPath(rawHash)
  const combinedLocation = `${window.location.search}${rawHash}`
  const hasInviteTokens = combinedLocation.includes('type=signup') || combinedLocation.includes('type=invite')
  const hasRecoveryTokens = combinedLocation.includes('type=recovery')

  if (hashPath === 'set-password' || hashPath === '/set-password' || hasInviteTokens) {
    return <SetPassword />
  }

  if (hashPath === 'reset-password' || hashPath === '/reset-password' || hasRecoveryTokens) {
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

  const normalizedHash = rawHash.startsWith('#') ? rawHash.substring(1) : rawHash
  const hashWithoutQuery = normalizedHash.split('?')[0]
  if (hashWithoutQuery === 'login') {
    return <LoginForm />
  }

  // 新規登録ページ
  if (hashWithoutQuery === 'signup') {
    return <LoginForm signup={true} />
  }

  // 未ログインまたは顧客アカウントの場合は予約サイトを表示
  // AdminDashboard内で管理ツールへのアクセスを制限する
  // ⚠️ 重要: 認証完了後のみリダイレクト判定を行う（早期表示時はリダイレクトしない）
  if (!user || (user && user.role === 'customer')) {
    // 認証完了後のみリダイレクト（認証中は現在のページを維持）
    if (isInitialized) {
      // 管理ツールのページにアクセスしようとした場合は予約サイトにリダイレクト
      const adminPages = ['dashboard', 'stores', 'staff', 'scenarios', 'schedule', 'shift-submission', 'gm-availability', 'private-booking-management', 'reservations', 'customer-management', 'user-management', 'sales', 'settings']
      if (adminPages.some(page => normalizedHash.startsWith(page))) {
        window.location.hash = 'booking/queens-waltz'
        return <AdminDashboard />
      }
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
        <Toaster 
          position="top-center"
          richColors
          closeButton
          duration={4000}
        />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
