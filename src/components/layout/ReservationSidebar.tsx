import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Calendar,
  Search,
  Clock,
  User,
  DollarSign,
  CheckCircle,
  AlertCircle,
  History,
  Settings,
  Download,
  Filter,
  BarChart3
} from 'lucide-react'

interface ReservationSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const ReservationSidebar: React.FC<ReservationSidebarProps> = ({ activeTab, onTabChange }) => {
  const menuItems = [
    {
      id: 'reservation-list',
      label: '予約一覧',
      icon: Calendar,
      description: 'すべての予約を表示・管理'
    },
    {
      id: 'pending-reservations',
      label: '未確認予約',
      icon: Clock,
      description: '確認待ちの予約'
    },
    {
      id: 'confirmed-reservations',
      label: '確定予約',
      icon: CheckCircle,
      description: '確定済みの予約'
    },
    {
      id: 'cancelled-reservations',
      label: 'キャンセル済み',
      icon: AlertCircle,
      description: 'キャンセルされた予約'
    },
    {
      id: 'customer-search',
      label: '顧客検索',
      icon: Search,
      description: '顧客名・連絡先で検索'
    },
    {
      id: 'payment-management',
      label: '支払い管理',
      icon: DollarSign,
      description: '支払い状況の管理'
    },
    {
      id: 'reservation-history',
      label: '予約履歴',
      icon: History,
      description: '過去の予約履歴'
    },
    {
      id: 'analytics',
      label: '分析・統計',
      icon: BarChart3,
      description: '予約データの分析'
    },
    {
      id: 'export-data',
      label: 'データエクスポート',
      icon: Download,
      description: '予約データの出力'
    },
    {
      id: 'reservation-settings',
      label: '予約設定',
      icon: Settings,
      description: '予約関連の設定'
    }
  ]

  return (
    <div className="w-72 bg-slate-50 border-r border-slate-200 h-full flex-shrink-0">
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">
            予約管理
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

export default ReservationSidebar
