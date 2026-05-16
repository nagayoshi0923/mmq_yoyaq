/**
 * 管理画面用左サイドバーナビゲーション
 * - カテゴリごとに折り畳み可能
 * - スケジュールはデフォルト展開
 * - モバイルはハンバーガー → ドロワー
 * - ロールベースでメニューをフィルタリング
 */
import { useState, useMemo, useCallback, useEffect, memo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization, checkIsLicenseAdmin } from '@/hooks/useOrganization'
import { useStoreConfirmationPendingCount } from '@/hooks/useStoreConfirmationPendingCount'
import {
  CalendarDays, Users, BookOpen, TrendingUp, CalendarClock, Settings,
  ClipboardCheck, UserCog, Store, HelpCircle, Globe, LayoutDashboard,
  UserCircle, UserCheck, Ticket, FileCheck, Shield, Gift, FileText,
  Mail, Building2, ChevronDown, ChevronRight, Menu, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type NavItem = {
  id: string
  label: string
  icon: React.ElementType
  path: string
  roles: string[]
  badge?: number
}

type NavGroup = {
  id: string
  label: string | null
  icon?: React.ElementType
  items: NavItem[]
  defaultOpen?: boolean
}

// 管理サイトのパス判定用
const ADMIN_PATH_SEGMENTS = [
  'dashboard', 'stores', 'staff', 'scenarios', 'schedule',
  'shift-submission', 'gm-availability', 'private-booking-management',
  'reservations', 'accounts', 'sales', 'settings', 'manual',
  'staff-profile', 'license-management', 'coupons', 'blog',
  'organizations', 'external-reports', 'scenario-masters',
  'license-reports', 'customer-management', 'user-management',
]

export const AdminSidebar = memo(function AdminSidebar() {
  const { user } = useAuth()
  const location = useLocation()
  const { organization, organizationId } = useOrganization()
  const { count: pendingCount } = useStoreConfirmationPendingCount()
  const isLicAdmin = checkIsLicenseAdmin(user?.role, organizationId)

  const slug = organization?.slug || 'queens-waltz'

  const [mobileOpen, setMobileOpen] = useState(false)
  // 展開状態: localStorage に永続化
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('admin-sidebar-open-groups')
      return stored ? JSON.parse(stored) : { schedule: true }
    } catch {
      return { schedule: true }
    }
  })

  const persistOpenGroups = useCallback((next: Record<string, boolean>) => {
    setOpenGroups(next)
    localStorage.setItem('admin-sidebar-open-groups', JSON.stringify(next))
  }, [])

  const toggleGroup = useCallback((groupId: string) => {
    persistOpenGroups({ ...openGroups, [groupId]: !openGroups[groupId] })
  }, [openGroups, persistOpenGroups])

  // パス変更でモバイルドロワーを閉じる
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const NAV_GROUPS: NavGroup[] = useMemo(() => [
    {
      id: 'top',
      label: null,
      items: [
        { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard, path: `/${slug}/dashboard`, roles: ['admin', 'staff', 'license_admin'] },
        { id: 'booking', label: '予約サイト', icon: Globe, path: `/${slug}`, roles: ['admin', 'staff', 'license_admin'] },
      ],
    },
    {
      id: 'schedule',
      label: 'スケジュール',
      icon: CalendarDays,
      defaultOpen: true,
      items: [
        { id: 'schedule', label: 'スケジュール', icon: CalendarDays, path: `/${slug}/schedule`, roles: ['admin', 'staff', 'license_admin'] },
        { id: 'shift-submission', label: 'シフト提出', icon: CalendarClock, path: `/${slug}/shift-submission`, roles: ['admin', 'staff', 'license_admin'] },
        { id: 'gm-availability', label: 'GM確認', icon: UserCheck, path: `/${slug}/gm-availability`, roles: ['admin', 'staff', 'license_admin'] },
        { id: 'staff-profile', label: '担当作品', icon: UserCircle, path: `/${slug}/staff-profile`, roles: ['admin', 'staff', 'license_admin'] },
      ],
    },
    {
      id: 'reservations',
      label: '予約・顧客',
      icon: Ticket,
      items: [
        { id: 'reservations', label: '予約管理', icon: Ticket, path: `/${slug}/reservations`, roles: ['admin', 'license_admin'], badge: pendingCount },
        { id: 'private-booking-management', label: '貸切管理', icon: ClipboardCheck, path: `/${slug}/private-booking-management`, roles: ['admin', 'license_admin'] },
        { id: 'accounts', label: 'アカウント', icon: UserCog, path: `/${slug}/accounts`, roles: ['admin', 'license_admin'] },
        { id: 'coupons', label: 'クーポン', icon: Gift, path: `/${slug}/coupons`, roles: ['admin', 'license_admin'] },
      ],
    },
    {
      id: 'content',
      label: 'コンテンツ',
      icon: BookOpen,
      items: [
        { id: 'scenarios', label: 'シナリオ', icon: BookOpen, path: `/${slug}/scenarios`, roles: ['admin', 'staff', 'license_admin'] },
        { id: 'blog', label: 'ブログ', icon: FileText, path: `/${slug}/blog`, roles: ['admin', 'license_admin'] },
        { id: 'manual', label: 'マニュアル', icon: HelpCircle, path: `/${slug}/manual`, roles: ['admin', 'staff', 'license_admin'] },
      ],
    },
    {
      id: 'sales',
      label: '売上・管理',
      icon: TrendingUp,
      items: [
        { id: 'sales', label: '売上', icon: TrendingUp, path: `/${slug}/sales`, roles: ['admin', 'license_admin'] },
        { id: 'license-management', label: '公演報告', icon: FileCheck, path: `/${slug}/license-management`, roles: ['admin', 'staff', 'license_admin'] },
        { id: 'email-history', label: 'メール配信履歴', icon: Mail, path: `/${slug}/settings?tab=email-history`, roles: ['admin', 'license_admin'] },
      ],
    },
    {
      id: 'settings',
      label: '設定',
      icon: Settings,
      items: [
        { id: 'stores', label: '店舗', icon: Store, path: `/${slug}/stores`, roles: ['admin', 'license_admin'] },
        { id: 'staff', label: 'スタッフ', icon: Users, path: `/${slug}/staff`, roles: ['admin', 'license_admin'] },
        { id: 'settings', label: '設定', icon: Settings, path: `/${slug}/settings`, roles: ['admin', 'license_admin'] },
      ],
    },
    {
      id: 'mmq',
      label: 'MMQ運営',
      icon: Shield,
      items: [
        { id: 'organizations', label: 'テナント管理', icon: Building2, path: `/${slug}/organizations`, roles: ['license_admin'] },
        { id: 'scenario-masters', label: 'マスタ管理', icon: Shield, path: '/admin/scenario-masters', roles: ['license_admin'] },
        { id: 'external-reports', label: '外部レポート', icon: FileCheck, path: `/${slug}/external-reports`, roles: ['license_admin'] },
      ],
    },
  ], [slug, pendingCount])

  // ロールフィルター
  const visibleGroups = useMemo(() => {
    if (!user?.role) return []
    return NAV_GROUPS.map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (item.roles.includes(user.role)) return true
        if (isLicAdmin && item.roles.includes('license_admin')) return true
        return false
      }),
    })).filter(group => group.items.length > 0)
  }, [NAV_GROUPS, user, isLicAdmin])

  // アクティブ判定
  const isActive = useCallback((item: NavItem) => {
    const { pathname, search } = location
    if (item.id === 'booking') {
      return pathname === `/${slug}` || (
        pathname.startsWith(`/${slug}/`) &&
        !ADMIN_PATH_SEGMENTS.some(seg => pathname.includes(`/${seg}`))
      )
    }
    if (item.id === 'email-history') {
      return pathname.includes('/settings') && new URLSearchParams(search).get('tab') === 'email-history'
    }
    if (item.id === 'settings') {
      return pathname.includes('/settings') && new URLSearchParams(search).get('tab') !== 'email-history'
    }
    return pathname.includes(`/${item.id}`) || pathname.startsWith(item.path)
  }, [location, slug])

  // 管理ページかどうか
  const isAdminPage = ADMIN_PATH_SEGMENTS.some(seg => location.pathname.includes(`/${seg}`))

  if (!user || user.role === 'customer' || !isAdminPage) return null

  const SidebarContent = () => (
    <div className="flex flex-col h-full py-3">
      {visibleGroups.map((group, gi) => (
        <div key={group.id}>
          {/* グループセパレーター */}
          {gi > 0 && group.label && (
            <div className="mx-3 my-1 border-t border-border/50" />
          )}

          {/* グループヘッダー（折り畳みボタン） */}
          {group.label && (
            <button
              onClick={() => toggleGroup(group.id)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="flex items-center gap-1.5">
                {group.icon && <group.icon className="w-3.5 h-3.5" />}
                {group.label}
              </div>
              {openGroups[group.id]
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />
              }
            </button>
          )}

          {/* グループアイテム */}
          {(group.label === null || openGroups[group.id]) && (
            <div className="space-y-0.5 px-2">
              {group.items.map(item => {
                const active = isActive(item)
                const Icon = item.icon
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`relative flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.badge != null && item.badge > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <>
      {/* デスクトップサイドバー */}
      <aside className="hidden md:flex flex-col w-48 shrink-0 border-r border-border bg-background h-full overflow-y-auto">
        <SidebarContent />
      </aside>

      {/* モバイル: ハンバーガーボタン */}
      <div className="md:hidden fixed bottom-4 left-4 z-50">
        <Button
          size="icon"
          variant="default"
          className="rounded-full shadow-lg h-12 w-12"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* モバイル: ドロワー */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-56 bg-background border-r border-border z-50 overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-bold text-sm">メニュー</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMobileOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  )
})
