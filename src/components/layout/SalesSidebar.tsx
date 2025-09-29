import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { 
  BarChart3, 
  BookOpen,
  Users
} from 'lucide-react'

interface SalesSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const SalesSidebar: React.FC<SalesSidebarProps> = ({ activeTab, onTabChange }) => {
  const menuItems = [
    {
      id: 'overview',
      label: '売上概要',
      icon: BarChart3,
      description: '売上データの概要とグラフ'
    },
    {
      id: 'scenario-performance',
      label: 'シナリオ分析',
      icon: BookOpen,
      description: 'シナリオの詳細分析と実績'
    },
    {
      id: 'author-report',
      label: '作者レポート',
      icon: Users,
      description: '作者別の公演実績レポート'
    }
  ]

  return (
    <div className="w-72 bg-slate-50 border-r border-slate-200 h-full flex-shrink-0">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4 text-slate-800">売上管理</h2>
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

export default SalesSidebar
