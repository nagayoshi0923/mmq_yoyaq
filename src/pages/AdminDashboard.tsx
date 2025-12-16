import React, { useState, useCallback, lazy, Suspense } from 'react'
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
// v1.1: DashboardHomeの読み込み問題を解消するためのキャッシュバスター
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
const UserManagement = lazy(() => import('./UserManagement').then(m => ({ default: m.UserManagement })))
const CustomerManagement = lazy(() => import('./CustomerManagement'))
const MyPage = lazy(() => import('./MyPage'))
const SettingsPage = lazy(() => import('./Settings'))
const AddDemoParticipants = lazy(() => import('./AddDemoParticipants').then(m => ({ default: m.AddDemoParticipants })))
const ScenarioMatcher = lazy(() => import('./ScenarioMatcher').then(m => ({ default: m.ScenarioMatcher })))
const ManualPage = lazy(() => import('./Manual/index').then(m => ({ default: m.ManualPage })))
const DashboardHome = lazy(() => import('./DashboardHome').then(m => ({ default: m.DashboardHome })))
const StaffProfile = lazy(() => import('./StaffProfile').then(m => ({ default: m.StaffProfile })))
// マルチテナント対応ページ
const OrganizationManagement = lazy(() => import('./OrganizationManagement'))
const ExternalReports = lazy(() => import('./ExternalReports'))
const LicenseReportManagement = lazy(() => import('./LicenseReportManagement'))

