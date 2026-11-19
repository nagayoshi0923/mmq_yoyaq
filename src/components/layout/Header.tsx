import { useCallback, memo, useEffect, useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization, checkIsLicenseAdmin } from '@/hooks/useOrganization'
import { useOrgThemePreset } from '@/hooks/useOrgThemePreset'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LogOut, User, Building2, ChevronRight, LayoutDashboard, Search } from 'lucide-react'
import { logger } from '@/utils/logger'
import { devDb } from '@/components/ui/DevField'
import { getOrganizationBySlug } from '@/lib/organization'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { NotificationDropdown } from './NotificationDropdown'
import type { Organization } from '@/types'
import { buildAuthUrl, currentPathWithSearch } from '@/lib/authReturn'

// 訪問組織のlocalStorageキー
const VISITED_ORG_KEY = 'mmq_visited_organization'

// 組織の公開ページではない先頭セグメント（管理ページ・共通ページ）
const NON_ORG_SEGMENTS = ['dashboard', 'store-dashboard', 'stores', 'staff', 'scenarios', 'schedule', 'shift-submission',
  'gm-availability', 'private-booking-management', 'private-booking-groups', 'reservations', 'accounts', 'sales',
  'settings', 'manual', 'login', 'signup', 'reset-password', 'set-password', 'license-management',
  'staff-profile', 'mypage', 'my-page', 'author', 'external-reports', 'accept-invitation',
  'organization-register', 'author-dashboard', 'author-login', 'register', 'about', 'scenario',
  'organizations', 'coupons', 'blog', 'user-management', 'scenario-masters', 'scenario-matcher',
  'license-reports', 'customer-management', 'partner-report']

/** パスの先頭が組織の公開ページなら、その組織の slug（例 /queenswaltz-sapporo/scenario/… → queenswaltz-sapporo） */
export function getOrgSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/([^/]+)/)
  if (!match) return null
  return NON_ORG_SEGMENTS.includes(match[1]) ? null : match[1]
}

/**
 * ヘッダーの「MMQ > 組織名」に出す組織。
 * 組織の公開ページ（URL に組織がある）では、ログイン中のスタッフでも URL の組織を出す
 * （別組織のページで自分の組織名・リンクを出さない。2026-10-25 札幌店の作品詳細で「クインズワルツ」と出た不具合）。
 * URL の組織をまだ読み込めていないときは、別の組織を代わりに出さない。
 * 管理ページなど URL に組織がないページだけ、スタッフの所属組織 → 最後に見た組織の順。
 */
export function pickHeaderOrganization(
  urlOrgSlug: string | null,
  visitedOrganization: Organization | null,
  staffOrganization: Organization | null,
): Organization | null {
  if (urlOrgSlug) return visitedOrganization?.slug === urlOrgSlug ? visitedOrganization : null
  return staffOrganization || visitedOrganization
}

interface HeaderProps {
  onPageChange?: (pageId: string) => void
  backgroundColor?: string
}

