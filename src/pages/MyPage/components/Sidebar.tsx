import { User, Calendar, BookOpen, Settings, Shield, Star, Play } from 'lucide-react'

interface SidebarProps {
  currentPage: string
  onPageChange: (page: string) => void
}

const menuItems = [
  { id: 'profile', label: 'プロフィール', icon: User },
  { id: 'reservations', label: '予約履歴', icon: Calendar },
  { id: 'played-scenarios', label: '遊んだシナリオ', icon: Play },
  { id: 'want-to-play', label: '遊びたいシナリオ', icon: Star },
  { id: 'gm-history', label: 'GM履歴', icon: BookOpen },
  { id: 'account', label: 'アカウント', icon: Shield },
  { id: 'settings', label: '設定', icon: Settings },
]

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  return (
    <>
      {/* デスクトップサイドバー */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r bg-card p-3 md:p-4 space-y-1 md:space-y-2 md:border-r">
        <h2 className="font-semibold text-base md:text-lg mb-2 md:mb-4 px-3 hidden md:block">マイページ</h2>
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id

            return (
              <button
                key={item.id}
                onClick={() => onPageChange(item.id)}
                className={`w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2 rounded-lg transition-colors text-xs md:text-sm ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0" />
                <span className="font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* モバイルタブナビゲーション */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-card px-0">
        <div className="flex justify-between overflow-x-auto">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id

            return (
              <button
                key={item.id}
                onClick={() => onPageChange(item.id)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1.5 min-w-[56px] transition-colors text-[10px] ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title={item.label}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="text-[9px] leading-tight text-center truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

