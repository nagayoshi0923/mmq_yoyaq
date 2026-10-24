import { memo, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { LogOut, User, Building2, ChevronRight, LayoutDashboard, Search } from 'lucide-react'
import { checkIsLicenseAdmin } from '@/hooks/useOrganization'
import { devDb } from '@/components/ui/DevField'
import type { useAuth } from '@/contexts/AuthContext'
import type { Organization } from '@/types'

interface HeaderViewProps {
  headerBgColor: string
  displayOrganization: Pick<Organization, 'name'> | null
  user: ReturnType<typeof useAuth>['user']
  organizationId: string | null
  isStaffOrAdmin: boolean
  handlePlatformClick: () => void
  handleOrgClick: () => void
  handleDashboardClick: () => void
  handleMyPageClick: () => void
  handleSignOut: () => void
  onSearch: () => void
  onLogin: () => void
  onSignup: () => void
  notification: ReactNode
}

/** Shared display only; data and actions remain with the caller. */
export const HeaderView = memo(function HeaderView({ headerBgColor, displayOrganization, user, organizationId,
  isStaffOrAdmin, handlePlatformClick, handleOrgClick, handleDashboardClick, handleMyPageClick,
  handleSignOut, onSearch, onLogin, onSignup, notification,
}: HeaderViewProps) {
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

            {/* 組織がある場合は組織ボタンを表示 */}
            {displayOrganization && (
              <>
                <ChevronRight className="h-3 w-3 text-white/50 hidden sm:block" />
                <button
                  onClick={handleOrgClick}
                  className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 hover:bg-white/10 transition-colors cursor-pointer rounded"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
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
                    onClick={onSearch}
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
                {notification}
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
                  onClick={onLogin}
                >
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                  {/* スマホでも文字を出す（点検 29） */}
                  <span>ログイン</span>
                </button>
                <button
                  className="inline-flex items-center gap-1 h-8 px-3 text-xs bg-white/20 text-white hover:bg-white/30 font-medium transition-colors"
                  onClick={onSignup}
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
