import React, { lazy, Suspense } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { supabase } from '@/lib/supabase'

// コード分割：初期ロードを軽くする
const LoginForm = lazy(() =>
  import('@/components/auth/LoginForm').then((m) => ({ default: m.LoginForm }))
)
const AdminDashboard = lazy(() =>
  import('@/pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
)
const ResetPassword = lazy(() =>
  import('@/pages/ResetPassword').then((m) => ({ default: m.ResetPassword }))
)
const SetPassword = lazy(() =>
  import('@/pages/SetPassword').then((m) => ({ default: m.SetPassword }))
)
const CompleteProfile = lazy(() =>
  import('@/pages/CompleteProfile').then((m) => ({ default: m.CompleteProfile }))
)

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
    const adminPaths = [
      'dashboard',
      'stores',
      'staff',
      'scenarios',
      'schedule',
      'shift-submission',
      'gm-availability',
      'private-booking-management',
      'reservations',
      'accounts',
      'sales',
      'settings',
      'manual',
      'login',
      'signup',
      'reset-password',
      'set-password',
      'complete-profile',
      'license-management',
      'staff-profile',
      'mypage',
      'author',
      'external-reports',
      'accept-invitation',
      'organization-register',
    ]
    if (!adminPaths.includes(match[1])) {
      return match[1]
    }
  }
  return 'queens-waltz'
}

// ページ遷移時にスクロール位置をトップに戻す
function ScrollToTop() {
  const { pathname } = useLocation()

  React.useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

function FullPageSpinner() {
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
      window.history.replaceState(
        null,
        '',
        newPath.startsWith('/') ? newPath : `/${newPath}`
      )
      navigate(newPath.startsWith('/') ? newPath : `/${newPath}`, {
        replace: true,
      })
    }
  }, [location, navigate])

  return null
}

function AppRoutes() {
  const { user, loading, isInitialized } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [isProfileCheckRunning, setIsProfileCheckRunning] = React.useState(false)

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

  // 顧客ユーザーは「氏名/電話/メール」が揃うまで全ページでプロフィール登録を求める
  // ただし /complete-profile 自体はリダイレクト対象外（無限ループ防止）
  // 未ログインユーザーはリダイレクトしない（公開ページ閲覧可能）
  // NOTE: Hooksの順序を守るため、早期returnより前に定義する
  React.useEffect(() => {
    // /complete-profile 自体はスキップ（無限ループ防止）
    const isCompleteProfilePage = location.pathname === '/complete-profile'

    if (!user || user.role !== 'customer' || isCompleteProfilePage) {
      setIsProfileCheckRunning(false)
      return
    }

    let cancelled = false

    ;(async () => {
      setIsProfileCheckRunning(true)
      try {
        const { data: customer, error } = await supabase
          .from('customers')
          .select('id, name, phone, email')
          .eq('user_id', user.id)
          .maybeSingle()

        if (cancelled) return

        // デバッグ: プロフィールチェック結果をログ出力
        console.log('🔍 プロフィールチェック:', {
          userId: user.id,
          userEmail: user.email,
          customerFound: !!customer,
          customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email } : null,
          error: error ? { code: error.code, message: error.message } : null,
        })

        if (error) {
          // 読み取り失敗時は安全側（必須情報が揃っていると確定できない）
          console.warn('❌ プロフィールチェック: customersクエリエラー', error)
          navigate('/complete-profile?next=' + encodeURIComponent(location.pathname), { replace: true })
          return
        }

        const nameOk = Boolean(customer?.name && String(customer.name).trim().length > 0)
        const phoneOk = Boolean(customer?.phone && String(customer.phone).trim().length > 0)
        // OAuth ユーザーは auth session にメールがあるので、customer レコードに無くても OK
        const emailOk = Boolean(
          (customer?.email && String(customer.email).trim().length > 0) ||
          (user.email && String(user.email).trim().length > 0)
        )

        const isComplete = nameOk && phoneOk && emailOk
        console.log('🔍 プロフィール完了判定:', { nameOk, phoneOk, emailOk, isComplete })
        
        if (!isComplete) {
          const next = `${location.pathname}${location.search}`
          navigate(`/complete-profile?next=${encodeURIComponent(next)}`, { replace: true })
        }
      } catch {
        if (!cancelled) {
          navigate('/complete-profile?next=' + encodeURIComponent(location.pathname), { replace: true })
        }
      } finally {
        if (!cancelled) setIsProfileCheckRunning(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [location.pathname, location.search, navigate, user?.id, user?.role])

  // クエリパラメータからトークンタイプを確認
  const searchParams = new URLSearchParams(location.search)
  const hasInviteTokens =
    searchParams.get('type') === 'signup' || searchParams.get('type') === 'invite'
  const hasRecoveryTokens = searchParams.get('type') === 'recovery'

  // プロフィール設定ページ（新規登録メール確認後）
  // type=signup でリダイレクトされるが、/complete-profile の場合はこちらを優先
  // ただし未ログインの場合はログインページへリダイレクト
  if (location.pathname === '/complete-profile') {
    if (!loading && !user) {
      return (
        <Suspense fallback={<FullPageSpinner />}>
          <LoginForm />
        </Suspense>
      )
    }
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <CompleteProfile />
      </Suspense>
    )
  }

  // 招待トークンがある場合はSetPasswordへ（/complete-profile以外）
  if (hasInviteTokens || location.pathname === '/set-password') {
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <SetPassword />
      </Suspense>
    )
  }

  // リカバリートークンがある場合はResetPasswordへ
  if (hasRecoveryTokens || location.pathname === '/reset-password') {
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <ResetPassword />
      </Suspense>
    )
  }

  // ログインページ（loadingに関係なく表示 - エラー表示が消えるのを防ぐ）
  if (location.pathname === '/login') {
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <LoginForm />
      </Suspense>
    )
  }

  // 新規登録ページ（loadingに関係なく表示）
  if (location.pathname === '/signup') {
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <LoginForm signup={true} />
      </Suspense>
    )
  }

  if (loading) {
    return <FullPageSpinner />
  }

  if (user?.role === 'customer' && isProfileCheckRunning) {
    return <FullPageSpinner />
  }

  // 未ログインまたは顧客アカウントの場合は予約サイトを表示
  if (!user || (user && user.role === 'customer')) {
    if (isInitialized) {
      // 管理ツールのページにアクセスしようとした場合は予約サイトにリダイレクト
      const adminPaths = [
        '/dashboard',
        '/stores',
        '/staff',
        '/scenarios',
        '/schedule',
        '/shift-submission',
        '/gm-availability',
        '/private-booking-management',
        '/reservations',
        '/accounts',
        '/sales',
        '/settings',
      ]
      if (adminPaths.some((path) => location.pathname.startsWith(path))) {
        const slug = getOrganizationSlugFromPath()
        navigate(`/${slug}`, { replace: true })
        return (
          <Suspense fallback={<FullPageSpinner />}>
            <AdminDashboard />
          </Suspense>
        )
      }
    }
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <AdminDashboard />
      </Suspense>
    )
  }

  // 管理ツールのユーザー（admin/staff）は通常通りAdminDashboardを表示
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <AdminDashboard />
    </Suspense>
  )
}

function AppContent() {
  return (
    <>
      <ScrollToTop />
      <HashRedirect />
      <AppRoutes />
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <AuthProvider>
            <AppContent />
            <Toaster
              position="top-center"
              richColors
              closeButton
              duration={4000}
            />
          </AuthProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    </BrowserRouter>
  )
}

export default App
