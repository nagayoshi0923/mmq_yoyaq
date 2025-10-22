import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CheckCircle,
  Clock,
  Calendar,
  Users,
  AlertCircle,
  History,
  Settings,
  MessageSquare
} from 'lucide-react'

interface GMSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const GMSidebar: React.FC<GMSidebarProps> = ({ activeTab, onTabChange }) => {
  const menuItems = [
    {
      id: 'availability-check',
      label: 'GM可否確認',
      icon: CheckCircle,
      description: 'GMリクエストへの回答'
    },
    {
      id: 'pending-requests',
      label: '未回答リクエスト',
      icon: Clock,
      description: '回答待ちのリクエスト'
    },
    {
      id: 'all-requests',
      label: '全リクエスト',
      icon: Calendar,
      description: 'すべてのリクエスト履歴'
    },
    {
      id: 'candidate-management',
      label: '候補者管理',
      icon: Users,
      description: 'GM候補者の管理'
    },
    {
      id: 'conflict-check',
      label: 'スケジュール確認',
      icon: AlertCircle,
      description: '既存スケジュールとの重複確認'
    },
    {
      id: 'response-history',
      label: '回答履歴',
      icon: History,
      description: '過去の回答履歴'
    },
    {
      id: 'notifications',
      label: '通知設定',
      icon: MessageSquare,
      description: 'リクエスト通知の設定'
    },
    {
      id: 'gm-settings',
      label: 'GM設定',
      icon: Settings,
      description: 'GM関連の設定'
    }
  ]

  return (
    <div className="w-72 bg-slate-50 border-r border-slate-200 h-full flex-shrink-0">
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-5 w-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">
            GM確認
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

export default GMSidebar
