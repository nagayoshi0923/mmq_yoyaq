import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, LogOut, User } from 'lucide-react'
import { logger } from '@/utils/logger'

interface HeaderProps {
  onPageChange?: (pageId: string) => void
}

export function Header({ onPageChange }: HeaderProps) {
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

  return (
    <header className="border-b border-border bg-card h-[40px]">
      <div className="mx-auto px-1.5 sm:px-2 md:px-4 lg:px-6 h-full max-w-full overflow-hidden">
        <div className="flex items-center justify-between h-full gap-1 sm:gap-2">
          <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 min-w-0 flex-shrink">
            <h1 
              className="cursor-pointer hover:text-primary text-xs sm:text-sm md:text-base font-bold leading-none whitespace-nowrap"
              onClick={handleTitleClick}
            >
              MMQ
            </h1>
            <p className="hidden md:inline text-xs text-muted-foreground leading-none whitespace-nowrap">
              マーダーミステリー店舗管理
            </p>
          </div>
          
          <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 flex-shrink-0">
            {user ? (
              <>
                <div className="hidden lg:flex items-center gap-1.5">
                  <span className="text-xs font-medium text-foreground truncate max-w-[80px] xl:max-w-none">
                    {user?.staffName || user?.name}
                  </span>
                  <Badge className={
                    `text-[10px] px-1 py-0 ${
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
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 p-0"
                  onClick={() => {
                    if (onPageChange) {
                      onPageChange('my-page')
                    } else {
                      // フォールバック: 直接URLハッシュを変更
                      window.location.hash = 'my-page'
                    }
                  }}
                  title="マイページ"
                >
                  <User className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </button>
                <Button variant="ghost" size="icon" className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 p-0">
                  <Bell className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSignOut} 
                  className="h-6 sm:h-7 md:h-8 text-[10px] sm:text-xs px-1.5 sm:px-2 md:px-3 py-1"
                >
                  <LogOut className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:mr-1" />
                  <span className="hidden md:inline">ログアウト</span>
                </Button>
              </>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                className="h-6 sm:h-7 md:h-8 text-[10px] sm:text-xs px-1.5 sm:px-2 md:px-3 py-1"
                onClick={() => {
                  window.location.href = '/#login'
                }}
              >
                <User className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:mr-1" />
                <span className="hidden md:inline">ログイン</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
