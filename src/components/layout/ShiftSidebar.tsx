import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  History,
  Settings,
  Download,
  Upload
} from 'lucide-react'

interface ShiftSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const ShiftSidebar: React.FC<ShiftSidebarProps> = ({ activeTab, onTabChange }) => {
  const menuItems = [
    {
      id: 'shift-submission',
      label: 'シフト提出',
      icon: Calendar,
      description: '出勤可能日時を提出'
    },
    {
      id: 'shift-status',
      label: '提出状況',
      icon: CheckCircle,
      description: 'シフト提出の状況確認'
    },
    {
      id: 'schedule-conflicts',
      label: 'スケジュール確認',
      icon: AlertCircle,
      description: '確定スケジュールとの重複確認'
    },
    {
      id: 'shift-history',
      label: '提出履歴',
      icon: History,
      description: '過去のシフト提出履歴'
    },
    {
      id: 'time-settings',
      label: '時間設定',
      icon: Clock,
      description: 'シフト時間の設定'
    },
    {
      id: 'export-shift',
      label: 'シフトエクスポート',
      icon: Download,
      description: 'シフトデータの出力'
    },
    {
      id: 'shift-settings',
      label: 'シフト設定',
      icon: Settings,
      description: 'シフト関連の設定'
    }
  ]

  return (
    <div className="w-72 bg-slate-50 border-r border-slate-200 h-full flex-shrink-0">
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">
            シフト管理
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

export default ShiftSidebar
