/**
 * 管理画面用左サイドバーナビゲーション
 * - カテゴリごとに折り畳み可能
 * - スケジュールはデフォルト展開
 * - モバイルはハンバーガー → ドロワー
 * - ロールベースでメニューをフィルタリング
 */
import { useState, useLayoutEffect, useRef, useMemo, useCallback, useEffect, memo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization, checkIsLicenseAdmin } from '@/hooks/useOrganization'
import { useStoreConfirmationPendingCount } from '@/hooks/useStoreConfirmationPendingCount'
import {
  CalendarDays, Users, BookOpen, TrendingUp, CalendarClock, Settings,
  ClipboardCheck, UserCog, Store, HelpCircle, Globe, LayoutDashboard,
  UserCircle, UserCheck, Ticket, FileCheck, Shield, Gift, FileText,
  Mail, Building2, ChevronDown, ChevronRight, Menu, X, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type SubSubItem = {
  id: string
  label: string
  path: string
  roles?: string[]
}

type SubItem = {
  id: string
  label: string
  path?: string          // ?tab=xxx 付きURL（カテゴリヘッダーは省略）
  roles?: string[]
  sectionLabel?: string  // 直前にセクション区切りを入れる場合のラベル
  subItems?: SubSubItem[] // 設定サブカテゴリ用
}

type NavItem = {
  id: string
  label: string
  icon: React.ElementType
  path: string
  roles: string[]
  badge?: number
  subItems?: SubItem[]
  sectionLabel?: string  // グループ内でこのアイテムの直前にセクションヘッダーを表示
  isGroupHeader?: boolean // リンクではなく折り畳みセクションとして描画
}

type SidebarContentProps = {
  slug: string
  bookingActive: boolean
  visibleGroups: NavGroup[]
  isGroupOpen: (group: NavGroup) => boolean
  isActive: (item: NavItem) => boolean
  isSubActive: (sub: SubItem) => boolean
  userRole: string
  isLicAdmin: boolean
  handleGroupClick: (group: NavGroup) => void
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
  'shift-submission', 'gm-availability', 'private-booking-management', 'private-booking-groups',
  'reservations', 'accounts', 'sales', 'settings', 'manual',
  'staff-profile', 'license-management', 'coupons', 'blog',
  'organizations', 'external-reports', 'scenario-masters',
  'license-reports', 'customer-management', 'user-management', 'scenario-matcher',
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
        { id: 'stores',    label: '店舗',     icon: Store,    path: `/${slug}/stores`,    roles: ['admin', 'license_admin'] },
        { id: 'staff',     label: 'スタッフ', icon: Users,    path: `/${slug}/staff`,     roles: ['admin', 'license_admin'] },
        { id: 'scenarios', label: 'シナリオ', icon: BookOpen, path: `/${slug}/scenarios`, roles: ['admin', 'staff', 'license_admin'] },
      ],
    },
    {
      id: 'schedule-sub',
      label: 'シフト・GM',
      icon: CalendarClock,
      items: [
        { id: 'shift-submission', label: 'シフト提出', icon: CalendarClock, path: `/${slug}/shift-submission`, roles: ['admin', 'staff', 'license_admin'] },
        { id: 'gm-availability', label: 'GM確認', icon: UserCheck, path: `/${slug}/gm-availability`, roles: ['admin', 'staff', 'license_admin'] },
        { id: 'staff-profile', label: '担当作品', icon: UserCircle, path: `/${slug}/staff-profile`, roles: ['admin', 'staff', 'license_admin'] },
      ],
    },
    {
      id: 'reservations',
      label: '貸切・予約',
      icon: ClipboardCheck,
      items: [
        {
          id: 'private-booking-management', label: '貸切管理', icon: ClipboardCheck,
          path: `/${slug}/private-booking-management`, roles: ['admin', 'license_admin'], badge: pendingCount,
        },
        { id: 'private-booking-groups', label: 'グループ一覧', icon: Users, path: `/${slug}/private-booking-groups`, roles: ['admin', 'license_admin'] },
        {
          id: 'reservations', label: '予約管理', icon: Ticket,
          path: `/${slug}/reservations`, roles: ['admin', 'license_admin'],
        },
      ],
    },
    {
      id: 'customers',
      label: 'アカウント・顧客',
      icon: UserCog,
      items: [
        { id: 'customers', label: '顧客', icon: UserCog, path: `/${slug}/accounts?tab=customers`, roles: ['admin', 'license_admin'] },
        { id: 'coupons',   label: 'クーポン', icon: Gift, path: `/${slug}/coupons`, roles: ['admin', 'license_admin'] },
      ],
    },
    {
      id: 'email-category',
      label: 'メール',
      icon: Mail,
      items: [
        { id: 'email-history', label: 'メール配信履歴', icon: Mail, path: `/${slug}/settings?tab=email-history`, roles: ['admin', 'license_admin'] },
        { id: 'email-logs',    label: 'メール送信ログ', icon: Mail, path: `/${slug}/settings?tab=email-logs`,    roles: ['admin', 'license_admin'] },
      ],
    },
    {
      id: 'content',
      label: 'コンテンツ',
      icon: BookOpen,
      items: [
        { id: 'blog', label: 'ブログ', icon: FileText, path: `/${slug}/blog`, roles: ['admin', 'license_admin'] },
      ],
    },
    {
      id: 'manual-category',
      label: 'マニュアル',
      icon: HelpCircle,
      items: [
        {
          id: 'manual-common', label: '共通マニュアル', icon: HelpCircle,
          path: `/${slug}/manual?tab=checkin`, roles: ['admin', 'staff', 'license_admin'],
          subItems: [
            { id: 'manual-checkin',            label: '受付・チェックイン',    path: `/${slug}/manual?tab=checkin` },
            { id: 'manual-pre-reading-survey', label: '事前アンケート・配役',  path: `/${slug}/manual?tab=pre-reading-survey` },
            { id: 'manual-coupon-reception',   label: 'クーポン受付対応',      path: `/${slug}/manual?tab=coupon-reception` },
            { id: 'manual-coupon-types',       label: 'クーポン・チケット種類', path: `/${slug}/manual?tab=coupon-types` },
          ],
        },
        {
          id: 'manual-admin', label: '運営', icon: HelpCircle,
          path: `/${slug}/manual?tab=reservation`, roles: ['admin', 'license_admin'],
          subItems: [
            { id: 'manual-reservation', label: '予約管理',             path: `/${slug}/manual?tab=reservation` },
            { id: 'manual-staff-item',  label: 'スタッフ管理',         path: `/${slug}/manual?tab=staff` },
            { id: 'manual-schedule',    label: 'シフト・スケジュール', path: `/${slug}/manual?tab=schedule` },
            { id: 'manual-coupon',      label: 'クーポン管理',         path: `/${slug}/manual?tab=coupon` },
          ],
        },
        { id: 'manual-new', label: '新規作成', icon: Plus, path: `/${slug}/manual?action=new`, roles: ['admin'] },
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
        {
          id: 'cat-org', label: '組織', icon: Building2,
          path: `/${slug}/settings?tab=organization-info`,
          roles: ['admin', 'license_admin'], isGroupHeader: true,
          subItems: [
            { id: 'organization-info',   label: '組織情報',        path: `/${slug}/settings?tab=organization-info` },
            { id: 'organization-design', label: '組織デザイン',    path: `/${slug}/settings?tab=organization-design` },
            { id: 'faq',                 label: 'FAQ設定',         path: `/${slug}/settings?tab=faq` },
            { id: 'blog',                label: 'ブログ・お知らせ', path: `/${slug}/settings?tab=blog` },
          ],
        },
        {
          id: 'cat-store', label: '店舗・予約', icon: Store,
          path: `/${slug}/settings?tab=store-basic`,
          roles: ['admin', 'license_admin'], isGroupHeader: true,
          subItems: [
            { id: 'business-hours',       label: '営業時間',        path: `/${slug}/settings?tab=business-hours` },
            { id: 'performance-schedule', label: '公演スケジュール', path: `/${slug}/settings?tab=performance-schedule` },
            { id: 'reservation',          label: '予約設定',        path: `/${slug}/settings?tab=reservation` },
            { id: 'cancellation',         label: 'キャンセル設定',  path: `/${slug}/settings?tab=cancellation` },
            { id: 'booking-notice',       label: '注意事項設定',    path: `/${slug}/settings?tab=booking-notice` },
            { id: 'categories',           label: 'カテゴリ・作者',  path: `/${slug}/settings?tab=categories` },
          ],
        },
        {
          id: 'cat-staff', label: 'スタッフ', icon: UserCog,
          path: `/${slug}/settings?tab=shift`,
          roles: ['admin', 'license_admin'], isGroupHeader: true,
          subItems: [
            { id: 'shift',         label: 'シフト設定',   path: `/${slug}/settings?tab=shift` },
            { id: 'salary',        label: '報酬',         path: `/${slug}/settings?tab=salary` },
          ],
        },
        {
          id: 'cat-mail', label: 'メール・通知', icon: Mail,
          path: `/${slug}/settings?tab=email`,
          roles: ['admin', 'license_admin'], isGroupHeader: true,
          subItems: [
            { id: 'email',         label: 'メール設定',    path: `/${slug}/settings?tab=email` },
            { id: 'notifications', label: '通知設定',      path: `/${slug}/settings?tab=notifications` },
          ],
        },
        {
          id: 'cat-system', label: 'システム', icon: Shield,
          path: `/${slug}/settings?tab=system`,
          roles: ['admin', 'license_admin'], isGroupHeader: true,
          subItems: [
            { id: 'system', label: 'システム設定', path: `/${slug}/settings?tab=system` },
            { id: 'data',   label: 'データ管理',  path: `/${slug}/settings?tab=data` },
          ],
        },
      ],
    },
    {
      id: 'mmq',
      label: 'MMQ運営',
      icon: Shield,
      items: [
        { id: 'accounts', label: 'ユーザー管理', icon: UserCog, path: `/${slug}/accounts?tab=users`, roles: ['license_admin'] },
        { id: 'organizations',     label: 'テナント管理',       icon: Building2, path: `/${slug}/organizations`,     roles: ['license_admin'] },
        { id: 'scenario-masters',  label: 'マスタ管理',         icon: Shield,    path: '/admin/scenario-masters',     roles: ['license_admin'] },
        { id: 'external-reports',  label: '外部公演報告',       icon: FileCheck, path: `/${slug}/external-reports`,  roles: ['license_admin'] },
        { id: 'license-reports',   label: 'ライセンス報告管理', icon: FileCheck, path: `/${slug}/license-reports`,   roles: ['license_admin'] },
        { id: 'scenario-matcher',  label: 'シナリオマッチャー', icon: Shield,    path: `/${slug}/scenario-matcher`,   roles: ['license_admin'] },
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
    const { pathname, search } = location
    if (item.id === 'booking') {
      return pathname === `/${slug}` || (
        pathname.startsWith(`/${slug}/`) &&
        !ADMIN_PATH_SEGMENTS.some(seg => pathname.includes(`/${seg}`))
      )
    }
    const [basePath, query] = item.path.split('?')
    const currentTab = new URLSearchParams(search).get('tab')
    // subItems のいずれかのタブがアクティブなら親も active とみなす
    if (item.subItems && pathname === basePath) {
      if (item.subItems.some(sub => {
        if (sub.path) {
          const [, subQuery] = sub.path.split('?')
          if (subQuery && new URLSearchParams(subQuery).get('tab') === currentTab) return true
        }
        // カテゴリ（path なし）の場合は sub.subItems を確認
        return sub.subItems?.some(ssub => {
          const [, ssQuery] = ssub.path.split('?')
          return ssQuery && new URLSearchParams(ssQuery).get('tab') === currentTab
        }) ?? false
      })) return true
    }
    if (query) {
      const tabParam = new URLSearchParams(query).get('tab')
      return pathname === basePath && currentTab === tabParam
    }
    return pathname === basePath || pathname.startsWith(basePath + '/')
  }, [location, slug])

  // サブアイテムのアクティブ判定（path がある場合のみ）
  const isSubActive = useCallback((sub: SubItem) => {
    if (!sub.path) return false
    const { pathname, search } = location
    const [basePath, query] = sub.path.split('?')
    if (!query) return pathname === basePath
    const tabParam = new URLSearchParams(query).get('tab')
    const currentTab = new URLSearchParams(search).get('tab')
    return pathname === basePath && currentTab === tabParam
  }, [location])

  // 管理ページかどうか
  const isAdminPage = ADMIN_PATH_SEGMENTS.some(seg => location.pathname.includes(`/${seg}`))

  // フックは早期 return の前に宣言する（Rules of Hooks）
  const isGroupOpen = useCallback((group: typeof visibleGroups[0]) => {
    if (!group.label) return true
    return group.items.some(item => isActive(item))
  }, [isActive])

  const handleGroupClick = useCallback((group: typeof visibleGroups[0]) => {
    const firstItem = group.items[0]
    if (firstItem) navigate(firstItem.path)
  }, [navigate])

  if (!user || user.role === 'customer' || !isAdminPage) return null

  const bookingActive = isActive({ id: 'booking', label: '予約サイト', icon: Globe, path: `/${slug}`, roles: [] })

  return (
    <>
      {/* デスクトップサイドバー */}
      <aside className="hidden md:flex flex-col w-48 shrink-0 border-r border-border bg-slate-50 h-full overflow-y-auto">
        <SidebarContent
          slug={slug}
          bookingActive={bookingActive}
          visibleGroups={visibleGroups}
          isGroupOpen={isGroupOpen}
          isActive={isActive}
          isSubActive={isSubActive}
          userRole={user!.role}
          isLicAdmin={isLicAdmin}
          handleGroupClick={handleGroupClick}
        />
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
            <SidebarContent
          slug={slug}
          bookingActive={bookingActive}
          visibleGroups={visibleGroups}
          isGroupOpen={isGroupOpen}
          isActive={isActive}
          isSubActive={isSubActive}
          userRole={user!.role}
          isLicAdmin={isLicAdmin}
          handleGroupClick={handleGroupClick}
        />
          </aside>
        </>
      )}
    </>
  )
})

