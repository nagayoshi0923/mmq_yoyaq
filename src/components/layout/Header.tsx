import { useCallback, memo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, LogOut, User } from 'lucide-react'
import { logger } from '@/utils/logger'

interface HeaderProps {
  onPageChange?: (pageId: string) => void
}

export const Header = memo(function Header({ onPageChange }: HeaderProps) {
  const { user, signOut } = useAuth()

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
    } catch (error) {
      logger.error('Sign out error:', error)
    }
  }, [signOut])

  const handleTitleClick = useCallback(() => {
    if (onPageChange) {
      onPageChange('dashboard')
    } else {
      // 各機能ページから呼ばれた場合はハッシュを変更
      window.location.hash = ''
    }
  }, [onPageChange])

  // 最適化: マイページボタンのクリックハンドラをメモ化
  const handleMyPageClick = useCallback(() => {
    if (onPageChange) {
      onPageChange('my-page')
    } else {
      // フォールバック: 直接URLハッシュを変更
      window.location.hash = 'my-page'
    }
  }, [onPageChange])

  return (
    <header className="border-b border-border bg-card h-[44px] sm:h-[48px] md:h-[52px]">
      <div className="mx-auto px-2 sm:px-3 md:px-4 lg:px-6 h-full max-w-full overflow-hidden">
        <div className="flex items-center justify-between h-full gap-1 sm:gap-2">
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 min-w-0 flex-shrink">
            <h1 
              className="cursor-pointer hover:text-primary text-sm sm:text-base md:text-lg font-bold leading-none whitespace-nowrap"
              onClick={handleTitleClick}
            >
              MMQ
            </h1>
            <p className="hidden sm:inline text-xs sm:text-xs text-muted-foreground leading-none whitespace-nowrap">
              マーダーミステリー店舗管理
            </p>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 flex-shrink-0">
            {user ? (
              <>
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <span className="text-xs sm:text-sm font-medium text-foreground truncate max-w-[60px] sm:max-w-[80px] md:max-w-[100px] lg:max-w-none">
                    {user?.staffName || user?.name}
                  </span>
                  <Badge className={
                    `text-[10px] sm:text-xs px-1 sm:px-1.5 md:px-2 py-0.5 ${
                      user?.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                      user?.role === 'staff' ? 'bg-green-100 text-green-800' :
                      'bg-purple-100 text-purple-800'
                    }`
                  }>
                    {user?.role === 'admin' ? '管理者' : 
                     user?.role === 'staff' ? 'スタッフ' : '顧客'}
                  </Badge>
                </div>
                <button 
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 p-0 touch-manipulation"
                  onClick={handleMyPageClick}
                  title="マイページ"
                >
                  <User className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5" />
                </button>
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 p-0 touch-manipulation">
                  <Bell className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSignOut} 
                  className="h-8 sm:h-9 md:h-10 text-xs sm:text-sm px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 touch-manipulation"
                >
                  <LogOut className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 md:mr-1.5" />
                  <span className="hidden sm:inline">ログアウト</span>
                </Button>
              </>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                className="h-8 sm:h-9 md:h-10 text-xs sm:text-sm px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 touch-manipulation"
                onClick={() => {
                  window.location.href = '/#login'
                }}
              >
                <User className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 sm:mr-1.5" />
                <span className="hidden sm:inline">ログイン</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
})