export function AdminDashboard() {
  const { user, loading, isInitialized } = useAuth()

  // 管理ツールのページ一覧（顧客がアクセスできないページ）
  const adminOnlyPages = [
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
    'customer-management',
    'user-management',
    'sales',
    'settings',
    'manual',
    'add-demo-participants',
    'scenario-matcher',
    'organizations',
    'external-reports',
    'license-reports'
  ]

  // ハッシュを解析してページ、シナリオID、組織slugを返すユーティリティ
  function parseHash(hash: string, userRole?: string | null): { page: string, scenarioId: string | null, organizationSlug: string | null } {
    // scenario-detail/{scenarioId} のルーティング
    const scenarioDetailMatch = hash.match(/scenario-detail\/([^/?]+)/)
    if (scenarioDetailMatch) {
      return { page: 'scenario-detail', scenarioId: scenarioDetailMatch[1], organizationSlug: null }
    }
    
    // booking/{slug}/scenario/{scenarioId} のルーティング（新形式）
    const bookingScenarioMatch = hash.match(/booking\/([^/]+)\/scenario\/([^/?]+)/)
    if (bookingScenarioMatch) {
      return { page: 'booking', scenarioId: bookingScenarioMatch[2], organizationSlug: bookingScenarioMatch[1] }
    }
    
    // booking/{slug} のルーティング（新形式）
    const bookingMatch = hash.match(/booking\/([^/?]+)/)
    if (bookingMatch && !hash.includes('/scenario/')) {
      return { page: 'booking', scenarioId: null, organizationSlug: bookingMatch[1] }
    }
    
    // 旧形式: customer-booking/scenario/{scenarioId}（後方互換性）
    const scenarioMatch = hash.match(/customer-booking\/scenario\/([^/?]+)/)
    if (scenarioMatch) {
      return { page: 'customer-booking', scenarioId: scenarioMatch[1], organizationSlug: null }
    }
    // staff/edit/{staffId} のルーティング
    if (hash.startsWith('staff/edit/') || hash.startsWith('staff-edit/')) {
      return { page: 'staff', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('scenarios/edit')) {
      return { page: 'scenarios-edit', scenarioId: null, organizationSlug: null }
    }
    // 旧形式: customer-booking（後方互換性）
    if (hash.startsWith('customer-booking')) {
      return { page: 'customer-booking', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('private-booking-select')) {
      return { page: 'private-booking-select', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('private-booking-request')) {
      return { page: 'private-booking-request', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('private-booking-management')) {
      return { page: 'private-booking-management', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('user-management')) {
      return { page: 'user-management', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('add-demo-participants')) {
      return { page: 'add-demo-participants', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('scenario-matcher')) {
      return { page: 'scenario-matcher', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('catalog')) {
      return { page: 'catalog', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('manual')) {
      return { page: 'manual', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('organizations')) {
      return { page: 'organizations', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('external-reports')) {
      return { page: 'external-reports', scenarioId: null, organizationSlug: null }
    }
    if (hash.startsWith('license-reports')) {
      return { page: 'license-reports', scenarioId: null, organizationSlug: null }
    }
    // ハッシュからクエリパラメータを分離
    const hashWithoutQuery = hash.split('?')[0]
    
    if (!hash && userRole === 'customer') {
      // デフォルトでクインズワルツの予約サイトへ
      return { page: 'booking', scenarioId: null, organizationSlug: 'queens-waltz' }
    }
    
    // loginページは特別扱い
    if (hashWithoutQuery === 'login') {
      return { page: 'login', scenarioId: null, organizationSlug: null }
    }
    
    return { page: hashWithoutQuery || 'dashboard', scenarioId: null, organizationSlug: null }
  }

  const [currentPage, setCurrentPage] = useState(() => {
    const hash = window.location.hash.slice(1)
    // ⚠️ 初期化時はユーザー状態を参照せず、ハッシュをそのまま使用
    // ユーザー状態によるリダイレクトはuseEffect内で処理
    if (!hash) return 'dashboard'
    const { page } = parseHash(hash, undefined)  // userRoleは渡さない
    return page
  })
  
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(() => {
    const { scenarioId } = parseHash(window.location.hash.slice(1), user?.role)
    return scenarioId
  })
  
  // 組織slug（予約サイトのパス方式用）
  const [organizationSlug, setOrganizationSlug] = useState<string | null>(() => {
    const { organizationSlug } = parseHash(window.location.hash.slice(1), user?.role)
    return organizationSlug
  })

  // ページ変更時にURLのハッシュを更新
  const handlePageChange = useCallback((pageId: string) => {
    setCurrentPage(pageId)
    setSelectedScenarioId(null) // ページ変更時はシナリオ選択をクリア
    setOrganizationSlug(null) // ページ変更時は組織slugもクリア
    // キャッシュ回避のため、明示的に dashboard ハッシュを使用する
    window.location.hash = pageId
  }, [])
  
  // シナリオ選択（予約サイト用）
  const handleScenarioSelect = useCallback((scenarioId: string) => {
    setSelectedScenarioId(scenarioId)
    // 組織slugがある場合は新形式、ない場合は旧形式
    if (organizationSlug) {
      window.location.hash = `booking/${organizationSlug}/scenario/${scenarioId}`
    } else {
      window.location.hash = `customer-booking/scenario/${scenarioId}`
    }
  }, [organizationSlug])

  // シナリオ詳細を閉じる
  const handleScenarioClose = useCallback(() => {
    setSelectedScenarioId(null)
    // 組織slugがある場合は新形式、ない場合は旧形式
    if (organizationSlug) {
      window.location.hash = `booking/${organizationSlug}`
    } else {
      window.location.hash = 'customer-booking'
    }
  }, [organizationSlug])

  // ユーザーロールが確定したときに初回リダイレクト
  // ⚠️ 重要: 認証完了後のみリダイレクト（早期表示時はリダイレクトしない）
  React.useEffect(() => {
    // 認証が完了していない場合、またはまだロード中の場合は何もしない
    if (!isInitialized || loading) {
      return
    }

    // ログアウト状態または顧客アカウントの場合
    const isCustomerOrLoggedOut = !user || user.role === 'customer'
    
    // 顧客/ログアウト状態でダッシュボードや管理ページにいる場合は予約サイトにリダイレクト
    if (isCustomerOrLoggedOut && (!currentPage || currentPage === 'dashboard' || adminOnlyPages.includes(currentPage))) {
      setCurrentPage('booking')
      setOrganizationSlug('queens-waltz')
      window.location.hash = 'booking/queens-waltz'
      return
    }

    // スタッフ/管理者がログインしていて、ハッシュがない場合はダッシュボードを表示
    if (user && (user.role === 'admin' || user.role === 'staff')) {
      const hash = window.location.hash.slice(1)
      if (!hash || hash === '') {
        setCurrentPage('dashboard')
        window.location.hash = 'dashboard'
        return
      }
    }
  }, [user, currentPage, isInitialized, loading])

  // ブラウザの戻る/進むボタンに対応
  React.useEffect(() => {
    const handleHashChange = () => {
      const { page, scenarioId, organizationSlug: orgSlug } = parseHash(window.location.hash.slice(1), user?.role)
      
      // ⚠️ 認証完了後かつロード完了後のみリダイレクト判定を行う
      if (isInitialized && !loading) {
        // ログアウト状態または顧客アカウントの場合、管理ツールのページへのアクセスを制限
        const isCustomerOrLoggedOut = !user || user.role === 'customer'
        const restrictedPages = ['dashboard', 'stores', 'staff', 'staff-profile', 'scenarios', 'scenarios-edit', 'schedule', 'shift-submission', 'gm-availability', 'private-booking-management', 'reservations', 'customer-management', 'user-management', 'sales', 'settings', 'manual', 'add-demo-participants', 'scenario-matcher', 'organizations', 'external-reports', 'license-reports']
        if (isCustomerOrLoggedOut && restrictedPages.includes(page)) {
          // 管理ツールのページにアクセスしようとした場合は予約サイトにリダイレクト
          setCurrentPage('booking')
          setOrganizationSlug('queens-waltz')
          window.location.hash = 'booking/queens-waltz'
          return
        }
      }
      
      setCurrentPage(page)
      setSelectedScenarioId(scenarioId)
      setOrganizationSlug(orgSlug)
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [user?.role, user, isInitialized, loading])

  // ログインページはAdminDashboardで表示しない（App.tsxで処理される）
  if (currentPage === 'login') {
    return null
  }

  // ページ切り替え処理（Suspense でラップ）
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
  
  // 予約サイト（新形式: booking/{slug}）
  if (currentPage === 'booking' && organizationSlug) {
    // シナリオ詳細が選択されている場合
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
    // トップページを表示
    return (
      <Suspense fallback={<LoadingScreen message="予約サイトを読み込み中..." />}>
        <PublicBookingTop 
          onScenarioSelect={handleScenarioSelect} 
          organizationSlug={organizationSlug}
        />
      </Suspense>
    )
  }
  
  // 予約サイト（旧形式: customer-booking）- 後方互換性
  if (currentPage === 'customer-booking') {
    // シナリオ詳細が選択されている場合
    if (selectedScenarioId) {
      return (
        <Suspense fallback={<LoadingScreen message="シナリオ詳細を読み込み中..." />}>
          <ScenarioDetailPage 
            scenarioId={selectedScenarioId}
            onClose={handleScenarioClose}
          />
        </Suspense>
      )
    }
    // トップページを表示
    return (
      <Suspense fallback={<LoadingScreen message="予約サイトを読み込み中..." />}>
        <PublicBookingTop onScenarioSelect={handleScenarioSelect} />
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
  
  // シナリオ詳細ページ（カタログからの遷移）
  if (currentPage === 'scenario-detail') {
    const hash = window.location.hash.slice(1)
    const scenarioDetailMatch = hash.match(/scenario-detail\/([^/?]+)/)
    const scenarioId = scenarioDetailMatch ? scenarioDetailMatch[1] : null
    
    if (scenarioId) {
      return (
        <Suspense fallback={<LoadingScreen message="シナリオ詳細を読み込み中..." />}>
          <ScenarioDetailPage 
            scenarioId={scenarioId}
            onClose={() => window.history.back()}
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
  
  if (currentPage === 'user-management') {
    return (
      <Suspense fallback={<LoadingScreen message="ユーザー管理を読み込み中..." />}>
        <UserManagement />
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

  if (currentPage === 'my-page') {
    // ログアウト状態または顧客アカウントの場合はナビゲーションを表示しない
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

  // 組織管理ページ
  if (currentPage === 'organizations') {
    return (
      <Suspense fallback={<LoadingScreen message="組織管理を読み込み中..." />}>
        <OrganizationManagement />
      </Suspense>
    )
  }

  // 公演報告ページ
  if (currentPage === 'external-reports') {
    return (
      <Suspense fallback={<LoadingScreen message="公演報告を読み込み中..." />}>
        <ExternalReports />
      </Suspense>
    )
  }

  // ライセンス報告管理ページ
  if (currentPage === 'license-reports') {
    return (
      <Suspense fallback={<LoadingScreen message="ライセンス報告を読み込み中..." />}>
        <LicenseReportManagement />
      </Suspense>
    )
  }

  // ログアウト状態または顧客アカウントの場合は常にナビゲーションを表示しない
  // userがnull、undefined、またはcustomerロールの場合はナビゲーション非表示
  const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined

  return (
    <div className="min-h-screen bg-background">
      <Header onPageChange={handlePageChange} />
      {shouldShowNavigation && (
        <NavigationBar currentPage={currentPage} onPageChange={handlePageChange} />
      )}

      <main className="container mx-auto max-w-7xl px-[10px] py-2.5 xs:py-3 sm:py-4 md:py-6">
        <Suspense fallback={<LoadingScreen message="ダッシュボードを読み込み中..." />}>
          {currentPage === 'dashboard' ? (
            <DashboardHome onPageChange={handlePageChange} />
          ) : (
            // 他のページコンポーネントは上部のif文で既にリターンされているはずだが、念のためここにもロジックが必要か確認
            // いや、上のif文でreturnされているので、ここに来るのはdashboardだけのはず
            // しかし、念のため条件分岐を残すか、または構造を変えるか。
            // 既存の構造では、dashboard以外は個別のif文でreturnしている。
            // なので、ここに来る時点で currentPage === 'dashboard' または該当なしのページ
            <DashboardHome onPageChange={handlePageChange} />
          )}
        </Suspense>
      </main>
    </div>
  )
}
