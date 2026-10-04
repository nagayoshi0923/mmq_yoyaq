import React, { useState, useCallback, Suspense, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/Header'
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoadingScreen } from '@/components/layout/LoadingScreen'
import { AdminOnlyNotice } from '@/components/layout/AdminOnlyNotice'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { usePrefetch } from '@/hooks/usePrefetch'
import { useRouteSeo } from '@/components/seo/RouteSeo'
import { isPublicStoresPath } from '@/lib/seo'
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

// コード分割：各ページを動的インポート（リトライ付き）
import {
  StoreManagement, ScenarioManagement, StaffManagement, ScheduleManager, SalesManagement, ShiftSubmission,
  ReservationManagement, PublicBookingTop, ScenarioDetailPage, ScenarioDetailGlobal, ScenarioCatalog,
  GMAvailabilityCheck, PrivateBookingScenarioSelect, PrivateBookingRequestPage, PrivateBookingManagement,
  PrivateGroupListPage, AccountManagement, CustomerManagement, UserManagement, MyPage, ReservationDetailPage,
  SettingsPage, AddDemoParticipants, ScenarioMatcher, ManualPage, DashboardHome, StoreDashboard, StaffProfile,
  OrganizationManagement, ExternalReports, LicenseReportManagement, LicenseManagement, AcceptInvitation,
  ScenarioMasterAdmin, ScenarioMasterEdit, OrganizationSettings, OrganizationRegister, OrgSignup, LandingPage,
  ForBusinessPage, AuthorDashboard, AuthorLogin, ExternalReportForm, RentalReportForm,
  LicensePartnerReportForm, PlatformScenarioSearch, PlatformTop, DesignPreview, ComponentGallery, ProjectGuide,
  LearnFromThisSystem, NotFoundPage, PrivateGroupCreate, PrivateGroupInvite, PrivateGroupManage,
  CouponManagement, BlogDetailPage, BlogManagement, TermsPage, PrivacyPage, SecurityPage, LegalPage,
  ContactPage, OrganizationContactPage, FAQPage, GuidePage, CancelPolicyPage, StoreListPage, AboutPage,
  PricingPage, GettingStartedPage,
} from './adminDashboardPages'
import { ADMIN_PATHS, parsePath } from './adminDashboardRouting'

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