// ページ遷移ごとに AdminSidebar が再マウントされるため、モジュールスコープで
// 直前のアクティブグループIDを保持する（再マウントを超えて永続）
const lastActiveGroupId = { current: '' }

function GroupPanel({
  group, isOpen, isActive, isSubActive, userRole, isLicAdmin,
}: {
  group: NavGroup & { items: NavItem[] }
  isOpen: boolean
  isActive: (item: NavItem) => boolean
  isSubActive: (sub: SubItem) => boolean
  userRole: string
  isLicAdmin: boolean
}) {
  // マウント時点でこのグループが既にアクティブだったか（同カテゴリ内ナビ）
  const alreadyActive = isOpen && !!group.label && lastActiveGroupId.current === group.id
  if (isOpen && group.label) lastActiveGroupId.current = group.id

  const location = useLocation()
  const navigate = useNavigate()
  // 手動で折り畳んだカテゴリID（アクティブでも折り畳める）
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  const handleCategoryClick = (id: string, firstPath: string, isActive: boolean) => {
    if (isActive) {
      // アクティブなカテゴリはトグルのみ（ページ遷移なし）
      setCollapsedCategories(prev => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      })
    } else {
      // 非アクティブなカテゴリは最初の項目に遷移（自動展開）
      navigate(firstPath)
      setCollapsedCategories(prev => {
        const next = new Set(prev)
        next.delete(id) // 展開状態にリセット
        return next
      })
    }
  }

  const isSubSubActive = (ssub: SubSubItem) => {
    const { pathname, search } = location
    const [basePath, query] = ssub.path.split('?')
    if (!query) return pathname === basePath
    const tabParam = new URLSearchParams(query).get('tab')
    return pathname === basePath && new URLSearchParams(search).get('tab') === tabParam
  }

  const divRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = divRef.current
    if (!el || !group.label) return
    // 常に CSS 自動アニメーションを止め、必要なときだけ手動リスタート
    el.style.animationName = 'none'
    if (!alreadyActive) {
      void el.getBoundingClientRect()
      el.style.animationName = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // マウント時のみ実行

  return (
    <div
      ref={divRef}
      className={group.label ? 'sidebar-items-enter' : ''}
      style={group.label ? { display: isOpen ? 'block' : 'none' } : undefined}
    >
      <div className="space-y-0.5 px-2 pb-1">
        {group.items.map(item => {
          const active = isActive(item)
          // isGroupHeader: リンクではなく折り畳みセクションとして描画
          if (item.isGroupHeader) {
            const visibleSubs = (item.subItems ?? []).filter(
              s => !s.roles || s.roles.includes(userRole) || (isLicAdmin && s.roles.includes('license_admin'))
            )
            const catOpen = active && !collapsedCategories.has(item.id)
            const firstPath = visibleSubs[0]?.path ?? item.path
            return (
              <div key={item.id}>
                <button
                  onClick={() => handleCategoryClick(item.id, firstPath, active)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active ? 'text-blue-700' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <span>{item.label}</span>
                  <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${catOpen ? '' : '-rotate-90'}`} />
                </button>
                {catOpen && (
                  <div className="ml-3 pl-2 border-l border-border/40 space-y-0.5 mb-1">
                    {visibleSubs.map(sub => {
                      const subActive = isSubActive(sub)
                      return sub.path ? (
                        <Link
                          key={sub.id}
                          to={sub.path}
                          className={`flex items-center px-2 py-1.5 text-xs transition-colors ${
                            subActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                          }`}
                        >
                          <span className="truncate">{sub.label}</span>
                        </Link>
                      ) : null
                    })}
                  </div>
                )}
              </div>
            )
          }

          const showSubs = active && item.subItems && item.subItems.length > 0
          const visibleSubs = showSubs
            ? item.subItems!.filter(s =>
                !s.roles || s.roles.includes(userRole) || (isLicAdmin && s.roles.includes('license_admin'))
              )
            : []
          return (
            <div key={item.id}>
              {item.sectionLabel && (
                <p className="text-[10px] font-semibold text-muted-foreground/60 px-3 pt-2 pb-0.5 uppercase tracking-wide">
                  {item.sectionLabel}
                </p>
              )}
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
              {showSubs && visibleSubs.length > 0 && (
                <div className="ml-3 pl-2 border-l border-border/60 space-y-0.5 mt-0.5 mb-1">
                  {visibleSubs.map(sub => {
                    // ── カテゴリ（sub.subItems あり）
                    if (sub.subItems && sub.subItems.length > 0) {
                      const visibleSubSubs = sub.subItems.filter(
                        s => !s.roles || s.roles.includes(userRole) || (isLicAdmin && s.roles.includes('license_admin'))
                      )
                      const categoryActive = visibleSubSubs.some(s => isSubSubActive(s))
                      const categoryOpen = categoryActive && !collapsedCategories.has(sub.id)
                      const firstPath = visibleSubSubs[0]?.path ?? ''
                      return (
                        <div key={sub.id}>
                          <button
                            onClick={() => handleCategoryClick(sub.id, firstPath, categoryActive)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                              categoryActive ? 'text-blue-700' : 'text-slate-400 hover:text-slate-600'
                            }`}
                          >
                            <span>{sub.label}</span>
                            <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${categoryOpen ? '' : '-rotate-90'}`} />
                          </button>
                          {categoryOpen && (
                            <div className="ml-2 pl-2 border-l border-border/40 space-y-0.5 mb-1">
                              {visibleSubSubs.map(ssub => {
                                const ssActive = isSubSubActive(ssub)
                                return (
                                  <Link
                                    key={ssub.id}
                                    to={ssub.path}
                                    className={`flex items-center px-2 py-1.5 text-xs transition-colors ${
                                      ssActive
                                        ? 'bg-blue-50 text-blue-700 font-medium'
                                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                    }`}
                                  >
                                    <span className="truncate">{ssub.label}</span>
                                  </Link>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    }
                    // ── 通常サブアイテム
                    const subActive = isSubActive(sub)
                    return (
                      <div key={sub.id}>
                        {sub.sectionLabel && (
                          <p className="text-[10px] font-semibold text-muted-foreground/60 px-2 pt-2 pb-0.5 uppercase tracking-wide">
                            {sub.sectionLabel}
                          </p>
                        )}
                        {sub.path && (
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
                        )}
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
  )
}

function SidebarContent({
  slug, bookingActive, visibleGroups,
  isGroupOpen, isActive, isSubActive,
  userRole, isLicAdmin, handleGroupClick,
}: SidebarContentProps) {
  return (
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
          {gi > 0 && group.label && (
            <div className="mx-3 my-1 border-t border-border/40" />
          )}

          {group.label && (
            <button
              onClick={() => handleGroupClick(group)}
              className="w-full flex items-center justify-between px-3 pt-2 pb-1 transition-colors duration-150 group"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 transition-colors duration-150 group-hover:text-slate-600">
                {group.label}
              </span>
              <ChevronRight className={`w-3 h-3 text-slate-300 transition-all duration-200 group-hover:text-slate-500 ${
                isGroupOpen(group) ? 'rotate-90' : 'rotate-0'
              }`} />
            </button>
          )}

          <GroupPanel
            group={group}
            isOpen={isGroupOpen(group)}
            isActive={isActive}
            isSubActive={isSubActive}
            userRole={userRole}
            isLicAdmin={isLicAdmin}
          />
        </div>
      ))}
      {/* 最下部の余白（最後のメニューが押しにくくなるのを防ぐ） */}
      <div className="h-48 flex-shrink-0" />
    </div>
  )
}
