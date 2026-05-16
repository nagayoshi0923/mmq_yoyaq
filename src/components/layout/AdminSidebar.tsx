/**
 * 管理画面用左サイドバーナビゲーション
 * - カテゴリごとに折り畳み可能
 * - スケジュールはデフォルト展開
 * - モバイルはハンバーガー → ドロワー
 * - ロールベースでメニューをフィルタリング
 */
import { useState, useMemo, useCallback, useEffect, memo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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

type SubItem = {
  id: string
  label: string
  path: string           // ?tab=xxx 付きURL
  roles?: string[]
  sectionLabel?: string  // 直前にセクション区切りを入れる場合のラベル
}

type NavItem = {
  id: string
  label: string
  icon: React.ElementType
  path: string
  roles: string[]
  badge?: number
  subItems?: SubItem[]   // そのページにいる時だけ展開表示
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
  const navigate = useNavigate()

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
        { id: 'schedule', label: 'スケジュール', icon: CalendarDays, path: `/${slug}/schedule`, roles: ['admin', 'staff', 'license_admin'] },
      ],
    },
    {
      id: 'schedule-sub',
      label: 'シフト・GM',
      icon: CalendarClock,
      items: [
        { id: 'shift-submission', label: 'シフト提出', icon: CalendarClock, path: `/${slug}/shift-submission`, roles: ['admin', 'staff', 'license_admin'] },
        {
          id: 'gm-availability', label: 'GM確認', icon: UserCheck,
          path: `/${slug}/gm-availability`, roles: ['admin', 'staff', 'license_admin'],
          subItems: [
            { id: 'gm-list', label: 'GM確認一覧', path: `/${slug}/gm-availability?tab=gm-list` },
            { id: 'pending', label: '承認待ち',    path: `/${slug}/gm-availability?tab=pending` },
            { id: 'schedule', label: 'スケジュール', path: `/${slug}/gm-availability?tab=schedule` },
          ],
        },
        { id: 'staff-profile', label: '担当作品', icon: UserCircle, path: `/${slug}/staff-profile`, roles: ['admin', 'staff', 'license_admin'] },
      ],
    },
    {
      id: 'reservations',
      label: '予約・顧客',
      icon: Ticket,
      items: [
        {
          id: 'reservations', label: '予約管理', icon: Ticket,
          path: `/${slug}/reservations`, roles: ['admin', 'license_admin'], badge: pendingCount,
          subItems: [
            { id: 'booking-list', label: '予約一覧',       path: `/${slug}/reservations?tab=booking-list` },
            { id: 'pending',      label: '承認待ち',       path: `/${slug}/reservations?tab=pending` },
          ],
        },
        {
          id: 'private-booking-management', label: '貸切管理', icon: ClipboardCheck,
          path: `/${slug}/private-booking-management`, roles: ['admin', 'license_admin'],
          subItems: [
            { id: 'booking-list', label: '貸切一覧',   path: `/${slug}/private-booking-management?tab=booking-list` },
            { id: 'groups',       label: 'グループ',   path: `/${slug}/private-booking-management?tab=groups` },
            { id: 'pending',      label: '承認待ち',   path: `/${slug}/private-booking-management?tab=pending` },
            { id: 'approved',     label: '承認済み',   path: `/${slug}/private-booking-management?tab=approved` },
            { id: 'settings',     label: '設定',       path: `/${slug}/private-booking-management?tab=settings` },
          ],
        },
        {
          id: 'accounts', label: 'アカウント', icon: UserCog,
          path: `/${slug}/accounts`, roles: ['admin', 'license_admin'],
          subItems: [
            { id: 'users',     label: 'ユーザー', path: `/${slug}/accounts?tab=users` },
            { id: 'customers', label: '顧客',     path: `/${slug}/accounts?tab=customers` },
          ],
        },
        { id: 'coupons', label: 'クーポン', icon: Gift, path: `/${slug}/coupons`, roles: ['admin', 'license_admin'] },
      ],
    },
    {
      id: 'content',
      label: 'コンテンツ',
      icon: BookOpen,
      items: [
        { id: 'scenarios', label: 'シナリオ', icon: BookOpen, path: `/${slug}/scenarios`, roles: ['admin', 'staff', 'license_admin'] },
        { id: 'blog',      label: 'ブログ',   icon: FileText, path: `/${slug}/blog`,      roles: ['admin', 'license_admin'] },
        { id: 'manual',    label: 'マニュアル', icon: HelpCircle, path: `/${slug}/manual`, roles: ['admin', 'staff', 'license_admin'] },
      ],
    },
    {
      id: 'sales',
      label: '売上・管理',
      icon: TrendingUp,
      items: [
        {
          id: 'sales', label: '売上', icon: TrendingUp,
          path: `/${slug}/sales`, roles: ['admin', 'license_admin'],
          subItems: [
            { id: 'overview',             label: '売上概要',       path: `/${slug}/sales?tab=overview` },
            { id: 'annual-analysis',      label: '年間分析',       path: `/${slug}/sales?tab=annual-analysis` },
            { id: 'scenario-performance', label: 'シナリオ別',     path: `/${slug}/sales?tab=scenario-performance` },
            { id: 'open-event-analysis',  label: '公演分析',       path: `/${slug}/sales?tab=open-event-analysis` },
            { id: 'external-sales',       label: '外部売上',       path: `/${slug}/sales?tab=external-sales` },
            { id: 'misc-transactions',    label: '雑収支管理',     path: `/${slug}/sales?tab=misc-transactions` },
            { id: 'franchise-sales',      label: 'フランチャイズ', path: `/${slug}/sales?tab=franchise-sales` },
            { id: 'staff-salary-report',  label: 'スタッフ報酬',   path: `/${slug}/sales?tab=staff-salary-report` },
            { id: 'salary-calculation',   label: '給与計算',       path: `/${slug}/sales?tab=salary-calculation` },
          ],
        },
        {
          id: 'license-management', label: '公演報告', icon: FileCheck,
          path: `/${slug}/license-management`, roles: ['admin', 'staff', 'license_admin'],
          subItems: [
            { id: 'send',     label: '公演報告', path: `/${slug}/license-management?tab=send` },
            { id: 'received', label: '受信',     path: `/${slug}/license-management?tab=received`, roles: ['license_admin'] },
            { id: 'summary',  label: '集計',     path: `/${slug}/license-management?tab=summary`,  roles: ['license_admin'] },
          ],
        },
      ],
    },
    {
      id: 'settings',
      label: '設定',
      icon: Settings,
      items: [
        { id: 'stores', label: '店舗',   icon: Store, path: `/${slug}/stores`, roles: ['admin', 'license_admin'] },
        { id: 'staff',  label: 'スタッフ', icon: Users, path: `/${slug}/staff`,  roles: ['admin', 'license_admin'] },
        {
          id: 'settings', label: '設定', icon: Settings,
          path: `/${slug}/settings`, roles: ['admin', 'license_admin'],
          subItems: [
            // 組織設定
            { id: 'organization-info',    label: '組織情報',       path: `/${slug}/settings?tab=organization-info` },
            { id: 'organization-design',  label: '組織デザイン',   path: `/${slug}/settings?tab=organization-design` },
            { id: 'faq',                  label: 'FAQ設定',        path: `/${slug}/settings?tab=faq` },
            { id: 'blog',                 label: 'ブログ・お知らせ', path: `/${slug}/settings?tab=blog` },
            { id: 'general',              label: '全体設定',       path: `/${slug}/settings?tab=general` },
            // 店舗別設定
            { id: 'store-basic',          label: '店舗基本設定',   path: `/${slug}/settings?tab=store-basic`,          sectionLabel: '店舗別設定' },
            { id: 'business-hours',       label: '営業時間',       path: `/${slug}/settings?tab=business-hours` },
            { id: 'performance-schedule', label: '公演スケジュール', path: `/${slug}/settings?tab=performance-schedule` },
            { id: 'reservation',          label: '予約設定',       path: `/${slug}/settings?tab=reservation` },
            { id: 'cancellation',         label: 'キャンセル設定', path: `/${slug}/settings?tab=cancellation` },
            { id: 'pricing',              label: '料金設定',       path: `/${slug}/settings?tab=pricing` },
            { id: 'salary',               label: '報酬',           path: `/${slug}/settings?tab=salary` },
            { id: 'staff-setting',        label: 'スタッフ設定',   path: `/${slug}/settings?tab=staff` },
            { id: 'email',                label: 'メール設定',     path: `/${slug}/settings?tab=email` },
            { id: 'notifications',        label: '通知設定',       path: `/${slug}/settings?tab=notifications` },
            { id: 'booking-notice',       label: '注意事項設定',   path: `/${slug}/settings?tab=booking-notice` },
            { id: 'categories',           label: 'カテゴリ・作者', path: `/${slug}/settings?tab=categories` },
            { id: 'system',               label: 'システム設定',   path: `/${slug}/settings?tab=system` },
            { id: 'data',                 label: 'データ管理',     path: `/${slug}/settings?tab=data` },
          ],
        },
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

  // アクティブ判定（ページレベル）
  const isActive = useCallback((item: NavItem) => {
    const { pathname } = location
    if (item.id === 'booking') {
      return pathname === `/${slug}` || (
        pathname.startsWith(`/${slug}/`) &&
        !ADMIN_PATH_SEGMENTS.some(seg => pathname.includes(`/${seg}`))
      )
    }
    const basePath = item.path.split('?')[0]
    return pathname === basePath || pathname.startsWith(basePath + '/')
  }, [location, slug])

  // サブアイテムのアクティブ判定
  const isSubActive = useCallback((sub: SubItem) => {
    const { pathname, search } = location
    const [basePath, query] = sub.path.split('?')
    if (!query) return pathname === basePath
    const tabParam = new URLSearchParams(query).get('tab')
    const currentTab = new URLSearchParams(search).get('tab')
    return pathname === basePath && currentTab === tabParam
  }, [location])

  // 管理ページかどうか
  const isAdminPage = ADMIN_PATH_SEGMENTS.some(seg => location.pathname.includes(`/${seg}`))

  if (!user || user.role === 'customer' || !isAdminPage) return null

  // カテゴリが開いているか（アクティブページが含まれる時のみ）
  const isGroupOpen = useCallback((group: typeof visibleGroups[0]) => {
    if (!group.label) return true  // ラベルなし（トップ）は常に表示
    return group.items.some(item => isActive(item))
  }, [isActive])

  // カテゴリヘッダーをクリック → そのカテゴリの最初のアイテムに遷移
  const handleGroupClick = useCallback((group: typeof visibleGroups[0]) => {
    const firstItem = group.items[0]
    if (firstItem) navigate(firstItem.path)
  }, [navigate])

  const bookingActive = isActive({ id: 'booking', label: '予約サイト', icon: Globe, path: `/${slug}`, roles: [] })

  const SidebarContent = () => (
    <div className="flex flex-col h-full py-2">
      {/* 予約サイト（最上部・専用スタイル） */}
      <div className="px-2 pb-2 mb-1">
        <Link
          to={`/${slug}`}
          className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-md border transition-all duration-150 ${
            bookingActive
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          <Globe className="w-4 h-4 flex-shrink-0" />
          <span>予約サイト</span>
        </Link>
      </div>

      <div className="mx-3 border-t border-border/40 mb-1" />

      {visibleGroups.map((group, gi) => (
        <div key={group.id}>
          {/* グループセパレーター */}
          {gi > 0 && group.label && (
            <div className="mx-3 my-1 border-t border-border/40" />
          )}

          {/* カテゴリ見出し（クリックで最初のアイテムへ遷移） */}
          {group.label && (
            <button
              onClick={() => handleGroupClick(group)}
              className="w-full flex items-center justify-between px-3 pt-2 pb-1 transition-colors duration-150 group"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-colors duration-150 group-hover:text-slate-600">
                {group.label}
              </span>
              <ChevronRight className={`w-3 h-3 text-slate-300 transition-all duration-200 group-hover:text-slate-500 ${
                isGroupOpen(group) ? 'rotate-90' : 'rotate-0'
              }`} />
            </button>
          )}

          {/* グループアイテム — grid-rows で height:auto アニメーション */}
          <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
            isGroupOpen(group) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}>
            <div className="overflow-hidden">
            <div className={`space-y-0.5 px-2 pb-1 transition-transform duration-300 ease-out ${
              isGroupOpen(group) ? 'translate-y-0' : '-translate-y-2'
            }`}>
              {group.items.map(item => {
                const active = isActive(item)
                const showSubs = active && item.subItems && item.subItems.length > 0
                // サブアイテムのロールフィルタリング
                const visibleSubs = showSubs
                  ? item.subItems!.filter(s =>
                      !s.roles || s.roles.includes(user!.role) || (isLicAdmin && s.roles.includes('license_admin'))
                    )
                  : []
                return (
                  <div key={item.id}>
                    <Link
                      to={item.path}
                      className={`relative flex items-center px-3 py-2 text-sm transition-all duration-150 ${
                        active
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:translate-x-0.5'
                      }`}
                    >
                      <span className="truncate">{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </Link>
                    {/* サブアイテム（そのページにいる時だけ展開） */}
                    {showSubs && visibleSubs.length > 0 && (
                      <div className="ml-3 pl-2 border-l border-border/60 space-y-0.5 mt-0.5 mb-1">
                        {visibleSubs.map(sub => {
                          const subActive = isSubActive(sub)
                          return (
                            <div key={sub.id}>
                              {sub.sectionLabel && (
                                <p className="text-[10px] font-semibold text-muted-foreground/60 px-2 pt-2 pb-0.5 uppercase tracking-wide">
                                  {sub.sectionLabel}
                                </p>
                              )}
                              <Link
                                to={sub.path}
                                className={`flex items-center px-2 py-1.5 text-xs transition-colors ${
                                  subActive
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                }`}
                              >
                                <span className="truncate">{sub.label}</span>
                              </Link>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            </div>
          </div>
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
