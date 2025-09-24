import React from 'react'
import { Button } from '@/components/ui/button'
import { 
  Store, 
  Calendar, 
  Users, 
  BookOpen, 
  TrendingUp, 
  Package, 
  CreditCard,
  Settings
} from 'lucide-react'

interface NavigationBarProps {
  currentPage?: string
  onPageChange?: (pageId: string) => void
}

export function NavigationBar({ currentPage, onPageChange }: NavigationBarProps) {
  const navigationTabs = [
    { id: 'stores', label: '店舗', icon: Store },
    { id: 'schedule', label: 'スケジュール', icon: Calendar },
    { id: 'staff', label: 'スタッフ', icon: Users },
    { id: 'scenarios', label: 'シナリオ', icon: BookOpen },
    { id: 'reservations', label: '予約', icon: Calendar },
    { id: 'customers', label: '顧客', icon: Users },
    { id: 'sales', label: '売上', icon: TrendingUp },
    { id: 'inventory', label: '在庫', icon: Package },
    { id: 'licenses', label: 'ライセンス', icon: CreditCard },
    { id: 'settings', label: '設定', icon: Settings }
  ]

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
