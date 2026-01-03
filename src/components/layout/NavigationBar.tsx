import { useMemo, useCallback, memo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useStoreConfirmationPendingCount } from '@/hooks/useStoreConfirmationPendingCount'
import { useOrganization } from '@/hooks/useOrganization'
import { 
  CalendarDays,
  Users, 
  BookOpen, 
  TrendingUp,
  CalendarClock,
  Settings,
  ClipboardCheck,
  UserCog,
  Store,
  HelpCircle,
  Globe,
  LayoutDashboard,
  UserCircle,
  UserCheck,
  Ticket,
  FileCheck
} from 'lucide-react'

interface NavigationBarProps {
  currentPage?: string
  onPageChange?: (pageId: string) => void
}

export const NavigationBar = memo(function NavigationBar({ currentPage, onPageChange }: NavigationBarProps) {
  const { user } = useAuth()
  const location = useLocation()
  const { count: storeConfirmationPendingCount } = useStoreConfirmationPendingCount()
  const { organization } = useOrganization()
  
  // 組織のslugを取得（デフォルトはqueens-waltz）
  const bookingSlug = organization?.slug || 'queens-waltz'
  
  // 顧客の場合はナビゲーションを表示しない
  if (user?.role === 'customer') {
    return null
  }
  
  // 全タブ定義（全て組織スラッグ付き）
  const allTabs = useMemo(() => [
    { id: 'dashboard', path: `/${bookingSlug}/dashboard`, label: 'ダッシュボード', icon: LayoutDashboard, roles: ['admin', 'staff'] },
    { id: 'booking', path: `/${bookingSlug}`, label: '予約サイト', icon: Globe, roles: ['admin', 'staff'] },
    { id: 'stores', path: `/${bookingSlug}/stores`, label: '店舗', icon: Store, roles: ['admin'] },
    { id: 'schedule', path: `/${bookingSlug}/schedule`, label: 'スケジュール', icon: CalendarDays, roles: ['admin', 'staff'] },
    { id: 'staff', path: `/${bookingSlug}/staff`, label: 'スタッフ', icon: Users, roles: ['admin'] },
    { id: 'scenarios', path: `/${bookingSlug}/scenarios`, label: 'シナリオ', icon: BookOpen, roles: ['admin'] },
    { id: 'shift-submission', path: `/${bookingSlug}/shift-submission`, label: 'シフト提出', icon: CalendarClock, roles: ['admin', 'staff'] },
    { id: 'gm-availability', path: `/${bookingSlug}/gm-availability`, label: 'GM確認', icon: UserCheck, roles: ['admin', 'staff'] },
    { id: 'staff-profile', path: `/${bookingSlug}/staff-profile`, label: '担当作品', icon: UserCircle, roles: ['admin', 'staff'] },
    { id: 'private-booking-management', path: `/${bookingSlug}/private-booking-management`, label: '貸切管理', icon: ClipboardCheck, roles: ['admin'] },
    { id: 'reservations', path: `/${bookingSlug}/reservations`, label: '予約管理', icon: Ticket, roles: ['admin'] },
    { id: 'accounts', path: `/${bookingSlug}/accounts`, label: 'アカウント', icon: UserCog, roles: ['admin'] },
    { id: 'sales', path: `/${bookingSlug}/sales`, label: '売上', icon: TrendingUp, roles: ['admin'] },
    { id: 'license-management', path: `/${bookingSlug}/license-management`, label: '公演報告', icon: FileCheck, roles: ['admin', 'staff'] },
    { id: 'settings', path: `/${bookingSlug}/settings`, label: '設定', icon: Settings, roles: ['admin'] },
    { id: 'manual', path: `/${bookingSlug}/manual`, label: 'マニュアル', icon: HelpCircle, roles: ['admin', 'staff'] }
  ], [bookingSlug])
  
  // ユーザーのロールに応じてタブをフィルタリング
  const navigationTabs = useMemo(() => {
    if (!user || !user.role) {
      return []
    }
    return allTabs.filter(tab => tab.roles.includes(user.role))
  }, [allTabs, user])

  // アクティブ判定
  const isTabActive = useCallback((tab: typeof allTabs[0]) => {
    const pathname = location.pathname
    
    // 予約サイトは特別処理：/{slug} のみの場合
    if (tab.id === 'booking') {
      // パスが /{slug} のみで、他の管理パスがない場合
      const adminSuffixes = ['/dashboard', '/stores', '/staff', '/scenarios', '/schedule', 
        '/shift-submission', '/gm-availability', '/private-booking-management', '/reservations',
        '/accounts', '/sales', '/settings', '/manual', '/staff-profile', '/license-management',
        '/catalog', '/private-booking-select', '/private-booking-request']
      const isAdminPage = adminSuffixes.some(suffix => pathname.includes(suffix))
      return pathname === `/${bookingSlug}` || (pathname.startsWith(`/${bookingSlug}/`) && !isAdminPage)
    }
    
    // 通常のパスマッチング
    return pathname === tab.path || pathname.startsWith(tab.path + '/')
  }, [location.pathname, bookingSlug])

  // タブクリックハンドラ
  const handleTabClick = useCallback((tab: typeof allTabs[0], e: React.MouseEvent) => {
    // 中クリック、Cmd+クリック、Ctrl+クリックの場合は通常のリンク動作
    if (e.button === 1 || e.metaKey || e.ctrlKey) {
      return
    }
    
    // Linkコンポーネントのパスを使用するため、onPageChangeは使わない
    // onPageChangeが渡されていても、Linkの遷移に任せる
  }, [])

  return (
    <nav className="border-b border-border bg-muted/30">
      <div className="mx-auto px-0 sm:px-2 md:px-4 md:px-8 py-1.5 sm:py-2 md:py-3 max-w-full overflow-x-auto overflow-y-hidden">
        <div className="flex items-center justify-start gap-0 sm:gap-0.5 md:gap-1 min-w-max">
          {navigationTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = isTabActive(tab)
            const badgeCount = tab.id === 'private-booking-management' ? storeConfirmationPendingCount : 0
            
            return (
              <Link
                key={tab.id}
                to={tab.path}
                onClick={(e) => handleTabClick(tab, e)}
                className={`relative inline-flex flex-col items-center justify-center gap-0.5 sm:flex-row sm:gap-1 md:gap-1 px-2 sm:px-2.5 md:px-2.5 py-1.5 sm:py-2 md:py-2 text-xs sm:text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground rounded-none min-w-[48px] sm:min-w-[56px] md:min-w-auto touch-manipulation ${
                  isActive 
                    ? 'text-foreground border-b-[2px] sm:border-b-[3px] border-primary bg-accent/50' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title={tab.label}
              >
                <Icon className="h-4 w-4 sm:h-4 sm:w-4 md:h-4 md:w-4 flex-shrink-0" />
                <span className="hidden md:inline whitespace-nowrap">{tab.label}</span>
                <span className="md:hidden text-xs sm:text-xs leading-tight text-center">{tab.label.length > 3 ? tab.label.slice(0, 3) : tab.label}</span>
                {badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 sm:top-0 sm:right-0 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
})
