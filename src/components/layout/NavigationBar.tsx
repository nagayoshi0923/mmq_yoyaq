import React from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { 
  Store, 
  Calendar, 
  Users, 
  BookOpen, 
  TrendingUp, 
  Package, 
  CreditCard,
  Clock,
  Settings
} from 'lucide-react'

interface NavigationBarProps {
  currentPage?: string
  onPageChange?: (pageId: string) => void
}

export function NavigationBar({ currentPage, onPageChange }: NavigationBarProps) {
  const { user } = useAuth()
  
  // 全タブ定義
  const allTabs = [
    { id: 'stores', label: '店舗', icon: Store, roles: ['admin', 'staff'] },
    { id: 'schedule', label: 'スケジュール', icon: Calendar, roles: ['admin', 'staff'] },
    { id: 'staff', label: 'スタッフ', icon: Users, roles: ['admin', 'staff'] },
    { id: 'scenarios', label: 'シナリオ', icon: BookOpen, roles: ['admin', 'staff'] },
    { id: 'shift-submission', label: 'シフト提出', icon: Clock, roles: ['admin', 'staff'] },
    { id: 'customer-booking', label: '予約サイト', icon: Calendar, roles: ['admin', 'staff', 'customer'] },
    { id: 'reservations', label: '予約管理', icon: Calendar, roles: ['admin', 'staff'] },
    { id: 'customers', label: '顧客', icon: Users, roles: ['admin', 'staff'] },
    { id: 'sales', label: '売上', icon: TrendingUp, roles: ['admin', 'staff'] },
    { id: 'inventory', label: '在庫', icon: Package, roles: ['admin', 'staff'] },
    { id: 'licenses', label: 'ライセンス', icon: CreditCard, roles: ['admin', 'staff'] },
    { id: 'settings', label: '設定', icon: Settings, roles: ['admin'] }
  ]
  
  // ユーザーのロールに応じてタブをフィルタリング
  const navigationTabs = allTabs.filter(tab => 
    !user || tab.roles.includes(user.role)
  )

  const handlePageChange = (pageId: string) => {
    if (onPageChange) {
      onPageChange(pageId)
    } else {
      // 各機能ページから呼ばれた場合はハッシュを変更
      window.location.hash = pageId === 'dashboard' ? '' : pageId
    }
  }

  return (
    <nav className="border-b border-border bg-muted/30">
      <div className="container mx-auto max-w-7xl px-8 py-3">
        <div className="flex flex-wrap" style={{ gap: '1px' }}>
          {navigationTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = currentPage === tab.id
            return (
                <Button
                  key={tab.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(tab.id)}
                  className={`flex items-center gap-2 rounded-none ${
                    isActive 
                      ? 'text-foreground border-b-[3px] border-primary' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
