import React from 'react'
import { Button } from '@/components/ui/button'
import { 
  BarChart3, 
  FileText, 
  Calendar,
  BookOpen,
  Users,
  TrendingUp
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
      id: 'license',
      label: 'ライセンス管理',
      icon: FileText,
      description: 'ライセンス料金の管理'
    },
    {
      id: 'scenario-performance',
      label: 'シナリオ別公演数',
      icon: BookOpen,
      description: 'シナリオごとの公演実績'
    },
    {
      id: 'monthly-performance',
      label: '月次公演管理',
      icon: Calendar,
      description: '月別公演実績の管理'
    },
    {
      id: 'author-report',
      label: '作者レポート',
      icon: Users,
      description: '作者別の公演実績レポート'
    }
  ]

  return (
    <div className="w-72 bg-card border-r border-border h-full flex-shrink-0">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4">売上管理</h2>
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.id}
                variant={activeTab === item.id ? "default" : "ghost"}
                className="w-full justify-start h-auto p-3"
                onClick={() => onTabChange(item.id)}
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
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
