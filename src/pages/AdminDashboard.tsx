import React, { useState, useCallback, lazy, Suspense, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { LoadingScreen } from '@/components/layout/LoadingScreen'
import { useAuth } from '@/contexts/AuthContext'
import { 
  Store, 
  Calendar, 
  Users, 
  BookOpen, 
  TrendingUp,
  Clock,
  Settings,
  UserCog
} from 'lucide-react'

// コード分割：各ページを動的インポート
const StoreManagement = lazy(() => import('./StoreManagement').then(m => ({ default: m.StoreManagement })))
const ScenarioManagement = lazy(() => import('./ScenarioManagement').then(m => ({ default: m.ScenarioManagement })))
const ScenarioEdit = lazy(() => import('./ScenarioEdit'))
const StaffManagement = lazy(() => import('./StaffManagement').then(m => ({ default: m.StaffManagement })))
const ScheduleManager = lazy(() => import('./ScheduleManager/index').then(m => ({ default: m.ScheduleManager })))
const SalesManagement = lazy(() => import('./SalesManagement'))
const ShiftSubmission = lazy(() => import('./ShiftSubmission/index').then(m => ({ default: m.ShiftSubmission })))
const ReservationManagement = lazy(() => import('./ReservationManagement').then(m => ({ default: m.ReservationManagement })))
const PublicBookingTop = lazy(() => import('./PublicBookingTop').then(m => ({ default: m.PublicBookingTop })))
const ScenarioDetailPage = lazy(() => import('./ScenarioDetailPage').then(m => ({ default: m.ScenarioDetailPage })))
const ScenarioCatalog = lazy(() => import('./ScenarioCatalog').then(m => ({ default: m.ScenarioCatalog })))
const GMAvailabilityCheck = lazy(() => import('./GMAvailabilityCheck').then(m => ({ default: m.GMAvailabilityCheck })))
const PrivateBookingScenarioSelect = lazy(() => import('./PrivateBookingScenarioSelect').then(m => ({ default: m.PrivateBookingScenarioSelect })))
const PrivateBookingRequestPage = lazy(() => import('./PrivateBookingRequestPage').then(m => ({ default: m.PrivateBookingRequestPage })))
const PrivateBookingManagement = lazy(() => import('./PrivateBookingManagement').then(m => ({ default: m.PrivateBookingManagement })))
const AccountManagement = lazy(() => import('./AccountManagement').then(m => ({ default: m.AccountManagement })))
const MyPage = lazy(() => import('./MyPage'))
const SettingsPage = lazy(() => import('./Settings'))
const AddDemoParticipants = lazy(() => import('./AddDemoParticipants').then(m => ({ default: m.AddDemoParticipants })))
const ScenarioMatcher = lazy(() => import('./ScenarioMatcher').then(m => ({ default: m.ScenarioMatcher })))
const ManualPage = lazy(() => import('./Manual/index').then(m => ({ default: m.ManualPage })))
const DashboardHome = lazy(() => import('./DashboardHome').then(m => ({ default: m.DashboardHome })))
const StaffProfile = lazy(() => import('./StaffProfile').then(m => ({ default: m.StaffProfile })))
const OrganizationManagement = lazy(() => import('./OrganizationManagement'))
const ExternalReports = lazy(() => import('./ExternalReports'))
const LicenseReportManagement = lazy(() => import('./LicenseReportManagement'))
const LicenseManagement = lazy(() => import('./LicenseManagement'))
const AcceptInvitation = lazy(() => import('./AcceptInvitation'))
const OrganizationSettings = lazy(() => import('./OrganizationSettings'))
const OrganizationRegister = lazy(() => import('./OrganizationRegister'))
const LandingPage = lazy(() => import('./LandingPage'))
const AuthorDashboard = lazy(() => import('./AuthorDashboard'))
const AuthorLogin = lazy(() => import('./AuthorLogin'))
const ExternalReportForm = lazy(() => import('./ExternalReportForm'))

// 管理ページのパス一覧
const ADMIN_PATHS = [
  'dashboard', 'stores', 'staff', 'staff-profile', 'scenarios', 'scenarios-edit',
  'schedule', 'shift-submission', 'gm-availability', 'private-booking-management',
  'reservations', 'accounts', 'sales', 'settings', 'manual', 'add-demo-participants',
  'scenario-matcher', 'organizations', 'external-reports', 'license-reports', 'license-management'
]

// パスを解析してページ情報を返す
function parsePath(pathname: string): { page: string, scenarioId: string | null, organizationSlug: string | null } {
  // 先頭のスラッシュを除去
  const path = pathname.startsWith('/') ? pathname.substring(1) : pathname
  const segments = path.split('/')
  
  // 空パスはダッシュボード
  if (!path || path === '') {
    return { page: 'dashboard', scenarioId: null, organizationSlug: null }
  }
  
  // /scenario-detail/{scenarioId}
  if (segments[0] === 'scenario-detail' && segments[1]) {
    return { page: 'scenario-detail', scenarioId: segments[1], organizationSlug: null }
  }
  
  // /{slug}/scenario/{scenarioId} - 予約サイトのシナリオ詳細
  if (segments.length >= 3 && segments[1] === 'scenario' && !ADMIN_PATHS.includes(segments[0])) {
    return { page: 'booking', scenarioId: segments[2], organizationSlug: segments[0] }
  }
  
  // /{slug}/calendar, /{slug}/private-booking など
  if (segments.length >= 2 && !ADMIN_PATHS.includes(segments[0])) {
    const subPage = segments[1]
    if (subPage === 'calendar' || subPage === 'private-booking' || subPage === 'private-booking-request') {
      return { page: 'booking', scenarioId: null, organizationSlug: segments[0] }
    }
  }
  
  // /{slug} - 予約サイトトップ（管理パス以外）
  if (segments.length === 1 && !ADMIN_PATHS.includes(segments[0])) {
    // 特殊ページのチェック
    const specialPages = ['login', 'signup', 'reset-password', 'set-password', 'register', 'about', 
      'accept-invitation', 'author-dashboard', 'author-login', 'mypage', 'catalog', 'my-page']
    if (specialPages.includes(segments[0])) {
      return { page: segments[0], scenarioId: null, organizationSlug: null }
    }
    return { page: 'booking', scenarioId: null, organizationSlug: segments[0] }
  }
  
  // /scenarios/edit/{scenarioId}
  if (segments[0] === 'scenarios' && segments[1] === 'edit') {
    return { page: 'scenarios-edit', scenarioId: segments[2] || null, organizationSlug: null }
  }
  
  // /private-booking-select, /private-booking-request など
  if (segments[0] === 'private-booking-select') {
    return { page: 'private-booking-select', scenarioId: null, organizationSlug: null }
  }
  if (segments[0] === 'private-booking-request') {
    return { page: 'private-booking-request', scenarioId: null, organizationSlug: null }
  }
  
  // 管理ページ
  if (ADMIN_PATHS.includes(segments[0])) {
    return { page: segments[0], scenarioId: null, organizationSlug: null }
  }
  
  // デフォルト
  return { page: segments[0] || 'dashboard', scenarioId: null, organizationSlug: null }
}

export function AdminDashboard() {
  const { user, loading, isInitialized } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  
  // パスを解析
  const { page: currentPage, scenarioId: initialScenarioId, organizationSlug } = parsePath(location.pathname)
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(initialScenarioId)

  // パス変更時にシナリオIDを更新
  useEffect(() => {
    const { scenarioId } = parsePath(location.pathname)
    setSelectedScenarioId(scenarioId)
  }, [location.pathname])

  // ユーザーロールが確定したときに初回リダイレクト
  useEffect(() => {
    if (!isInitialized || loading) return

    const isCustomerOrLoggedOut = !user || user.role === 'customer'
    
    // 未ログイン + ルートパス → 予約サイト（デフォルト組織）
    if (!user && location.pathname === '/') {
      navigate('/queens-waltz', { replace: true })
      return
    }
    
    // 顧客/ログアウト状態で管理ページにいる場合は予約サイトにリダイレクト
    if (isCustomerOrLoggedOut && ADMIN_PATHS.includes(currentPage)) {
      navigate('/queens-waltz', { replace: true })
      return
    }

    // スタッフ/管理者がルートパスにいる場合はダッシュボードへ
    if (user && (user.role === 'admin' || user.role === 'staff') && location.pathname === '/') {
      navigate('/dashboard', { replace: true })
      return
    }
  }, [user, currentPage, isInitialized, loading, location.pathname, navigate])

  // ページ変更ハンドラ
  const handlePageChange = useCallback((pageId: string) => {
    setSelectedScenarioId(null)
    navigate(`/${pageId}`)
  }, [navigate])
  
  // シナリオ選択（予約サイト用）
  const handleScenarioSelect = useCallback((scenarioId: string) => {
    setSelectedScenarioId(scenarioId)
    if (organizationSlug) {
      navigate(`/${organizationSlug}/scenario/${scenarioId}`)
    } else {
      navigate(`/queens-waltz/scenario/${scenarioId}`)
    }
  }, [navigate, organizationSlug])

  // シナリオ詳細を閉じる
  const handleScenarioClose = useCallback(() => {
    setSelectedScenarioId(null)
    if (organizationSlug) {
      navigate(`/${organizationSlug}`)
    } else {
      navigate('/queens-waltz')
    }
  }, [navigate, organizationSlug])

  // ログインページはAdminDashboardで表示しない
  if (currentPage === 'login') {
    return null
  }

  // ページ切り替え処理
  if (currentPage === 'stores') {
    return (
      <Suspense fallback={<LoadingScreen message="店舗管理を読み込み中..." />}>
        <StoreManagement />
      </Suspense>
    )
  }
  
  if (currentPage === 'schedule') {
    return (
      <Suspense fallback={<LoadingScreen message="スケジュールを読み込み中..." />}>
        <ScheduleManager />
      </Suspense>
    )
  }
  
  if (currentPage === 'scenarios') {
    return (
      <Suspense fallback={<LoadingScreen message="シナリオ管理を読み込み中..." />}>
        <ScenarioManagement />
      </Suspense>
    )
  }
  
  if (currentPage === 'scenarios-edit') {
    return (
      <Suspense fallback={<LoadingScreen message="シナリオ編集を読み込み中..." />}>
        <ScenarioEdit />
      </Suspense>
    )
  }
  
  if (currentPage === 'staff') {
    return (
      <Suspense fallback={<LoadingScreen message="スタッフ管理を読み込み中..." />}>
        <StaffManagement />
      </Suspense>
    )
  }
  
  if (currentPage === 'sales') {
    return (
      <Suspense fallback={<LoadingScreen message="売上管理を読み込み中..." />}>
        <SalesManagement />
      </Suspense>
    )
  }
  
  if (currentPage === 'shift-submission') {
    return (
      <Suspense fallback={<LoadingScreen message="シフト提出を読み込み中..." />}>
        <ShiftSubmission />
      </Suspense>
    )
  }
  
  // 予約サイト
  if (currentPage === 'booking' && organizationSlug) {
    if (selectedScenarioId) {
      return (
        <Suspense fallback={<LoadingScreen message="シナリオ詳細を読み込み中..." />}>
          <ScenarioDetailPage 
            scenarioId={selectedScenarioId}
            onClose={handleScenarioClose}
            organizationSlug={organizationSlug}
          />
        </Suspense>
      )
    }
    return (
      <Suspense fallback={<LoadingScreen message="予約サイトを読み込み中..." />}>
        <PublicBookingTop 
          onScenarioSelect={handleScenarioSelect} 
          organizationSlug={organizationSlug}
        />
      </Suspense>
    )
  }
  
  if (currentPage === 'catalog') {
    return (
      <Suspense fallback={<LoadingScreen message="カタログを読み込み中..." />}>
        <ScenarioCatalog />
      </Suspense>
    )
  }
  
  if (currentPage === 'scenario-detail') {
    const { scenarioId } = parsePath(location.pathname)
    if (scenarioId) {
      return (
        <Suspense fallback={<LoadingScreen message="シナリオ詳細を読み込み中..." />}>
          <ScenarioDetailPage 
            scenarioId={scenarioId}
            onClose={() => navigate(-1)}
          />
        </Suspense>
      )
    }
  }
  
  if (currentPage === 'reservations') {
    return (
      <Suspense fallback={<LoadingScreen message="予約管理を読み込み中..." />}>
        <ReservationManagement />
      </Suspense>
    )
  }

  if (currentPage === 'gm-availability') {
    return (
      <Suspense fallback={<LoadingScreen message="GM可否確認を読み込み中..." />}>
        <GMAvailabilityCheck />
      </Suspense>
    )
  }
  
  if (currentPage === 'private-booking-select') {
    return (
      <Suspense fallback={<LoadingScreen message="貸切予約を読み込み中..." />}>
        <PrivateBookingScenarioSelect />
      </Suspense>
    )
  }
  
  if (currentPage === 'private-booking-request') {
    return (
      <Suspense fallback={<LoadingScreen message="貸切予約リクエストを読み込み中..." />}>
        <PrivateBookingRequestPage />
      </Suspense>
    )
  }
  
  if (currentPage === 'private-booking-management') {
    return (
      <Suspense fallback={<LoadingScreen message="貸切予約管理を読み込み中..." />}>
        <PrivateBookingManagement />
      </Suspense>
    )
  }
  
  if (currentPage === 'accounts') {
    return (
      <Suspense fallback={<LoadingScreen message="アカウント管理を読み込み中..." />}>
        <AccountManagement />
      </Suspense>
    )
  }

  if (currentPage === 'settings') {
    return (
      <Suspense fallback={<LoadingScreen message="設定を読み込み中..." />}>
        <SettingsPage />
      </Suspense>
    )
  }

  if (currentPage === 'manual') {
    return (
      <Suspense fallback={<LoadingScreen message="マニュアルを読み込み中..." />}>
        <ManualPage />
      </Suspense>
    )
  }

  if (currentPage === 'staff-profile') {
    return (
      <Suspense fallback={<LoadingScreen message="担当作品を読み込み中..." />}>
        <StaffProfile />
      </Suspense>
    )
  }

  if (currentPage === 'my-page' || currentPage === 'mypage') {
    const isCustomerOrLoggedOut = !user || user.role === 'customer'
    const shouldShowNavigation = !isCustomerOrLoggedOut
    
    return (
      <div className="min-h-screen bg-background">
        <Header onPageChange={handlePageChange} />
        {shouldShowNavigation && (
          <NavigationBar currentPage={currentPage} onPageChange={handlePageChange} />
        )}
        <Suspense fallback={<LoadingScreen message="マイページを読み込み中..." />}>
          <MyPage />
        </Suspense>
      </div>
    )
  }

  if (currentPage === 'add-demo-participants') {
    return (
      <Suspense fallback={<LoadingScreen message="ツールを読み込み中..." />}>
        <AddDemoParticipants />
      </Suspense>
    )
  }

  if (currentPage === 'scenario-matcher') {
    return (
      <Suspense fallback={<LoadingScreen message="ツールを読み込み中..." />}>
        <ScenarioMatcher />
      </Suspense>
    )
  }

  // 組織管理ページ → 設定ページにリダイレクト
  if (currentPage === 'organizations' || currentPage === 'organization-settings') {
    navigate('/settings', { replace: true })
    return null
  }

  if (currentPage === 'license-management') {
    return (
      <Suspense fallback={<LoadingScreen message="ライセンス管理を読み込み中..." />}>
        <LicenseManagement />
      </Suspense>
    )
  }

  if (currentPage === 'accept-invitation') {
    const urlParams = new URLSearchParams(location.search)
    const token = urlParams.get('token') || ''
    return (
      <Suspense fallback={<LoadingScreen message="招待情報を読み込み中..." />}>
        <AcceptInvitation token={token} />
      </Suspense>
    )
  }

  if (currentPage === 'register') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <OrganizationRegister />
      </Suspense>
    )
  }

  if (currentPage === 'about') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <LandingPage />
      </Suspense>
    )
  }

  if (currentPage === 'author-dashboard') {
    return (
      <Suspense fallback={<LoadingScreen message="作者ダッシュボードを読み込み中..." />}>
        <AuthorDashboard />
      </Suspense>
    )
  }

  if (currentPage === 'author-login') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <AuthorLogin />
      </Suspense>
    )
  }

  // ナビゲーション表示判定
  const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined

  return (
    <div className="min-h-screen bg-background">
      <Header onPageChange={handlePageChange} />
      {shouldShowNavigation && (
        <NavigationBar currentPage={currentPage} onPageChange={handlePageChange} />
      )}

      <main className="container mx-auto max-w-[1440px] px-[10px] py-3 sm:py-4 md:py-6">
        <Suspense fallback={<LoadingScreen message="ダッシュボードを読み込み中..." />}>
          {currentPage === 'dashboard' ? (
            <DashboardHome onPageChange={handlePageChange} />
          ) : currentPage === 'report-form' ? (
            <ExternalReportForm />
          ) : (
            <DashboardHome onPageChange={handlePageChange} />
          )}
        </Suspense>
      </main>
    </div>
  )
}
