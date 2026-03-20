import React, { Suspense, useLayoutEffect } from 'react'
import { BrowserRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { RouteScrollRestorationProvider } from '@/contexts/RouteScrollRestorationContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { supabase } from '@/lib/supabase'
import { lazyWithRetry } from '@/utils/lazyWithRetry'
import { isCustomerProfileComplete } from '@/utils/customerProfileGate'
import { getOrganizationSlugFromPath } from '@/lib/publicBookingPath'

export { getOrganizationSlugFromPath }

// コード分割：初期ロードを軽くする（リトライ付き）
const LoginForm = lazyWithRetry(() =>
  import('@/components/auth/LoginForm').then((m) => ({ default: m.LoginForm }))
)
const AdminDashboard = lazyWithRetry(() =>
  import('@/pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
)
const ResetPassword = lazyWithRetry(() =>
  import('@/pages/ResetPassword').then((m) => ({ default: m.ResetPassword }))
)
const SetPassword = lazyWithRetry(() =>
  import('@/pages/SetPassword').then((m) => ({ default: m.SetPassword }))
)
const CompleteProfile = lazyWithRetry(() =>
  import('@/pages/CompleteProfile').then((m) => ({ default: m.CompleteProfile }))
)
const CouponPresent = lazyWithRetry(() =>
  import('@/pages/CouponPresent').then((m) => ({ default: m.CouponPresent }))
)

// QueryClient の設定
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分間キャッシュ
      gcTime: 10 * 60 * 1000, // 10分間メモリ保持（旧cacheTime）
      retry: 1, // 失敗時1回リトライ
      refetchOnWindowFocus: false, // タブ復帰時の自動再取得を無効化（UX改善）
      refetchOnMount: false, // キャッシュがあれば再利用（リロード削減）
      refetchOnReconnect: true, // ネットワーク再接続時に再取得
    },
    mutations: {
      retry: 0, // ミューテーションはリトライしない
    },
  },
})

/**
 * AdminDashboard の parsePath と整合: 先頭が組織スラッグのときの「管理ツール第2セグメント」
 * /{org}/blog は管理、/{org}/blog/{slug} は公開記事
 */
const BOOKING_SHELL_ADMIN_SUB_PATHS = new Set([
  'dashboard',
  'stores',
  'staff',
  'staff-profile',
  'scenarios',
  'scenarios-edit',
  'schedule',
  'shift-submission',
  'gm-availability',
  'private-booking-management',
  'reservations',
  'accounts',
  'sales',
  'settings',
  'manual',
  'add-demo-participants',
  'scenario-matcher',
  'organizations',
  'external-reports',
  'license-reports',
  'license-management',
  'customer-management',
  'user-management',
  'coupons',
  'blog',
])

const BOOKING_SHELL_GLOBAL_FIRST_SEGMENT = new Set([
  'login',
  'signup',
  'reset-password',
  'set-password',
  'complete-profile',
  'coupon-present',
  'register',
  'about',
  'accept-invitation',
  'author-dashboard',
  'author-login',
  'mypage',
  'my-page',
  'scenario',
  'terms',
  'privacy',
  'security',
  'legal',
  'contact',
  'faq',
  'guide',
  'cancel-policy',
  'stores',
  'company',
  'for-business',
  'pricing',
  'getting-started',
  'lp',
  'blog',
  'org',
  'group',
])

/**
 * 認証セッション確定前でも予約シェル（MMQトップ・組織トップ等）を先に描画する。
 * フルページスピナーで「全部消える」時間を短くする。
 */
function shouldShowBookingShellWhileAuthPending(pathname: string): boolean {
  const normalized = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
  const path = normalized.startsWith('/') ? normalized.slice(1) : normalized
  const segs = path.split('/').filter(Boolean)

  if (segs.length === 0) return true

  if (segs[0] === 'admin' || segs[0] === 'dev') return false

  if (segs[0] === 'scenario') return true

  if (segs.length === 1) {
    const s = segs[0]
    if (BOOKING_SHELL_GLOBAL_FIRST_SEGMENT.has(s)) return true
    if (BOOKING_SHELL_ADMIN_SUB_PATHS.has(s)) return false
    return true
  }

  const sub = segs[1]
  if (!BOOKING_SHELL_ADMIN_SUB_PATHS.has(sub)) return true
  if (sub === 'blog' && segs.length >= 3) return true
  if (sub === 'scenarios' && segs[2] === 'edit') return false
  return false
}

/** Lazy 読み込み中でもフルスピナーにしない（予約シェル向け） */
function BookingShellLazyFallback() {
  return <div className="min-h-screen" style={{ backgroundColor: 'var(--background, #fafafa)' }} aria-busy="true" />
}

