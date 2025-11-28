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
const DashboardHome = lazy(() => import('./DashboardHome').then(m => ({ default: m.DashboardHome })))

export function AdminDashboard() {
  const { user, isInitialized } = useAuth()

  // 管理ツールのページ一覧（顧客がアクセスできないページ）
  const adminOnlyPages = [
    'dashboard',
    'stores',
    'staff',
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
    'add-demo-participants',
    'scenario-matcher'
  ]

  // ハッシュを解析してページとシナリオIDを返すユーティリティ
  function parseHash(hash: string, userRole?: string | null): { page: string, scenarioId: string | null } {
    const scenarioMatch = hash.match(/customer-booking\/scenario\/([^/?]+)/)
    if (scenarioMatch) {
      return { page: 'customer-booking', scenarioId: scenarioMatch[1] }
    }
    // staff/edit/{staffId} のルーティング
    if (hash.startsWith('staff/edit/') || hash.startsWith('staff-edit/')) {
      return { page: 'staff', scenarioId: null }
    }
    if (hash.startsWith('scenarios/edit')) {
      return { page: 'scenarios-edit', scenarioId: null }
    }
    if (hash.startsWith('customer-booking')) {
      return { page: 'customer-booking', scenarioId: null }
    }
    if (hash.startsWith('private-booking-select')) {
      return { page: 'private-booking-select', scenarioId: null }
    }
    if (hash.startsWith('private-booking-request')) {
      return { page: 'private-booking-request', scenarioId: null }
    }
    if (hash.startsWith('private-booking-management')) {
      return { page: 'private-booking-management', scenarioId: null }
    }
    if (hash.startsWith('user-management')) {
      return { page: 'user-management', scenarioId: null }
    }
    if (hash.startsWith('add-demo-participants')) {
      return { page: 'add-demo-participants', scenarioId: null }
    }
    if (hash.startsWith('scenario-matcher')) {
      return { page: 'scenario-matcher', scenarioId: null }
    }
    // ハッシュからクエリパラメータを分離
    const hashWithoutQuery = hash.split('?')[0]
    
    if (!hash && userRole === 'customer') {
      return { page: 'customer-booking', scenarioId: null }
    }
    
    // loginページは特別扱い
    if (hashWithoutQuery === 'login') {
      return { page: 'login', scenarioId: null }
    }
    
    return { page: hashWithoutQuery || 'dashboard', scenarioId: null }
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

  // ページ変更時にURLのハッシュを更新
  const handlePageChange = useCallback((pageId: string) => {
    setCurrentPage(pageId)
    setSelectedScenarioId(null) // ページ変更時はシナリオ選択をクリア
    // キャッシュ回避のため、明示的に dashboard ハッシュを使用する
    window.location.hash = pageId
  }, [])
  const handleScenarioSelect = useCallback((scenarioId: string) => {
    setSelectedScenarioId(scenarioId)
    window.location.hash = `customer-booking/scenario/${scenarioId}`
  }, [])

  // シナリオ詳細を閉じる
  const handleScenarioClose = useCallback(() => {
    setSelectedScenarioId(null)
    window.location.hash = 'customer-booking'
  }, [])

  // ユーザーロールが確定したときに初回リダイレクト
  // ⚠️ 重要: 認証完了後のみリダイレクト（早期表示時はリダイレクトしない）
  React.useEffect(() => {
    // 認証が完了していない場合は何もしない（現在のページを維持）
    if (!isInitialized) {
      return
    }

    // ログアウト状態または顧客アカウントの場合
    const isCustomerOrLoggedOut = !user || user.role === 'customer'
    
    // デフォルトページを予約サイトに設定
    if (isCustomerOrLoggedOut && (!currentPage || currentPage === 'dashboard')) {
      setCurrentPage('customer-booking')
      window.location.hash = 'customer-booking'
      return
    }

    // 顧客が管理ツールのページにアクセスしようとした場合は予約サイトにリダイレクト
    if (user && user.role === 'customer' && adminOnlyPages.includes(currentPage)) {
      setCurrentPage('customer-booking')
      window.location.hash = 'customer-booking'
      return
    }

    // ログアウト状態で管理ツールのページにアクセスしようとした場合は予約サイトにリダイレクト
    if (!user && adminOnlyPages.includes(currentPage)) {
      setCurrentPage('customer-booking')
      window.location.hash = 'customer-booking'
      return
    }

    // 通常のログインユーザーの場合
    if (user && currentPage === 'dashboard' && !window.location.hash) {
      // admin/staffの場合はダッシュボードを表示
      if (user.role === 'admin' || user.role === 'staff') {
        // ダッシュボードはそのまま表示
      }
    }
  }, [user, currentPage, isInitialized])

  // ブラウザの戻る/進むボタンに対応
  React.useEffect(() => {
    const handleHashChange = () => {
      const { page, scenarioId } = parseHash(window.location.hash.slice(1), user?.role)
      
      // ⚠️ 認証完了後のみリダイレクト判定を行う
      if (isInitialized) {
        // ログアウト状態または顧客アカウントの場合、管理ツールのページへのアクセスを制限
        const isCustomerOrLoggedOut = !user || user.role === 'customer'
        const restrictedPages = ['dashboard', 'stores', 'staff', 'scenarios', 'scenarios-edit', 'schedule', 'shift-submission', 'gm-availability', 'private-booking-management', 'reservations', 'customer-management', 'user-management', 'sales', 'settings', 'add-demo-participants', 'scenario-matcher']
        if (isCustomerOrLoggedOut && restrictedPages.includes(page)) {
          // 管理ツールのページにアクセスしようとした場合は予約サイトにリダイレクト
          setCurrentPage('customer-booking')
          window.location.hash = 'customer-booking'
          return
        }
      }
      
      setCurrentPage(page)
      setSelectedScenarioId(scenarioId)
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [user?.role, user, isInitialized])

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
