import React from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, LogOut } from 'lucide-react'

interface HeaderProps {
  onPageChange?: (pageId: string) => void
}

export function Header({ onPageChange }: HeaderProps) {
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  const handleTitleClick = () => {
    if (onPageChange) {
      onPageChange('dashboard')
    } else {
      // 各機能ページから呼ばれた場合はハッシュを変更
      window.location.hash = ''
    }
  }

  return (
    <header className="border-b border-border bg-card">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 
              className="cursor-pointer hover:text-primary"
              onClick={handleTitleClick}
            >
              MMQ
            </h1>
            <p className="text-muted-foreground">マーダーミステリー店舗管理</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <Badge className={
                user?.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                user?.role === 'staff' ? 'bg-green-100 text-green-800' :
                'bg-purple-100 text-purple-800'
              }>
                {user?.role === 'admin' ? '管理者' : 
                 user?.role === 'staff' ? 'スタッフ' : '顧客'}
              </Badge>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              ログアウト
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
