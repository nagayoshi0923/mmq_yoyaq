import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { 
  Store, 
  Calendar, 
  Users, 
  BookOpen, 
  TrendingUp,
  Clock,
  Settings,
  ClipboardCheck,
  UserCog
} from 'lucide-react'

interface NavigationBarProps {
  currentPage?: string
  onPageChange?: (pageId: string) => void
}

export function NavigationBar({ currentPage, onPageChange }: NavigationBarProps) {
  const { user } = useAuth()
  
  // 全タブ定義（定数なのでメモ化）
  const allTabs = useMemo(() => [
    { id: 'stores', label: '店舗', icon: Store, roles: ['admin', 'staff'] },
    { id: 'schedule', label: 'スケジュール', icon: Calendar, roles: ['admin', 'staff'] },
    { id: 'staff', label: 'スタッフ', icon: Users, roles: ['admin', 'staff'] },
    { id: 'scenarios', label: 'シナリオ', icon: BookOpen, roles: ['admin', 'staff'] },
    { id: 'shift-submission', label: 'シフト提出', icon: Clock, roles: ['admin', 'staff'] },
    { id: 'gm-availability', label: 'GM確認', icon: Clock, roles: ['admin', 'staff'] },
    { id: 'private-booking-management', label: '貸切確認', icon: ClipboardCheck, roles: ['admin', 'staff'] },
    { id: 'customer-booking', label: '予約サイト', icon: Calendar, roles: ['admin', 'staff', 'customer'] },
    { id: 'reservations', label: '予約管理', icon: Calendar, roles: ['admin', 'staff'] },
    { id: 'customers', label: '顧客', icon: Users, roles: ['admin', 'staff'] },
    { id: 'user-management', label: 'ユーザー', icon: UserCog, roles: ['admin'] },
    { id: 'sales', label: '売上', icon: TrendingUp, roles: ['admin', 'staff'] },
    { id: 'settings', label: '設定', icon: Settings, roles: ['admin'] }
  ], [])
  
  // ユーザーのロールに応じてタブをフィルタリング
  const navigationTabs = useMemo(() => 
    allTabs.filter(tab => !user || tab.roles.includes(user.role)),
    [allTabs, user]
  )

  return (
    <nav className="border-b border-border bg-muted/30">
      <div className="container mx-auto max-w-7xl px-8 py-3">
        <div className="flex flex-wrap" style={{ gap: '1px' }}>
          {navigationTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = currentPage === tab.id
            const href = tab.id === 'dashboard' ? '#' : `#${tab.id}`
            return (
              <a
                key={tab.id}
                href={href}
                onClick={(e) => {
                  // 中クリック、Cmd+クリック、Ctrl+クリックの場合は通常のリンク動作
                  if (e.button === 1 || e.metaKey || e.ctrlKey) {
                    return
                  }
                  
                  if (onPageChange) {
                    e.preventDefault()
                    onPageChange(tab.id)
                  }
                }}
                className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground rounded-none ${
                  isActive 
                    ? 'text-foreground border-b-[3px] border-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </a>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
