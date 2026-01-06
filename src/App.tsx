import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { LoginForm } from '@/components/auth/LoginForm'
import { AdminDashboard } from '@/pages/AdminDashboard'
import { ResetPassword } from '@/pages/ResetPassword'
import { SetPassword } from '@/pages/SetPassword'
import { DevTooltip } from '@/components/ui/DevTooltip'

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

/**
 * 現在のURLからorganizationSlugを抽出するヘルパー関数
 */
export function getOrganizationSlugFromPath(): string {
  const pathname = window.location.pathname
  // /queens-waltz や /queens-waltz/scenario/xxx などから抽出
  const match = pathname.match(/^\/([^/]+)/)
  if (match) {
    // 管理ページのパスは除外
    const adminPaths = ['dashboard', 'stores', 'staff', 'scenarios', 'schedule', 'shift-submission', 
      'gm-availability', 'private-booking-management', 'reservations', 'accounts', 'sales', 
      'settings', 'manual', 'login', 'signup', 'reset-password', 'set-password', 'license-management',
      'staff-profile', 'mypage', 'author', 'external-reports', 'accept-invitation', 'organization-register']
    if (!adminPaths.includes(match[1])) {
      return match[1]
    }
  }
  return 'queens-waltz'
}

// 後方互換性: ハッシュURLをパスURLにリダイレクト
function HashRedirect() {
  const location = useLocation()
  const navigate = useNavigate()
  
  React.useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.startsWith('#')) {
      const hashPath = hash.substring(1)
      // booking/xxx を /xxx に変換
      const newPath = hashPath.replace(/^booking\//, '/')
      // ハッシュをクリアしてパスに変換
      window.history.replaceState(null, '', newPath.startsWith('/') ? newPath : `/${newPath}`)
      navigate(newPath.startsWith('/') ? newPath : `/${newPath}`, { replace: true })
    }
  }, [location, navigate])
  
  return null
}

function AppRoutes() {
  const { user, loading, isInitialized } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // 開発者モード: license_adminの場合にbodyにdev-modeクラスを付与
  React.useEffect(() => {
    if (user?.role === 'license_admin') {
      document.body.classList.add('dev-mode')
    } else {
      document.body.classList.remove('dev-mode')
    }
    return () => {
      document.body.classList.remove('dev-mode')
    }
  }, [user?.role])

  // クエリパラメータからトークンタイプを確認
  const searchParams = new URLSearchParams(location.search)
  const hasInviteTokens = searchParams.get('type') === 'signup' || searchParams.get('type') === 'invite'
  const hasRecoveryTokens = searchParams.get('type') === 'recovery'

  // 招待トークンがある場合はSetPasswordへ
  if (hasInviteTokens || location.pathname === '/set-password') {
    return <SetPassword />
  }

  // リカバリートークンがある場合はResetPasswordへ
  if (hasRecoveryTokens || location.pathname === '/reset-password') {
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

  // ログインページ
  if (location.pathname === '/login') {
    return <LoginForm />
  }

  // 新規登録ページ
  if (location.pathname === '/signup') {
    return <LoginForm signup={true} />
  }

  // 未ログインまたは顧客アカウントの場合は予約サイトを表示
  if (!user || (user && user.role === 'customer')) {
    if (isInitialized) {
      // 管理ツールのページにアクセスしようとした場合は予約サイトにリダイレクト
      const adminPaths = ['/dashboard', '/stores', '/staff', '/scenarios', '/schedule', '/shift-submission', 
        '/gm-availability', '/private-booking-management', '/reservations', '/accounts', '/sales', '/settings']
      if (adminPaths.some(path => location.pathname.startsWith(path))) {
        const slug = getOrganizationSlugFromPath()
        navigate(`/${slug}`, { replace: true })
        return <AdminDashboard />
      }
    }
    return <AdminDashboard />
  }

  // 管理ツールのユーザー（admin/staff）は通常通りAdminDashboardを表示
  return <AdminDashboard />
}

function AppContent() {
  return (
    <>
      <HashRedirect />
      <AppRoutes />
      <DevTooltip />
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}

export default App
