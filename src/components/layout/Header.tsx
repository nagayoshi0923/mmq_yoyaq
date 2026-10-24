import { useCallback, memo, useEffect, useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization, checkIsLicenseAdmin } from '@/hooks/useOrganization'
import { useOrgThemePreset } from '@/hooks/useOrgThemePreset'
import { logger } from '@/utils/logger'
import { getOrganizationBySlug } from '@/lib/organization'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { NotificationDropdown } from './NotificationDropdown'
import { HeaderView } from './HeaderView'
import type { Organization } from '@/types'
import { buildAuthUrl, currentPathWithSearch } from '@/lib/authReturn'

// 訪問組織のlocalStorageキー
const VISITED_ORG_KEY = 'mmq_visited_organization'

// URLから組織スラッグを取得
function getOrgSlugFromUrl(): string | null {
  const pathname = window.location.pathname
  const match = pathname.match(/^\/([^/]+)/)
  if (match) {
    // 管理ページや特殊パスは除外
    const excludePaths = ['dashboard', 'store-dashboard', 'stores', 'staff', 'scenarios', 'schedule', 'shift-submission',
      'gm-availability', 'private-booking-management', 'reservations', 'accounts', 'sales', 
      'settings', 'manual', 'login', 'signup', 'reset-password', 'set-password', 'license-management',
      'staff-profile', 'mypage', 'my-page', 'author', 'external-reports', 'accept-invitation', 
      'organization-register', 'author-dashboard', 'author-login', 'register', 'about', 'scenario',
      'partner-report']
    if (!excludePaths.includes(match[1])) {
      return match[1]
    }
  }
  return null
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
  
  // URLまたはlocalStorageから訪問組織を取得・保持
  useEffect(() => {
    const loadVisitedOrganization = async () => {
      // 1. URLから組織スラッグを取得
      const urlSlug = getOrgSlugFromUrl()
      
      if (urlSlug) {
        // URLに組織がある場合、それを取得して保存
        const org = await getOrganizationBySlug(urlSlug)
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
          if (org) {
            setVisitedOrganization(org)
          }
        } catch (e) {
          // パースエラーは無視
        }
      }
    }
    
    loadVisitedOrganization()
  }, [location.pathname]) // URLが変わったら再実行
  
  // 表示する組織：スタッフ所属組織 > 訪問組織
  const displayOrganization = staffOrganization || visitedOrganization
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
    if (slug) {
      navigate(`/${slug}/dashboard`)
    } else {
      navigate('/dashboard')
    }
  }, [navigate, slug])
  
  // スタッフまたは管理者かどうか（MMQ運営も含む）
  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin' || user?.role === 'license_admin'

  // 公開組織ページ（/{slug} 以下の予約サイト）かどうかを判定
  // 管理ページのセグメントを含む場合は管理ページとみなす
  const isPublicOrgPage = useMemo(() => {
    const adminSegments = ['dashboard', 'store-dashboard', 'stores', 'staff', 'scenarios', 'schedule', 'shift-submission',
      'gm-availability', 'private-booking-management', 'private-booking-groups', 'reservations', 'accounts', 'sales',
      'settings', 'manual', 'login', 'signup', 'reset-password', 'set-password', 'license-management',
      'staff-profile', 'mypage', 'my-page', 'author', 'external-reports', 'accept-invitation',
      'organization-register', 'author-dashboard', 'author-login', 'register', 'about', 'scenario',
      'organizations', 'coupons', 'blog', 'user-management', 'scenario-masters', 'scenario-matcher',
      'license-reports', 'customer-management', 'partner-report']
    const match = location.pathname.match(/^\/([^/]+)/)
    if (!match) return false
    return !adminSegments.includes(match[1])
  }, [location.pathname])

  // URL から組織 slug を即時取得し、 localStorage キャッシュからテーマカラーを取得
  // (displayOrganization の非同期 fetch を待たないことでチラつきを防ぐ)
  const urlSlug = useMemo(() => {
    if (typeof window === 'undefined') return null
    const match = window.location.pathname.match(/^\/([^/]+)/)
    if (!match) return null
    const exclude = ['dashboard', 'store-dashboard', 'stores', 'staff', 'scenarios', 'schedule', 'shift-submission',
      'gm-availability', 'private-booking-management', 'private-booking-groups', 'reservations', 'accounts', 'sales',
      'settings', 'manual', 'login', 'signup', 'reset-password', 'set-password', 'license-management',
      'staff-profile', 'mypage', 'my-page', 'author', 'external-reports', 'accept-invitation',
      'organization-register', 'author-dashboard', 'author-login', 'register', 'about', 'scenario',
      'organizations', 'coupons', 'blog', 'user-management', 'scenario-masters', 'scenario-matcher',
      'license-reports', 'customer-management', 'partner-report']
    return exclude.includes(match[1]) ? null : match[1]
  }, [location.pathname])
  const themePreset = useOrgThemePreset(urlSlug)

  // 組織の公開ページのみテーマカラーを適用、管理ページはデフォルト
  const headerBgColor = backgroundColor ?? (isPublicOrgPage ? themePreset.primary : THEME.primary)

  return (
    <HeaderView headerBgColor={headerBgColor} displayOrganization={displayOrganization} user={user}
      organizationId={organizationId} isStaffOrAdmin={isStaffOrAdmin}
      handlePlatformClick={handlePlatformClick} handleOrgClick={handleOrgClick}
      handleDashboardClick={handleDashboardClick} handleMyPageClick={handleMyPageClick}
      handleSignOut={() => { void handleSignOut() }}
      onSearch={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
      onLogin={() => { window.location.href = buildAuthUrl('login', currentPathWithSearch()) }}
      onSignup={() => { window.location.href = buildAuthUrl('signup', currentPathWithSearch()) }}
      notification={<NotificationDropdown />}
    />
  )
})