// ページ遷移時にスクロール位置をトップに戻す
// - POP（戻る/進む）: 何もしない（各ページの sessionStorage 復元に任せる）
// - 初回マウント（リロード・新規タブの直リンク）: トップへ飛ばさない
//   → さもないと navType が POP 以外になり、scrollTo(0,0) が sessionStorage 復元より後に効いて潰す
// - それ以外の同一タブ内のパス変更（PUSH/REPLACE）: トップへ
function ScrollToTop() {
  const { pathname } = useLocation()
  const navType = useNavigationType()
  const prevPathRef = React.useRef<string | null>(null)

  useLayoutEffect(() => {
    if (navType === 'POP') {
      prevPathRef.current = pathname
      return
    }
    const prev = prevPathRef.current
    if (prev !== null && prev !== pathname) {
      window.scrollTo(0, 0)
    }
    prevPathRef.current = pathname
  }, [pathname, navType])

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

// Supabase implicit フローで認証トークンがパスに含まれる問題を修正
// /access_token=xxx&... を /complete-profile#access_token=xxx&... にリダイレクト
function AuthTokenPathRedirect() {
  React.useEffect(() => {
    const pathname = window.location.pathname
    const fullUrl = window.location.href
    
    // パスに access_token= が含まれている場合
    if (pathname.includes('access_token=') || fullUrl.includes('/access_token=')) {
      // URLからトークン部分を抽出
      const tokenMatch = fullUrl.match(/[/?]?(access_token=[^#]*)/)
      if (tokenMatch) {
        const tokenParams = tokenMatch[1]
        // /complete-profile#access_token=... にリダイレクト
        const newUrl = `${window.location.origin}/complete-profile#${tokenParams}`
        window.location.replace(newUrl)
      }
    }
  }, [])
  
  return null
}

// 後方互換性: ハッシュURLをパスURLにリダイレクト
function HashRedirect() {
  const location = useLocation()
  const navigate = useNavigate()

  React.useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.startsWith('#')) {
      // 認証トークンを含むハッシュは無視（Supabase が処理する）
      if (hash.includes('access_token=') || hash.includes('refresh_token=') || hash.includes('error=')) {
        return
      }
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

  const deferFullPageAuthBlock = React.useMemo(
    () => shouldShowBookingShellWhileAuthPending(location.pathname),
    [location.pathname]
  )
  const adminDashboardSuspenseFallback = deferFullPageAuthBlock ? (
    <BookingShellLazyFallback />
  ) : (
    <FullPageSpinner />
  )

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
        const { data: customerRows, error } = await supabase
          .from('customers')
          .select('id, name, phone, email')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)

        const customer = customerRows?.[0] ?? null

        if (cancelled) return

        if (error) {
          // 読み取り失敗時は安全側（必須情報が揃っていると確定できない）
          navigate('/complete-profile?next=' + encodeURIComponent(location.pathname), { replace: true })
          return
        }

        const isComplete = isCustomerProfileComplete(customer, user.email)
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
  // PKCE フローでは onAuthStateChange でセッションが非同期確立されるため、
  // CompleteProfile に判断を委ねる（LoginForm を表示しない）
  if (location.pathname === '/complete-profile') {
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <CompleteProfile />
      </Suspense>
    )
  }

  // クーポンプレゼントページ（新規登録完了後）
  if (location.pathname === '/coupon-present') {
    if (!loading && !user) {
      return (
        <Suspense fallback={<FullPageSpinner />}>
          <LoginForm />
        </Suspense>
      )
    }
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <CouponPresent />
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

  if (loading && !deferFullPageAuthBlock) {
    return <FullPageSpinner />
  }

  if (user?.role === 'customer' && isProfileCheckRunning && !deferFullPageAuthBlock) {
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
          <Suspense fallback={adminDashboardSuspenseFallback}>
            <AdminDashboard />
          </Suspense>
        )
      }
    }
    return (
      <Suspense fallback={adminDashboardSuspenseFallback}>
        <AdminDashboard />
      </Suspense>
    )
  }

  // 管理ツールのユーザー（admin/staff）は通常通りAdminDashboardを表示
  return (
    <Suspense fallback={adminDashboardSuspenseFallback}>
      <AdminDashboard />
    </Suspense>
  )
}

function AppContent() {
  return (
    <>
      <AuthTokenPathRedirect />
      <RouteScrollRestorationProvider>
        <ScrollToTop />
        <HashRedirect />
        <AppRoutes />
      </RouteScrollRestorationProvider>
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
