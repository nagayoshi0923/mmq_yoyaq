import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Users,
  UserPlus,
  Search,
  Shield,
  UserCog,
  Settings,
  History,
  Download,
  BarChart3,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react'

interface UserSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const UserSidebar: React.FC<UserSidebarProps> = ({ activeTab, onTabChange }) => {
  const menuItems = [
    {
      id: 'user-list',
      label: 'ユーザー一覧',
      icon: Users,
      description: 'すべてのユーザーを表示・管理'
    },
    {
      id: 'user-search',
      label: 'ユーザー検索',
      icon: Search,
      description: 'メールアドレスでユーザー検索'
    },
    {
      id: 'role-management',
      label: '権限管理',
      icon: Shield,
      description: 'ユーザーの権限・ロール管理'
    },
    {
      id: 'admin-users',
      label: '管理者一覧',
      icon: UserCog,
      description: '管理者権限を持つユーザー'
    },
    {
      id: 'pending-users',
      label: '承認待ち',
      icon: Clock,
      description: '承認待ちのユーザー'
    },
    {
      id: 'active-users',
      label: 'アクティブユーザー',
      icon: CheckCircle,
      description: 'アクティブなユーザー'
    },
    {
      id: 'user-history',
      label: 'ユーザー履歴',
      icon: History,
      description: 'ユーザー操作の履歴'
    },
    {
      id: 'user-analytics',
      label: 'ユーザー分析',
      icon: BarChart3,
      description: 'ユーザーデータの分析'
    },
    {
      id: 'export-users',
      label: 'データエクスポート',
      icon: Download,
      description: 'ユーザーデータの出力'
    },
    {
      id: 'user-settings',
      label: 'ユーザー設定',
      icon: Settings,
      description: 'ユーザー関連の設定'
    }
  ]

  return (
    <div className="w-72 bg-slate-50 border-r border-slate-200 h-full flex-shrink-0">
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">
            ユーザー管理
          </h2>
        </div>

        <nav className="space-y-2 flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.id}
                variant={activeTab === item.id ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start h-auto p-3",
                  activeTab === item.id
                    ? "bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200"
                    : "text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                )}
                onClick={() => onTabChange(item.id)}
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {item.description}
                    </div>
                  </div>
                </div>
              </Button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

export default UserSidebar