export const Header = memo(function Header({ onPageChange, backgroundColor }: HeaderProps) {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { organization: staffOrganization, organizationId } = useOrganization()
  const location = useLocation()
  
  // 訪問した組織（顧客用）
  const [visitedOrganization, setVisitedOrganization] = useState<Organization | null>(null)
  
  const urlOrgSlug = useMemo(() => getOrgSlugFromPath(location.pathname), [location.pathname])

  // URLまたはlocalStorageから訪問組織を取得・保持（遅れて届いた前のページの応答では上書きしない）
  useEffect(() => {
    let cancelled = false
    const loadVisitedOrganization = async () => {
      // 1. URLから組織スラッグを取得
      if (urlOrgSlug) {
        // URLに組織がある場合、それを取得して保存
        const org = await getOrganizationBySlug(urlOrgSlug)
        if (cancelled) return
        if (org) {
          setVisitedOrganization(org)
          localStorage.setItem(VISITED_ORG_KEY, JSON.stringify({ slug: org.slug, name: org.name, id: org.id }))
          return
        }
      }

      // 2. URLに組織がない場合、localStorageから復元
      const stored = localStorage.getItem(VISITED_ORG_KEY)
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { slug?: string; id?: string; name?: string }
          const storedKey = parsed.slug || parsed.id
          if (!storedKey) return
          // slug のみ保存されていない古いデータは id で復元
          const org = await getOrganizationBySlug(storedKey)
          if (cancelled) return
          if (org) {
            setVisitedOrganization(org)
          }
        } catch (e) {
          // パースエラーは無視
        }
      }
    }

    loadVisitedOrganization()
    return () => { cancelled = true }
  }, [urlOrgSlug]) // URLの組織が変わったら再実行

  // 表示する組織：組織の公開ページでは URL の組織、それ以外はスタッフ所属組織 > 訪問組織
  const displayOrganization = pickHeaderOrganization(urlOrgSlug, visitedOrganization, staffOrganization)
  const slug = displayOrganization?.slug

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
    } catch (error) {
      logger.error('Sign out error:', error)
    }
  }, [signOut])

  // プラットフォームトップへ
  const handlePlatformClick = useCallback(() => {
    navigate('/')
  }, [navigate])

  // 組織の予約サイトトップへ
  const handleOrgClick = useCallback(() => {
    if (slug) {
      navigate(`/${slug}`)
    }
  }, [navigate, slug])

  const handleMyPageClick = useCallback(() => {
    if (onPageChange) {
      onPageChange('my-page')
    } else {
      navigate('/mypage')
    }
  }, [onPageChange, navigate])

  // 管理サイト（ダッシュボード）へ
  const handleDashboardClick = useCallback(() => {
    // 別組織の公開ページにいても、管理サイトは自分の所属組織へ
    const dashboardSlug = staffOrganization?.slug || slug
    if (dashboardSlug) {
      navigate(`/${dashboardSlug}/dashboard`)
    } else {
      navigate('/dashboard')
    }
  }, [navigate, slug, staffOrganization?.slug])
  
  // スタッフまたは管理者かどうか（MMQ運営も含む）
  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin' || user?.role === 'license_admin'

  // 公開組織ページ（/{slug} 以下の予約サイト）かどうか。管理ページのセグメントは除外
  const isPublicOrgPage = urlOrgSlug !== null

  // URL から組織 slug を即時取得し、 localStorage キャッシュからテーマカラーを取得
  // (displayOrganization の非同期 fetch を待たないことでチラつきを防ぐ)
  const urlSlug = urlOrgSlug
  const themePreset = useOrgThemePreset(urlSlug)

  // 組織の公開ページのみテーマカラーを適用、管理ページはデフォルト
  const headerBgColor = backgroundColor ?? (isPublicOrgPage ? themePreset.primary : THEME.primary)

  return (
    <>
    <header
      className="h-[44px] sm:h-[48px] md:h-[52px] text-white relative"
      style={{ backgroundColor: headerBgColor, zIndex: 40 }}
    >
      <div className="mx-auto px-2 sm:px-3 md:px-4 md:px-6 h-full max-w-full overflow-visible">
        <div className="flex items-center justify-between h-full gap-1 sm:gap-2">
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 min-w-0 flex-shrink">
            {/* プラットフォームロゴ → プラットフォームトップへ */}
            <h1 
              className="cursor-pointer hover:opacity-80 text-sm sm:text-base font-bold leading-none whitespace-nowrap text-white"
              onClick={handlePlatformClick}
              title="プラットフォームトップへ"
            >
              MMQ
            </h1>
            
            {/* 組織がある場合は組織ボタンを表示。名前は空いている幅（最大 160px）まで使い、入らないときだけ省略
                （以前のスマホ 80px 固定では「クインズワルツ札幌店」が「クインズワ…」と切れて見分けられなかった） */}
            {displayOrganization && (
              <>
                <ChevronRight className="h-3 w-3 text-white/50 hidden sm:block" />
                <button
                  onClick={handleOrgClick}
                  className="flex min-w-0 items-center gap-1 px-1.5 sm:px-2 py-0.5 hover:bg-white/10 transition-colors cursor-pointer rounded"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                  title={`${displayOrganization.name}の予約サイトへ`}
                >
                  <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
                  <span 
                    className="min-w-0 text-xs sm:text-sm font-medium text-white truncate max-w-[160px]"
                    {...devDb('organizations.name')}
                  >
                    {displayOrganization.name}
                  </span>
                </button>
              </>
            )}
            
            {/* 組織がない場合はプラットフォーム全体であることを示す */}
            {!displayOrganization && (
              <div className="hidden sm:flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3 text-white/50" />
                <span className="text-xs text-white/80 bg-white/10 px-2 py-0.5 rounded">
                  全店舗を探す
                </span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1 flex-shrink-0">
            {user ? (
              <>
                {/* ユーザー情報（PC表示のみ） */}
                <div className="hidden md:flex items-center gap-1.5 mr-1">
                  <span 
                    className="text-sm font-medium text-white truncate max-w-[120px]"
                    {...devDb('customers.nickname|staff.name|customers.name')}
                  >
                    {user?.staffName || user?.customerName || user?.name}
                  </span>
                  {/* 役割バッジはスタッフ側だけ。お客様（role=customer）には「顧客」を出さない */}
                  {(checkIsLicenseAdmin(user?.role, organizationId) || (!!user?.role && user.role !== 'customer')) && (
                    <Badge 
                      className="text-[10px] px-1.5 py-0 bg-white/20 text-white border-0"
                      style={{ borderRadius: 0 }}
                      {...devDb('users.role')}
                    >
                      {checkIsLicenseAdmin(user?.role, organizationId) ? 'MMQ運営' :
                       user?.role === 'admin' ? '管理者' : 
                       user?.role === 'staff' ? 'スタッフ' : '顧客'}
                    </Badge>
                  )}
                </div>
                {/* スタッフ/管理者用：管理サイトボタン */}
                {isStaffOrAdmin && (
                  <button
                    onClick={handleDashboardClick}
                    className="inline-flex items-center gap-1 h-8 px-2 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    title="管理サイトへ"
                    aria-label="管理サイトへ"
                  >
                    <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">管理</span>
                  </button>
                )}
                {/* グローバル検索ボタン（Cmd+K） */}
                {isStaffOrAdmin && (
                  <button
                    onClick={() => {
                      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
                    }}
                    className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2 text-xs text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors border border-white/20 rounded"
                    title="グローバル検索 (⌘K)"
                    aria-label="グローバル検索（⌘K）"
                  >
                    <Search className="h-3 w-3" aria-hidden="true" />
                    <span className="text-[10px]">⌘K</span>
                  </button>
                )}
                <button 
                  className="inline-flex items-center justify-center h-8 w-8 hover:bg-white/10 transition-colors text-white"
                  onClick={handleMyPageClick}
                  title="マイページ"
                  aria-label="マイページ"
                >
                  <User className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
                <NotificationDropdown />
                <button 
                  onClick={handleSignOut} 
                  className="inline-flex items-center gap-1 h-8 px-3 text-xs bg-white text-[#E60012] hover:bg-white/90 font-medium transition-colors ml-1"
                  aria-label="ログアウト"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">ログアウト</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1">
                <button 
                  className="inline-flex items-center gap-1 h-8 px-3 text-xs bg-white text-[#E60012] hover:bg-white/90 font-medium transition-colors"
                  onClick={() => {
                    // 今見ている画面に戻れるよう戻り先を付ける（トップ・認証画面なら付かない）
                    window.location.href = buildAuthUrl('login', currentPathWithSearch())
                  }}
                >
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                  {/* スマホでも文字を出す（点検 29） */}
                  <span>ログイン</span>
                </button>
                <button 
                  className="inline-flex items-center gap-1 h-8 px-3 text-xs bg-white/20 text-white hover:bg-white/30 font-medium transition-colors"
                  onClick={() => {
                    // 今見ている画面に戻れるよう戻り先を付ける（トップ・認証画面なら付かない）
                    window.location.href = buildAuthUrl('signup', currentPathWithSearch())
                  }}
                >
                  <span>新規登録</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
    </>
  )
})
