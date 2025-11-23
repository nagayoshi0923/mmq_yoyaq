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
    window.location.hash = pageId === 'dashboard' ? '' : pageId
  }, [])

  // シナリオ選択時のハンドラー
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

  // 統計情報を遅延ロード（ダッシュボード表示をブロックしない）
  const [stats, setStats] = React.useState({
    stores: 0,
    performances: 0,
    reservations: 0,
    revenue: 0
  })

  // ダッシュボード表示時のみ統計を取得
  React.useEffect(() => {
    if (currentPage === 'dashboard') {
      // モックデータ（後でSupabaseから取得）
      setTimeout(() => {
        setStats({
          stores: 6,
          performances: 42,
          reservations: 128,
          revenue: 1250000
        })
      }, 100) // 少し遅延させてUIを優先
    }
  }, [currentPage])

  // 最適化: navigationTabsをuseMemoでメモ化（毎回新しい配列が生成されるのを防ぐ）
  const navigationTabs = React.useMemo(() => [
    { id: 'stores', label: '店舗', icon: Store, color: 'bg-blue-100 text-blue-800' },
    { id: 'schedule', label: 'スケジュール', icon: Calendar, color: 'bg-green-100 text-green-800' },
    { id: 'staff', label: 'スタッフ', icon: Users, color: 'bg-purple-100 text-purple-800' },
    { id: 'scenarios', label: 'シナリオ', icon: BookOpen, color: 'bg-orange-100 text-orange-800' },
    { id: 'shift-submission', label: 'シフト提出', icon: Clock, color: 'bg-indigo-100 text-indigo-800' },
    { id: 'customer-booking', label: '予約サイト', icon: Calendar, color: 'bg-teal-100 text-teal-800' },
    { id: 'reservations', label: '予約管理', icon: Calendar, color: 'bg-red-100 text-red-800' },
    { id: 'customers', label: '顧客', icon: Users, color: 'bg-amber-100 text-amber-800' },
    { id: 'user-management', label: 'ユーザー', icon: UserCog, color: 'bg-violet-100 text-violet-800' },
    { id: 'sales', label: '売上', icon: TrendingUp, color: 'bg-emerald-100 text-emerald-800' },
    { id: 'settings', label: '設定', icon: Settings, color: 'bg-gray-100 text-gray-800' }
  ], [])

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
        <div className="space-y-3 sm:space-y-4 md:space-y-6">
          {/* 概要統計 */}
          <section>
            <h2 className="text-base md:text-lg">概要</h2>
            <div className="grid grid-cols-2 gap-2 xs:gap-2.5 sm:gap-3 md:gap-4 mt-2 xs:mt-3 sm:mt-4">
              <Card>
                <CardHeader className="pb-1.5 xs:pb-2 sm:pb-3 p-2 xs:p-3 sm:p-4 md:p-6">
                  <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-sm md:text-base">
                    <Store className="h-3.5 w-3.5 xs:h-4 xs:w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">店舗数</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 xs:p-3 sm:p-4 md:p-6 pt-1">
                  <div className="text-base md:text-lg">{stats.stores}</div>
                  <p className="text-muted-foreground text-xs">店舗運営中</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1.5 xs:pb-2 sm:pb-3 p-2 xs:p-3 sm:p-4 md:p-6">
                  <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-sm md:text-base">
                    <BookOpen className="h-3.5 w-3.5 xs:h-4 xs:w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">公演数</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 xs:p-3 sm:p-4 md:p-6 pt-1">
                  <div className="text-base md:text-lg">{stats.performances}</div>
                  <p className="text-muted-foreground text-xs">シナリオ登録済み</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1.5 xs:pb-2 sm:pb-3 p-2 xs:p-3 sm:p-4 md:p-6">
                  <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-sm md:text-base">
                    <Calendar className="h-3.5 w-3.5 xs:h-4 xs:w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">今月の予約</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 xs:p-3 sm:p-4 md:p-6 pt-1">
                  <div className="text-base md:text-lg">{stats.reservations}</div>
                  <p className="text-muted-foreground text-xs">件の予約</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1.5 xs:pb-2 sm:pb-3 p-2 xs:p-3 sm:p-4 md:p-6">
                  <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-sm md:text-base">
                    <TrendingUp className="h-3.5 w-3.5 xs:h-4 xs:w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">今月の売上</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 xs:p-3 sm:p-4 md:p-6 pt-1">
                  <div className="text-base md:text-lg">
                    ¥{stats.revenue.toLocaleString()}
                  </div>
                  <p className="text-muted-foreground text-xs">前月比 +12%</p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ナビゲーションタブ */}
          <section>
            <h2 className="text-base md:text-lg">機能メニュー</h2>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4 mt-3 sm:mt-4">
              {navigationTabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <Card 
                    key={tab.id} 
                    className="hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => handlePageChange(tab.id)}
                  >
                    <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-4 md:p-6">
                      <CardTitle className="flex items-center gap-1 sm:gap-2 text-sm md:text-base">
                        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                        <span className="truncate">{tab.label}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
                      <Badge className={`${tab.color} text-xs sm:text-sm`}>
                        {tab.id === 'stores' && '6店舗'}
                        {tab.id === 'schedule' && '今月128件'}
                        {tab.id === 'staff' && '15名'}
                        {tab.id === 'scenarios' && '42本'}
                        {tab.id === 'reservations' && '新規3件'}
                        {tab.id === 'customers' && '245名'}
                        {tab.id === 'user-management' && 'ロール管理'}
                        {tab.id === 'sales' && '¥1.25M'}
                        {tab.id === 'settings' && '設定'}
                      </Badge>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>

          {/* 最近の活動 */}
          <section>
            <h2 className="text-base md:text-lg">最近の活動</h2>
            <Card className="mt-3 sm:mt-4">
              <CardHeader className="p-3 sm:p-4 md:p-6">
                <CardTitle className="text-base md:text-lg">システム活動ログ</CardTitle>
                <CardDescription className="text-xs sm:text-sm">最新の予約・変更・キャンセル情報</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 md:p-6">
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border border-border rounded-md">
                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm"><strong>新規予約</strong> - 高田馬場店「人狼村の悲劇」</p>
                      <p className="text-muted-foreground text-xs">2024年12月25日 14:00-17:00 / 6名</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800 text-xs flex-shrink-0">5分前</Badge>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border border-border rounded-md">
                    <div className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm"><strong>貸切予約</strong> - 別館②「密室の謎」</p>
                      <p className="text-muted-foreground text-xs">2024年12月26日 19:00-22:00 / 8名</p>
                    </div>
                    <Badge className="bg-purple-100 text-purple-800 text-xs flex-shrink-0">15分前</Badge>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border border-border rounded-md">
                    <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm"><strong>GMテスト</strong> - 大久保店「新シナリオ検証」</p>
                      <p className="text-muted-foreground text-xs">2024年12月24日 10:00-13:00 / スタッフ4名</p>
                    </div>
                    <Badge className="bg-orange-100 text-orange-800 text-xs flex-shrink-0">1時間前</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  )
}
