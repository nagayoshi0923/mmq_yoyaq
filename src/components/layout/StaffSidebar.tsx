import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { 
  Users,
  List
} from 'lucide-react'

interface StaffSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const StaffSidebar: React.FC<StaffSidebarProps> = ({ activeTab, onTabChange }) => {
  const menuItems = [
    {
      id: 'staff-list',
      label: 'スタッフ一覧',
      icon: List,
      description: 'すべてのスタッフを表示'
    }
  ]

  return (
    <div className="w-72 bg-slate-50 border-r border-slate-200 h-full flex-shrink-0">
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">スタッフ管理</h2>
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

export default StaffSidebar

