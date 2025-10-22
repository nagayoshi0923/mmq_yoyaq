import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Users,
  UserPlus,
  Search,
  Calendar,
  History,
  Settings,
  Download,
  BarChart3,
  Mail,
  Phone,
  MapPin,
  Star
} from 'lucide-react'

interface CustomerSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const CustomerSidebar: React.FC<CustomerSidebarProps> = ({ activeTab, onTabChange }) => {
  const menuItems = [
    {
      id: 'customer-list',
      label: '顧客一覧',
      icon: Users,
      description: 'すべての顧客を表示・管理'
    },
    {
      id: 'new-customer',
      label: '新規顧客追加',
      icon: UserPlus,
      description: '新しい顧客を登録'
    },
    {
      id: 'customer-search',
      label: '顧客検索',
      icon: Search,
      description: '顧客名・連絡先で検索'
    },
    {
      id: 'reservation-history',
      label: '予約履歴',
      icon: Calendar,
      description: '顧客の予約履歴'
    },
    {
      id: 'contact-history',
      label: '連絡履歴',
      icon: Phone,
      description: '顧客との連絡履歴'
    },
    {
      id: 'favorite-customers',
      label: 'お気に入り顧客',
      icon: Star,
      description: '重要な顧客の管理'
    },
    {
      id: 'customer-groups',
      label: '顧客グループ',
      icon: MapPin,
      description: '地域・属性別のグループ管理'
    },
    {
      id: 'email-management',
      label: 'メール管理',
      icon: Mail,
      description: '顧客へのメール送信'
    },
    {
      id: 'analytics',
      label: '顧客分析',
      icon: BarChart3,
      description: '顧客データの分析'
    },
    {
      id: 'export-data',
      label: 'データエクスポート',
      icon: Download,
      description: '顧客データの出力'
    },
    {
      id: 'customer-settings',
      label: '顧客設定',
      icon: Settings,
      description: '顧客関連の設定'
    }
  ]

  return (
    <div className="w-72 bg-slate-50 border-r border-slate-200 h-full flex-shrink-0">
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">
            顧客管理
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

export default CustomerSidebar
