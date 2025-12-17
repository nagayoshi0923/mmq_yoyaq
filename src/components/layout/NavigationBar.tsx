import { useMemo, useCallback, memo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useStoreConfirmationPendingCount } from '@/hooks/useStoreConfirmationPendingCount'
import { useOrganization } from '@/hooks/useOrganization'
import { 
  Calendar, 
  Users, 
  BookOpen, 
  TrendingUp,
  Clock,
  Settings,
  ClipboardCheck,
  UserCog,
  Store,
  HelpCircle,
  Globe,
  LayoutDashboard,
  UserCircle,
  Building2,
  FileText,
  FileCheck
} from 'lucide-react'

interface NavigationBarProps {
  currentPage?: string
  onPageChange?: (pageId: string) => void
}

export const NavigationBar = memo(function NavigationBar({ currentPage, onPageChange }: NavigationBarProps) {
  const { user } = useAuth()
  const { count: storeConfirmationPendingCount } = useStoreConfirmationPendingCount()
  const { organization } = useOrganization()
  
  // 組織のslugを取得（デフォルトはqueens-waltz）
  const bookingSlug = organization?.slug || 'queens-waltz'
  
  // 顧客の場合はナビゲーションを表示しない
  if (user?.role === 'customer') {
    return null
  }
  
  // 全タブ定義（定数なのでメモ化）
  // 管理者のみ: 店舗、スタッフ、シナリオ、予約管理、顧客管理、ユーザー、売上、設定
  // スタッフも: ダッシュボード、スケジュール、シフト提出、GM確認、マイプロフィール、マニュアル
  // 顧客: ナビゲーション非表示（予約サイトのみ）
  const allTabs = useMemo(() => [
    { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard, roles: ['admin', 'staff'] },
    { id: `booking/${bookingSlug}`, label: '予約サイト', icon: Globe, roles: ['admin', 'staff'] },
    { id: 'stores', label: '店舗', icon: Store, roles: ['admin'] },
    { id: 'schedule', label: 'スケジュール', icon: Calendar, roles: ['admin', 'staff'] },
    { id: 'staff', label: 'スタッフ', icon: Users, roles: ['admin'] },
    { id: 'scenarios', label: 'シナリオ', icon: BookOpen, roles: ['admin'] },
    { id: 'shift-submission', label: 'シフト提出', icon: Clock, roles: ['admin', 'staff'] },
    { id: 'gm-availability', label: 'GM確認', icon: Clock, roles: ['admin', 'staff'] },
    { id: 'staff-profile', label: '担当作品', icon: UserCircle, roles: ['admin', 'staff'] },
    { id: 'private-booking-management', label: '貸切管理', icon: ClipboardCheck, roles: ['admin'] },
    { id: 'reservations', label: '予約管理', icon: Calendar, roles: ['admin'] },
    { id: 'customer-management', label: '顧客管理', icon: Users, roles: ['admin'] },
    { id: 'user-management', label: 'ユーザー', icon: UserCog, roles: ['admin'] },
    { id: 'sales', label: '売上', icon: TrendingUp, roles: ['admin'] },
    { id: 'organizations', label: '組織管理', icon: Building2, roles: ['admin'] },
    { id: 'license-management', label: 'ライセンス', icon: FileCheck, roles: ['admin', 'staff'] },
    { id: 'organization-settings', label: '組織設定', icon: Building2, roles: ['admin'] },
    { id: 'settings', label: '設定', icon: Settings, roles: ['admin'] },
    { id: 'manual', label: 'マニュアル', icon: HelpCircle, roles: ['admin', 'staff'] }
  ], [bookingSlug])
  
  // ユーザーのロールに応じてタブをフィルタリング
  const navigationTabs = useMemo(() => {
    // ユーザーがいない場合は何も表示しない
    if (!user || !user.role) {
      return []
    }
    // ユーザーのロールに基づいてフィルタリング
    return allTabs.filter(tab => tab.roles.includes(user.role))
  }, [allTabs, user])

  // 最適化: タブクリックハンドラをメモ化
  const handleTabClick = useCallback((tabId: string, e: React.MouseEvent<HTMLAnchorElement>) => {
    // 中クリック、Cmd+クリック、Ctrl+クリックの場合は通常のリンク動作
    if (e.button === 1 || e.metaKey || e.ctrlKey) {
      return
    }
    
    if (onPageChange) {
      e.preventDefault()
      onPageChange(tabId)
    }
  }, [onPageChange])

  return (
    <nav className="border-b border-border bg-muted/30">
      <div className="mx-auto px-0 sm:px-2 md:px-4 md:px-8 py-1.5 sm:py-2 md:py-3 max-w-full overflow-x-auto overflow-y-hidden">
        <div className="flex items-center justify-start gap-0 sm:gap-0.5 md:gap-1 min-w-max">
          {navigationTabs.map((tab) => {
            const Icon = tab.icon
            // 予約サイト（booking/xxx）は特別処理：currentPage が booking で始まるかどうかで判定
            const isActive = tab.id.startsWith('booking/') 
              ? (currentPage?.startsWith('booking') || currentPage === 'customer-booking')
              : currentPage === tab.id
            const href = tab.id === 'dashboard' ? '#' : `#${tab.id}`
            const badgeCount = tab.id === 'private-booking-management' ? storeConfirmationPendingCount : 0
            return (
              <a
                key={tab.id}
                href={href}
                onClick={(e) => handleTabClick(tab.id, e)}
                className={`relative inline-flex flex-col items-center justify-center gap-0.5 sm:flex-row sm:gap-1 md:gap-2 px-2 sm:px-2.5 md:px-3 py-1.5 sm:py-2 md:py-2.5 text-xs sm:text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground rounded-none min-w-[48px] sm:min-w-[56px] md:min-w-auto touch-manipulation ${
                  isActive 
                    ? 'text-foreground border-b-[2px] sm:border-b-[3px] border-primary bg-accent/50' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title={tab.label}
              >
                <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 flex-shrink-0" />
                <span className="hidden md:inline whitespace-nowrap">{tab.label}</span>
                <span className="md:hidden text-xs sm:text-xs leading-tight text-center">{tab.label.length > 3 ? tab.label.slice(0, 3) : tab.label}</span>
                {badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 sm:top-0 sm:right-0 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </a>
            )
          })}
        </div>
      </div>
    </nav>
  )
})
