import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { 
  Store,
  Clock,
  Calendar,
  Ticket,
  DollarSign,
  FileText,
  Bell,
  Users,
  Settings as SettingsIcon,
  Mail,
  Award,
  Database
} from 'lucide-react'

interface SettingsSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ activeTab, onTabChange }) => {
  const menuItems = [
    {
      id: 'store-basic',
      label: '店舗基本設定',
      icon: Store,
      description: '店舗名、住所、連絡先など'
    },
    {
      id: 'business-hours',
      label: '営業時間設定',
      icon: Clock,
      description: '営業時間、定休日など'
    },
    {
      id: 'performance-schedule',
      label: '公演スケジュール',
      icon: Calendar,
      description: '1日の公演回数、開始時間'
    },
    {
      id: 'reservation',
      label: '予約設定',
      icon: Ticket,
      description: '予約受付期間、人数制限'
    },
    {
      id: 'pricing',
      label: '料金設定',
      icon: DollarSign,
      description: '参加費、割引、キャンセル料'
    },
    {
      id: 'sales-report',
      label: '売上・レポート',
      icon: FileText,
      description: '締日、レポート送信設定'
    },
    {
      id: 'notifications',
      label: '通知設定',
      icon: Bell,
      description: 'メール、Discord通知'
    },
    {
      id: 'staff',
      label: 'スタッフ設定',
      icon: Users,
      description: 'GM報酬、シフト期限'
    },
    {
      id: 'system',
      label: 'システム設定',
      icon: SettingsIcon,
      description: 'タイムゾーン、言語、通貨'
    },
    {
      id: 'email',
      label: 'メール設定',
      icon: Mail,
      description: '送信元、テンプレート'
    },
    {
      id: 'customer',
      label: '顧客管理設定',
      icon: Award,
      description: '会員ランク、ポイント制度'
    },
    {
      id: 'data',
      label: 'データ管理',
      icon: Database,
      description: 'バックアップ、保持期間'
    }
  ]

  return (
    <div className="w-72 bg-slate-50 border-r border-slate-200 h-full flex-shrink-0">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4 text-slate-800">システム設定</h2>
        <nav className="space-y-2">
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

export default SettingsSidebar

