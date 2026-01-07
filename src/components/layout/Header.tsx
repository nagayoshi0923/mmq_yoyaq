import { useCallback, memo, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, LogOut, User, Building2, ChevronRight, LayoutDashboard } from 'lucide-react'
import { logger } from '@/utils/logger'
import { devDb } from '@/components/ui/DevField'
import { getOrganizationBySlug } from '@/lib/organization'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import type { Organization } from '@/types'

// 訪問組織のlocalStorageキー
const VISITED_ORG_KEY = 'mmq_visited_organization'

// URLから組織スラッグを取得
function getOrgSlugFromUrl(): string | null {
  const pathname = window.location.pathname
  const match = pathname.match(/^\/([^/]+)/)
  if (match) {
    // 管理ページや特殊パスは除外
    const excludePaths = ['dashboard', 'stores', 'staff', 'scenarios', 'schedule', 'shift-submission', 
      'gm-availability', 'private-booking-management', 'reservations', 'accounts', 'sales', 
      'settings', 'manual', 'login', 'signup', 'reset-password', 'set-password', 'license-management',
      'staff-profile', 'mypage', 'my-page', 'author', 'external-reports', 'accept-invitation', 
      'organization-register', 'author-dashboard', 'author-login', 'register', 'about', 'scenario']
    if (!excludePaths.includes(match[1])) {
      return match[1]
    }
  }
  return null
}

interface HeaderProps {
  onPageChange?: (pageId: string) => void
}

export const Header = memo(function Header({ onPageChange }: HeaderProps) {
  const { user, signOut } = useAuth()
  const { organization: staffOrganization } = useOrganization()
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
          const parsed = JSON.parse(stored)
          // 保存されている情報から組織を復元
          const org = await getOrganizationBySlug(parsed.slug)
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
    window.location.href = '/'
  }, [])

  // 組織の予約サイトトップへ
  const handleOrgClick = useCallback(() => {
    if (slug) {
      window.location.href = `/${slug}`
    }
  }, [slug])

  const handleMyPageClick = useCallback(() => {
    if (onPageChange) {
      onPageChange('my-page')
    } else {
      window.location.href = '/mypage'
    }
  }, [onPageChange])

  // 管理サイト（ダッシュボード）へ
  const handleDashboardClick = useCallback(() => {
    if (slug) {
      window.location.href = `/${slug}/dashboard`
    } else {
      window.location.href = '/dashboard'
    }
  }, [slug])
  
  // スタッフまたは管理者かどうか（MMQ運営も含む）
  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin' || user?.role === 'license_admin'

  return (
    <header 
      className="border-b h-[44px] sm:h-[48px] md:h-[52px] text-white"
      style={{ backgroundColor: THEME.primary, borderColor: THEME.primaryHover }}
    >
      <div className="mx-auto px-2 sm:px-3 md:px-4 md:px-6 h-full max-w-full overflow-hidden">
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
            
            {/* 組織がある場合は組織ボタンを表示 */}
            {displayOrganization && (
              <>
                <ChevronRight className="h-3 w-3 text-white/50 hidden sm:block" />
                <button
                  onClick={handleOrgClick}
                  className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 hover:bg-white/10 transition-colors cursor-pointer"
                  title={`${displayOrganization.name}の予約サイトへ`}
                >
                  <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
                  <span 
                    className="text-xs sm:text-sm font-medium text-white truncate max-w-[80px] sm:max-w-[120px] md:max-w-[160px]"
                    {...devDb('organizations.name')}
                  >
                    {displayOrganization.name}
                  </span>
                </button>
              </>
            )}
            
            {/* 組織がない場合のみサブタイトルを表示 */}
            {!displayOrganization && (
              <p className="hidden sm:inline text-xs sm:text-xs text-white/70 leading-none whitespace-nowrap">
                マーダーミステリー店舗管理
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 flex-shrink-0">
            {user ? (
              <>
                <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
                  <span 
                    className="text-xs sm:text-sm font-medium text-white truncate max-w-[60px] sm:max-w-[80px] md:max-w-[100px] md:max-w-none"
                    {...devDb('staff.name|users.email')}
                  >
                    {user?.staffName || user?.name}
                  </span>
                  <Badge 
                    className="text-xs sm:text-xs px-1 sm:px-1.5 md:px-2 py-0.5 bg-white/20 text-white border-0"
                    style={{ borderRadius: 0 }}
                    {...devDb('users.role')}
                  >
                    {user?.role === 'license_admin' ? 'MMQ運営' :
                     user?.role === 'admin' ? '管理者' : 
                     user?.role === 'staff' ? 'スタッフ' : '顧客'}
                  </Badge>
                </div>
                {/* スタッフ/管理者用：管理サイトボタン */}
                {isStaffOrAdmin && (
                  <button
                    onClick={handleDashboardClick}
                    className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 text-xs sm:text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
                    title="管理サイトへ"
                  >
                    <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">管理</span>
                  </button>
                )}
                <button 
                  className="inline-flex items-center justify-center whitespace-nowrap text-xs font-medium transition-colors hover:bg-white/10 h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 p-0 touch-manipulation text-white"
                  onClick={handleMyPageClick}
                  title="マイページ"
                >
                  <User className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5" />
                </button>
                <button 
                  className="inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 p-0 touch-manipulation text-white hover:bg-white/10 transition-colors"
                >
                  <Bell className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5" />
                </button>
                <button 
                  onClick={handleSignOut} 
                  className="inline-flex items-center h-8 sm:h-9 md:h-10 text-xs sm:text-sm px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 touch-manipulation bg-white text-[#E60012] hover:bg-white/90 font-medium transition-colors"
                >
                  <LogOut className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 md:mr-1.5" />
                  <span className="hidden sm:inline">ログアウト</span>
                </button>
              </>
            ) : (
              <button 
                className="inline-flex items-center h-8 sm:h-9 md:h-10 text-xs sm:text-sm px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 touch-manipulation bg-white text-[#E60012] hover:bg-white/90 font-medium transition-colors"
                onClick={() => {
                  window.location.href = '/#login'
                }}
              >
                <User className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 sm:mr-1.5" />
                <span className="hidden sm:inline">ログイン</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
})
