import { User, Calendar, BookOpen, Settings, Shield, Heart, Play } from 'lucide-react'

interface SidebarProps {
  currentPage: string
  onPageChange: (page: string) => void
}

const menuItems = [
  { id: 'profile', label: 'プロフィール', icon: User },
  { id: 'reservations', label: '予約履歴', icon: Calendar },
  { id: 'played-scenarios', label: '遊んだシナリオ', icon: Play },
  { id: 'liked-scenarios', label: 'いいねしたシナリオ', icon: Heart },
  { id: 'gm-history', label: 'GM履歴', icon: BookOpen },
  { id: 'account', label: 'アカウント', icon: Shield },
  { id: 'settings', label: '設定', icon: Settings },
]

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  return (
    <aside className="w-64 border-r bg-card p-4 space-y-2">
      <h2 className="font-semibold text-lg mb-4 px-3">マイページ</h2>
      {menuItems.map((item) => {
        const Icon = item.icon
        const isActive = currentPage === item.id

        return (
          <button
            key={item.id}
            onClick={() => onPageChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="font-medium">{item.label}</span>
          </button>
        )
      })}
    </aside>
  )
}

