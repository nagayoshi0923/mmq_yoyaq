import React, { useState, useCallback, lazy, Suspense, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { LoadingScreen } from '@/components/layout/LoadingScreen'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
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
const StaffManagement = lazy(() => import('./StaffManagement').then(m => ({ default: m.StaffManagement })))
const ScheduleManager = lazy(() => import('./ScheduleManager/index').then(m => ({ default: m.ScheduleManager })))
const SalesManagement = lazy(() => import('./SalesManagement'))
const ShiftSubmission = lazy(() => import('./ShiftSubmission/index').then(m => ({ default: m.ShiftSubmission })))
const ReservationManagement = lazy(() => import('./ReservationManagement').then(m => ({ default: m.ReservationManagement })))
const PublicBookingTop = lazy(() => import('./PublicBookingTop').then(m => ({ default: m.PublicBookingTop })))
const ScenarioDetailPage = lazy(() => import('./ScenarioDetailPage').then(m => ({ default: m.ScenarioDetailPage })))
const ScenarioDetailGlobal = lazy(() => import('./ScenarioDetailGlobal').then(m => ({ default: m.ScenarioDetailGlobal })))
const ScenarioCatalog = lazy(() => import('./ScenarioCatalog').then(m => ({ default: m.ScenarioCatalog })))
const GMAvailabilityCheck = lazy(() => import('./GMAvailabilityCheck').then(m => ({ default: m.GMAvailabilityCheck })))
const PrivateBookingScenarioSelect = lazy(() => import('./PrivateBookingScenarioSelect').then(m => ({ default: m.PrivateBookingScenarioSelect })))
const PrivateBookingRequestPage = lazy(() => import('./PrivateBookingRequestPage').then(m => ({ default: m.PrivateBookingRequestPage })))
const PrivateBookingManagement = lazy(() => import('./PrivateBookingManagement').then(m => ({ default: m.PrivateBookingManagement })))
const AccountManagement = lazy(() => import('./AccountManagement').then(m => ({ default: m.AccountManagement })))
const CustomerManagement = lazy(() => import('./CustomerManagement'))
const UserManagement = lazy(() => import('./UserManagement').then(m => ({ default: m.UserManagement })))
const MyPage = lazy(() => import('./MyPage'))
const ReservationDetailPage = lazy(() => import('./MyPage/pages/ReservationDetailPage').then(m => ({ default: m.ReservationDetailPage })))
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
const ScenarioMasterAdmin = lazy(() => import('./ScenarioMasterAdmin').then(m => ({ default: m.ScenarioMasterAdmin })))
const ScenarioMasterEdit = lazy(() => import('./ScenarioMasterAdmin/ScenarioMasterEdit').then(m => ({ default: m.ScenarioMasterEdit })))
const OrganizationSettings = lazy(() => import('./OrganizationSettings'))
const OrganizationRegister = lazy(() => import('./OrganizationRegister'))
const LandingPage = lazy(() => import('./LandingPage'))
const AuthorDashboard = lazy(() => import('./AuthorDashboard'))
const AuthorLogin = lazy(() => import('./AuthorLogin'))
const ExternalReportForm = lazy(() => import('./ExternalReportForm'))
const PlatformScenarioSearch = lazy(() => import('./PlatformScenarioSearch').then(m => ({ default: m.PlatformScenarioSearch })))
const PlatformTop = lazy(() => import('./PlatformTop').then(m => ({ default: m.PlatformTop })))
const DesignPreview = lazy(() => import('./dev/DesignPreview').then(m => ({ default: m.DesignPreview })))
const ComponentGallery = lazy(() => import('./dev/ComponentGallery').then(m => ({ default: m.ComponentGallery })))
const NotFoundPage = lazy(() => import('./NotFoundPage').then(m => ({ default: m.NotFoundPage })))

function ScenarioEditRedirect({ organizationSlug, scenarioId }: { organizationSlug: string; scenarioId: string | null }) {
  const navigate = useNavigate()

  useEffect(() => {
    const editId = scenarioId || 'new'
    const target = `/${organizationSlug}/scenarios?edit=${encodeURIComponent(editId)}`
    navigate(target, { replace: true })
  }, [navigate, organizationSlug, scenarioId])

  return <LoadingScreen message="シナリオ編集を新UIへ移動中..." />
}

// 静的ページ（公開ページ）
const TermsPage = lazy(() => import('./static').then(m => ({ default: m.TermsPage })))
const PrivacyPage = lazy(() => import('./static').then(m => ({ default: m.PrivacyPage })))
const LegalPage = lazy(() => import('./static').then(m => ({ default: m.LegalPage })))
const ContactPage = lazy(() => import('./static').then(m => ({ default: m.ContactPage })))
const OrganizationContactPage = lazy(() => import('./org/ContactPage').then(m => ({ default: m.OrganizationContactPage })))
const FAQPage = lazy(() => import('./static').then(m => ({ default: m.FAQPage })))
const GuidePage = lazy(() => import('./static').then(m => ({ default: m.GuidePage })))
const CancelPolicyPage = lazy(() => import('./static').then(m => ({ default: m.CancelPolicyPage })))
const StoreListPage = lazy(() => import('./static').then(m => ({ default: m.StoreListPage })))
const AboutPage = lazy(() => import('./static').then(m => ({ default: m.AboutPage })))
const PricingPage = lazy(() => import('./static').then(m => ({ default: m.PricingPage })))
const GettingStartedPage = lazy(() => import('./static').then(m => ({ default: m.GettingStartedPage })))

// 管理ページのパス一覧
const ADMIN_PATHS = [
  'dashboard', 'stores', 'staff', 'staff-profile', 'scenarios', 'scenarios-edit',
  'schedule', 'shift-submission', 'gm-availability', 'private-booking-management',
  'reservations', 'accounts', 'sales', 'settings', 'manual', 'add-demo-participants',
  'scenario-matcher', 'organizations', 'external-reports', 'license-reports', 'license-management',
  'customer-management', 'user-management'
]

// パスを解析してページ情報を返す
function parsePath(pathname: string): { page: string, scenarioId: string | null, organizationSlug: string | null } {
  // 先頭のスラッシュを除去
  const path = pathname.startsWith('/') ? pathname.substring(1) : pathname
  const segments = path.split('/')
  
  // 空パスはプラットフォームトップ
  if (!path || path === '') {
    return { page: 'platform-top', scenarioId: null, organizationSlug: null }
  }
  
  // /dev/design-preview - 開発用デザインプレビュー
  if (segments[0] === 'dev' && segments[1] === 'design-preview') {
    return { page: 'dev-design-preview', scenarioId: null, organizationSlug: null }
  }
  
  // /dev/components - UIコンポーネントギャラリー
  if (segments[0] === 'dev' && segments[1] === 'components') {
    return { page: 'dev-components', scenarioId: null, organizationSlug: null }
  }
  
  // /mypage/reservation/{reservationId} - マイページ予約詳細
  if (segments[0] === 'mypage' && segments[1] === 'reservation' && segments[2]) {
    return { page: 'mypage-reservation-detail', scenarioId: segments[2], organizationSlug: null }
  }
  
  // 特殊ページのチェック（組織スラッグなし）
  const specialPages = ['login', 'signup', 'reset-password', 'set-password', 'complete-profile', 'register', 'about', 
    'accept-invitation', 'author-dashboard', 'author-login', 'mypage', 'my-page', 'scenario',
    // 静的ページ
    'terms', 'privacy', 'legal', 'contact', 'faq', 'guide', 'cancel-policy', 'stores', 'company',
    // 組織向けページ
    'for-business', 'pricing', 'getting-started']
  if (segments.length === 1 && specialPages.includes(segments[0])) {
    return { page: segments[0], scenarioId: null, organizationSlug: null }
  }
  
  // /scenario/{slug} - シナリオ共通詳細ページ（組織を跨いで公演情報を表示）
  if (segments[0] === 'scenario' && segments[1]) {
    return { page: 'scenario-detail-global', scenarioId: segments[1], organizationSlug: null }
  }
  
  // /admin/scenario-masters - シナリオマスタ管理
  if (segments[0] === 'admin' && segments[1] === 'scenario-masters') {
    if (segments[2]) {
      return { page: 'scenario-master-edit', scenarioId: segments[2], organizationSlug: null }
    }
    return { page: 'scenario-master-admin', scenarioId: null, organizationSlug: null }
  }
  
  // /org/{slug}/contact - 組織別お問い合わせページ
  if (segments[0] === 'org' && segments[1] && segments[2] === 'contact') {
    return { page: 'org-contact', scenarioId: null, organizationSlug: segments[1] }
  }
  
  // 2セグメント以上の場合、最初のセグメントを組織スラッグとして扱う
  if (segments.length >= 2) {
    const orgSlug = segments[0]
    const subPage = segments[1]
    
    // /{slug}/scenario/{scenarioId} - 予約サイトのシナリオ詳細
    if (subPage === 'scenario' && segments[2]) {
      return { page: 'booking', scenarioId: segments[2], organizationSlug: orgSlug }
    }
    
    // /{slug}/{admin-path} - 組織付き管理ページ
    if (ADMIN_PATHS.includes(subPage)) {
      // /{slug}/scenarios/edit/{scenarioId}
      if (subPage === 'scenarios' && segments[2] === 'edit') {
        return { page: 'scenarios-edit', scenarioId: segments[3] || null, organizationSlug: orgSlug }
      }
      return { page: subPage, scenarioId: null, organizationSlug: orgSlug }
    }
    
    // /{slug}/calendar, /{slug}/list, /{slug}/private-booking など - 予約サイトのサブページ
    if (subPage === 'calendar' || subPage === 'list' || subPage === 'private-booking') {
      return { page: 'booking', scenarioId: null, organizationSlug: orgSlug }
    }
    if (subPage === 'catalog') {
      return { page: 'catalog', scenarioId: null, organizationSlug: orgSlug }
    }
    if (subPage === 'private-booking-select') {
      return { page: 'private-booking-select', scenarioId: null, organizationSlug: orgSlug }
    }
    if (subPage === 'private-booking-request') {
      return { page: 'private-booking-request', scenarioId: null, organizationSlug: orgSlug }
    }
  }
  
  // /{slug} - 予約サイトトップ（1セグメントで管理パス以外）
  if (segments.length === 1 && !ADMIN_PATHS.includes(segments[0])) {
    return { page: 'booking', scenarioId: null, organizationSlug: segments[0] }
  }
  
  // 旧形式の管理ページ（後方互換）
  if (ADMIN_PATHS.includes(segments[0])) {
    return { page: segments[0], scenarioId: null, organizationSlug: null }
  }
  
  // /scenarios/edit/{scenarioId}（旧形式）
  if (segments[0] === 'scenarios' && segments[1] === 'edit') {
    return { page: 'scenarios-edit', scenarioId: segments[2] || null, organizationSlug: null }
  }
  
  // デフォルト
  return { page: segments[0] || 'dashboard', scenarioId: null, organizationSlug: null }
}

export function AdminDashboard() {
  const { user, loading, isInitialized } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { organization } = useOrganization()
  
  // パスを解析（毎回解析することでURLと表示を同期）
  const { page: currentPage, scenarioId: currentScenarioId, organizationSlug: pathOrganizationSlug } = parsePath(location.pathname)
  
  // 組織slugを決定（パスにあればそれ、なければ組織設定から取得）
  const organizationSlug = pathOrganizationSlug || organization?.slug || 'queens-waltz'

  // ユーザーロールが確定したときに初回リダイレクト
  useEffect(() => {
    if (!isInitialized || loading) return

    const isCustomerOrLoggedOut = !user || user.role === 'customer'
    const defaultOrg = organization?.slug || 'queens-waltz'
    
    // ルートパス（/）はプラットフォームトップを表示（リダイレクトしない）
    if (location.pathname === '/') {
      return
    }
    
    // 顧客/ログアウト状態で管理ページにいる場合は予約サイトにリダイレクト
    if (isCustomerOrLoggedOut && ADMIN_PATHS.includes(currentPage)) {
      navigate(`/${defaultOrg}`, { replace: true })
      return
    }
  }, [user, currentPage, isInitialized, loading, location.pathname, navigate, organization?.slug])

  // ページ変更ハンドラ（組織スラッグ付き）
  const handlePageChange = useCallback((pageId: string) => {
    // マイページは特別扱い（組織スラッグなし）
    if (pageId === 'mypage' || pageId === 'my-page') {
      navigate('/mypage')
      return
    }
    // 予約サイトへの遷移は組織スラッグのみ
    if (pageId === organizationSlug || pageId === 'booking') {
      navigate(`/${organizationSlug}`)
    } else {
      navigate(`/${organizationSlug}/${pageId}`)
    }
  }, [navigate, organizationSlug])
  
  // シナリオ選択（予約サイト用）
  const handleScenarioSelect = useCallback((scenarioId: string) => {
    if (organizationSlug) {
      navigate(`/${organizationSlug}/scenario/${scenarioId}`)
    } else {
      navigate(`/queens-waltz/scenario/${scenarioId}`)
    }
  }, [navigate, organizationSlug])

  // シナリオ詳細を閉じる（前のページに戻る）
  const handleScenarioClose = useCallback(() => {
    navigate(-1)
  }, [navigate])

  // ログインページはAdminDashboardで表示しない
  if (currentPage === 'login') {
    return null
  }

  // ページ切り替え処理
  // 管理ページの stores は組織スラッグがある場合のみ（/{org}/stores）
  if (currentPage === 'stores' && pathOrganizationSlug) {
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
    // 旧編集ページは切り離し。シナリオ管理（V2）へ寄せて編集ダイアログを開く
    return <ScenarioEditRedirect organizationSlug={organizationSlug} scenarioId={currentScenarioId} />
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
    if (currentScenarioId) {
      return (
        <Suspense fallback={<LoadingScreen message="シナリオ詳細を読み込み中..." />}>
          <ScenarioDetailPage 
            scenarioId={currentScenarioId}
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
        <ScenarioCatalog organizationSlug={organizationSlug} />
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
            organizationSlug={organizationSlug}
          />
        </Suspense>
      )
    }
  }
  
  // シナリオ共通詳細ページ（組織を跨いで公演情報を表示）
  if (currentPage === 'scenario-detail-global') {
    const { scenarioId } = parsePath(location.pathname)
    if (scenarioId) {
      return (
        <Suspense fallback={<LoadingScreen message="シナリオ詳細を読み込み中..." />}>
          <ScenarioDetailGlobal 
            scenarioSlug={scenarioId}
            onClose={() => navigate(-1)}
          />
        </Suspense>
      )
    }
  }

  // シナリオマスタ管理（MMQ運営用）
  if (currentPage === 'scenario-master-admin') {
    return (
      <Suspense fallback={<LoadingScreen message="シナリオマスタ管理を読み込み中..." />}>
        <ScenarioMasterAdmin />
      </Suspense>
    )
  }

  // シナリオマスタ編集（MMQ運営用）
  if (currentPage === 'scenario-master-edit') {
    return (
      <Suspense fallback={<LoadingScreen message="シナリオマスタを読み込み中..." />}>
        <ScenarioMasterEdit />
      </Suspense>
    )
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
        <PrivateBookingScenarioSelect organizationSlug={organizationSlug} />
      </Suspense>
    )
  }
  
  if (currentPage === 'private-booking-request') {
    return (
      <Suspense fallback={<LoadingScreen message="貸切予約リクエストを読み込み中..." />}>
        <PrivateBookingRequestPage organizationSlug={organizationSlug} />
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

  if (currentPage === 'customer-management') {
    return (
      <Suspense fallback={<LoadingScreen message="顧客管理を読み込み中..." />}>
        <CustomerManagement />
      </Suspense>
    )
  }

  if (currentPage === 'user-management') {
    return (
      <Suspense fallback={<LoadingScreen message="ユーザー管理を読み込み中..." />}>
        <UserManagement />
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

  if (currentPage === 'mypage-reservation-detail') {
    return (
      <div className="min-h-screen bg-background">
        <Header onPageChange={handlePageChange} />
        <Suspense fallback={<LoadingScreen message="予約詳細を読み込み中..." />}>
          <ReservationDetailPage />
        </Suspense>
      </div>
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

  // プラットフォームトップページ
  if (currentPage === 'platform-top') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <PlatformTop />
      </Suspense>
    )
  }

  // 開発用：デザインプレビューページ
  if (currentPage === 'dev-design-preview') {
    return (
      <Suspense fallback={<LoadingScreen message="デザインプレビューを読み込み中..." />}>
        <DesignPreview />
      </Suspense>
    )
  }

  // 開発用：UIコンポーネントギャラリー
  if (currentPage === 'dev-components') {
    return (
      <Suspense fallback={<LoadingScreen message="コンポーネントギャラリーを読み込み中..." />}>
        <ComponentGallery />
      </Suspense>
    )
  }

  // プラットフォームレベルのシナリオ検索ページ
  if (currentPage === 'scenario') {
    return (
      <Suspense fallback={<LoadingScreen message="シナリオを読み込み中..." />}>
        <PlatformScenarioSearch />
      </Suspense>
    )
  }

  // 静的ページ
  if (currentPage === 'terms') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <TermsPage />
      </Suspense>
    )
  }

  if (currentPage === 'privacy') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <PrivacyPage />
      </Suspense>
    )
  }

  if (currentPage === 'legal') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <LegalPage />
      </Suspense>
    )
  }

  if (currentPage === 'contact') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <ContactPage />
      </Suspense>
    )
  }

  // 組織別お問い合わせページ（/org/{slug}/contact）
  if (currentPage === 'org-contact') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <OrganizationContactPage />
      </Suspense>
    )
  }

  if (currentPage === 'faq') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <FAQPage />
      </Suspense>
    )
  }

  if (currentPage === 'guide') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <GuidePage />
      </Suspense>
    )
  }

  if (currentPage === 'cancel-policy') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <CancelPolicyPage />
      </Suspense>
    )
  }

  // 公開ページの stores は組織スラッグがない場合のみ（/stores）
  if (currentPage === 'stores' && !pathOrganizationSlug) {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <StoreListPage />
      </Suspense>
    )
  }

  if (currentPage === 'company') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <AboutPage />
      </Suspense>
    )
  }

  // 組織向けページ
  if (currentPage === 'for-business') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <LandingPage />
      </Suspense>
    )
  }

  if (currentPage === 'pricing') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <PricingPage />
      </Suspense>
    )
  }

  if (currentPage === 'getting-started') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <GettingStartedPage />
      </Suspense>
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
  
  // スタッフ/管理者でない場合で、認識されないページの場合は404を表示
  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin' || user?.role === 'license_admin'
  const knownPages = ['dashboard', 'report-form']
  if (!isStaffOrAdmin && !knownPages.includes(currentPage)) {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <NotFoundPage />
      </Suspense>
    )
  }

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