export function AdminDashboard() {
  const { user, loading, isInitialized, isAdmin, isStaff, isCustomer } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { organization } = useOrganization()
  const { prefetchSchedule, prefetchAdminPages } = usePrefetch()

  // パスを解析（毎回解析することでURLと表示を同期）
  const { page: currentPage, scenarioId: currentScenarioId, organizationSlug: pathOrganizationSlug } = parsePath(location.pathname)
  useRouteSeo(currentPage)

  // 組織slugを決定（パスにあればそれ、なければ組織設定から取得）
  const organizationSlug = pathOrganizationSlug || organization?.slug || ''

  // スタッフ確定後、ブラウザがアイドル状態になってから前月・当月・次月を先読み
  // requestIdleCallback でダッシュボード自身の描画・データ取得を優先させる
  useEffect(() => {
    if (!isStaff || !isInitialized || currentPage === 'schedule') return
    const run = () => {
      const now = new Date()
      prefetchSchedule(now)
      prefetchSchedule(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      prefetchSchedule(new Date(now.getFullYear(), now.getMonth() + 1, 1))
      // スタッフ管理・シナリオ管理のマスターデータを先読み
      prefetchAdminPages()
    }
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(run, { timeout: 5000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(run, 2000)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, isInitialized])

  // ユーザーロールが確定したときに初回リダイレクト
  useEffect(() => {
    if (!isInitialized || loading) return

    const isCustomerOrLoggedOut = isCustomer
    const defaultOrg = organization?.slug || ''
    
    // ルートパス（/）はプラットフォームトップを表示（リダイレクトしない）
    if (location.pathname === '/') {
      return
    }
    
    // 顧客/ログアウト状態で管理ページにいる場合は追い出す
    // 未ログイン → ログインへ（戻り先を保持）。顧客 → 予約サイトへ。
    // `/stores` は公開の参加店舗一覧なので対象外。
    if (
      isCustomerOrLoggedOut
      && ADMIN_PATHS.includes(currentPage)
      && !isPublicStoresPath(currentPage, location.pathname)
    ) {
      if (!user) {
        const redirect = encodeURIComponent(location.pathname + location.search)
        navigate(`/login?redirect=${redirect}`, { replace: true })
      } else {
        navigate(defaultOrg ? `/${defaultOrg}` : '/', { replace: true })
      }
      return
    }
  }, [user, currentPage, isInitialized, loading, location.pathname, location.search, navigate, organization?.slug, isCustomer])

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

  if (currentPage === 'store-dashboard') {
    return (
      <AppLayout currentPage="store-dashboard" containerPadding="p-0">
        <Suspense fallback={<LoadingScreen message="店舗ダッシュボードを読み込み中..." />}>
          <StoreDashboard />
        </Suspense>
      </AppLayout>
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
    // スタッフ管理（招待・アカウント紐付け・権限変更）は管理者(admin/license_admin)専用
    // 認証確定前に !isAdmin で弾かない（正規管理者まで弾いていた問題の再発防止）
    if (!isInitialized || loading) {
      return <LoadingScreen message="権限を確認中..." />
    }
    if (!isAdmin) {
      return <AdminOnlyNotice currentPage="staff" />
    }
    return (
      <Suspense fallback={<LoadingScreen message="スタッフ管理を読み込み中..." />}>
        <StaffManagement />
      </Suspense>
    )
  }
  
  if (currentPage === 'sales') {
    // 売上（集計・粗利・給与）は管理者(admin/license_admin)専用
    if (!isInitialized || loading) {
      return <LoadingScreen message="権限を確認中..." />
    }
    if (!isAdmin) {
      return <AdminOnlyNotice currentPage="sales" />
    }
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
        <Suspense
          fallback={<div className="min-h-screen bg-background" aria-busy="true" />}
        >
          <ScenarioDetailPage
            scenarioId={currentScenarioId}
            onClose={handleScenarioClose}
            organizationSlug={organizationSlug}
          />
        </Suspense>
      )
    }
    return (
      <Suspense
        fallback={<div className="min-h-screen bg-background" aria-busy="true" />}
      >
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

  if (currentPage === 'rental-report' && organizationSlug) {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <RentalReportForm organizationSlug={organizationSlug} />
      </Suspense>
    )
  }

  if (currentPage === 'partner-report' && currentScenarioId) {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <LicensePartnerReportForm token={currentScenarioId} />
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

  // ブログ記事詳細ページ
  if (currentPage === 'blog-detail') {
    const { scenarioId: slug, organizationSlug: blogOrgSlug } = parsePath(location.pathname)
    if (slug) {
      return (
        <Suspense fallback={<LoadingScreen message="記事を読み込み中..." />}>
          <BlogDetailPage slug={slug} organizationSlug={blogOrgSlug} />
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

  if (currentPage === 'private-booking-groups') {
    return (
      <Suspense fallback={<LoadingScreen message="グループ一覧を読み込み中..." />}>
        <PrivateGroupListPage />
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

  if (currentPage === 'coupons') {
    return (
      <Suspense fallback={<LoadingScreen message="クーポン管理を読み込み中..." />}>
        <CouponManagement />
      </Suspense>
    )
  }

  if (currentPage === 'blog') {
    return (
      <Suspense fallback={<LoadingScreen message="ブログ管理を読み込み中..." />}>
        <BlogManagement />
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
    // 設定（組織・給与・メール・データ管理等）は管理者(admin/license_admin)専用
    if (!isInitialized || loading) {
      return <LoadingScreen message="権限を確認中..." />
    }
    if (!isAdmin) {
      return <AdminOnlyNotice currentPage="settings" />
    }
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

  // 貸切グループ作成
  if (currentPage === 'group-create') {
    return (
      <Suspense fallback={<LoadingScreen message="グループ作成を読み込み中..." />}>
        <PrivateGroupCreate />
      </Suspense>
    )
  }

  // 貸切グループ招待（招待コードはcurrentScenarioIdに格納）
  if (currentPage === 'group-invite') {
    return (
      <Suspense fallback={<LoadingScreen message="グループ招待を読み込み中..." />}>
        <PrivateGroupInvite />
      </Suspense>
    )
  }

  // 貸切グループ管理（グループIDはcurrentScenarioIdに格納）
  if (currentPage === 'group-manage') {
    return (
      <Suspense fallback={<LoadingScreen message="グループ管理を読み込み中..." />}>
        <PrivateGroupManage />
      </Suspense>
    )
  }

  if (currentPage === 'my-page' || currentPage === 'mypage') {
    const isCustomerOrLoggedOut = isCustomer
    const shouldShowNavigation = isStaff
    
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header onPageChange={handlePageChange} />
        <div className="flex flex-1">
          {shouldShowNavigation && <AdminSidebar />}
          <div className="flex-1">
            <Suspense fallback={<LoadingScreen message="マイページを読み込み中..." />}>
              <MyPage />
            </Suspense>
          </div>
        </div>
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

  // MMQ訴求ランディングページ
  if (currentPage === 'lp') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <LandingPage />
      </Suspense>
    )
  }

  // 開発用：デザインプレビューページ（開発ビルドのみ。本番では 404）
  if (currentPage === 'dev-design-preview') {
    if (!import.meta.env.DEV) {
      return (
        <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
          <NotFoundPage />
        </Suspense>
      )
    }
    return (
      <Suspense fallback={<LoadingScreen message="デザインプレビューを読み込み中..." />}>
        <DesignPreview />
      </Suspense>
    )
  }

  // 開発用：UIコンポーネントギャラリー（開発ビルドのみ。本番では 404）
  if (currentPage === 'dev-components') {
    if (!import.meta.env.DEV) {
      return (
        <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
          <NotFoundPage />
        </Suspense>
      )
    }
    return (
      <Suspense fallback={<LoadingScreen message="コンポーネントギャラリーを読み込み中..." />}>
        <ComponentGallery />
      </Suspense>
    )
  }

  // 運営管理者専用：プロジェクト理解ガイド
  if (currentPage === 'dev-project-guide') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <ProjectGuide />
      </Suspense>
    )
  }

  // 運営管理者専用：学習ページ
  if (currentPage === 'dev-learn') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <LearnFromThisSystem />
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

  if (currentPage === 'security') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <SecurityPage />
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

  // 組織固有FAQページ
  if (currentPage === 'org-faq' && pathOrganizationSlug) {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <FAQPage organizationSlug={pathOrganizationSlug} />
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
        <ForBusinessPage />
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
      <AppLayout currentPage="add-demo-participants">
        <Suspense fallback={<LoadingScreen message="ツールを読み込み中..." />}>
          <AddDemoParticipants />
        </Suspense>
      </AppLayout>
    )
  }

  if (currentPage === 'scenario-matcher') {
    return (
      <Suspense fallback={<LoadingScreen message="ツールを読み込み中..." />}>
        <ScenarioMatcher />
      </Suspense>
    )
  }

  if (currentPage === 'organizations' || currentPage === 'organization-settings') {
    return (
      <Suspense fallback={<LoadingScreen message="テナント管理を読み込み中..." />}>
        <OrganizationManagement />
      </Suspense>
    )
  }

  if (currentPage === 'external-reports') {
    return (
      <Suspense fallback={<LoadingScreen message="外部レポートを読み込み中..." />}>
        <ExternalReports />
      </Suspense>
    )
  }

  if (currentPage === 'license-reports') {
    return (
      <Suspense fallback={<LoadingScreen message="ライセンス報告を読み込み中..." />}>
        <LicenseReportManagement />
      </Suspense>
    )
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

  if (currentPage === 'start') {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <OrgSignup />
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

  // スタッフ/管理者でない場合で、認識されないページの場合は404を表示
  const isStaffOrAdmin = isStaff
  const knownPages = ['dashboard', 'report-form', 'rental-report', 'partner-report']
  if (!isStaffOrAdmin && !knownPages.includes(currentPage)) {
    return (
      <Suspense fallback={<LoadingScreen message="読み込み中..." />}>
        <NotFoundPage />
      </Suspense>
    )
  }

  return (
    <AppLayout currentPage={currentPage} containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
      <div className="max-w-[1440px] mx-auto">
        <Suspense fallback={<LoadingScreen message="ダッシュボードを読み込み中..." />}>
          {currentPage === 'dashboard' ? (
            <DashboardHome onPageChange={handlePageChange} />
          ) : currentPage === 'report-form' ? (
            <ExternalReportForm />
          ) : (
            <DashboardHome onPageChange={handlePageChange} />
          )}
        </Suspense>
      </div>
    </AppLayout>
  )
}
