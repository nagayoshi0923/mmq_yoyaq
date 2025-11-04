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
      <div className="mx-auto px-6 h-full">
        <div className="flex items-center justify-between h-full">
          <div className="flex items-center gap-2">
            <h1 
              className="cursor-pointer hover:text-primary text-base font-bold leading-none"
              onClick={handleTitleClick}
            >
              MMQ
            </h1>
            <p className="text-xs text-muted-foreground leading-none">マーダーミステリー店舗管理</p>
          </div>
          
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    {user?.staffName || user?.name}
                  </span>
                  <Badge className={
                    user?.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                    user?.role === 'staff' ? 'bg-green-100 text-green-800' :
                    'bg-purple-100 text-purple-800'
                  }>
                    {user?.role === 'admin' ? '管理者' : 
                     user?.role === 'staff' ? 'スタッフ' : '顧客'}
                  </Badge>
                </div>
                <button 
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8"
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
                  <User className="h-3.5 w-3.5" />
                </button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Bell className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleSignOut} className="h-8">
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />
                  ログアウト
                </Button>
              </>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                className="h-8"
                onClick={() => {
                  window.location.href = '/#login'
                }}
              >
                <User className="h-3.5 w-3.5 mr-1.5" />
                ログイン
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
