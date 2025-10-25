import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { 
  Users,
  List,
  UserPlus,
  Search,
  FileText,
  Shield,
  Mail,
  MapPin,
  StickyNote,
  ArrowLeft
} from 'lucide-react'

interface StaffSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onBackToList?: () => void
  mode?: 'list' | 'edit'
}

const StaffSidebar: React.FC<StaffSidebarProps> = ({ activeTab, onTabChange, onBackToList, mode = 'list' }) => {
  const staffListMenuItems = [
    {
      id: 'staff-list',
      label: 'スタッフ一覧',
      icon: List,
      description: 'すべてのスタッフを表示'
    },
    {
      id: 'new-staff',
      label: '新規作成',
      icon: UserPlus,
      description: '新しいスタッフを追加'
    },
    {
      id: 'search-filter',
      label: '検索・フィルタ',
      icon: Search,
      description: 'スタッフを検索・フィルタ'
    },
    {
      id: 'invite-staff',
      label: 'スタッフ招待',
      icon: Mail,
      description: 'メールで招待を送信'
    }
  ]

  const staffEditMenuItems = [
    {
      id: 'basic',
      label: '基本情報',
      icon: Users,
      description: '名前、ステータス、連絡先'
    },
    {
      id: 'contact',
      label: '連絡先情報',
      icon: Mail,
      description: 'メール、電話、SNS'
    },
    {
      id: 'role-store',
      label: '役割・担当店舗',
      icon: Shield,
      description: 'ロール、店舗、特別シナリオ'
    },
    {
      id: 'notes',
      label: '備考',
      icon: StickyNote,
      description: 'メモ・特記事項'
    }
  ]

  const menuItems = mode === 'list' ? staffListMenuItems : staffEditMenuItems

  return (
    <div className="w-72 bg-slate-50 border-r border-slate-200 h-full flex-shrink-0">
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-800">
            {mode === 'list' ? 'スタッフ管理' : 'スタッフ編集'}
          </h2>
        </div>

        {onBackToList && mode === 'edit' && (
          <div className="mb-4 pb-4 border-b border-slate-200">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onBackToList}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              一覧に戻る
            </Button>
          </div>
        )}
        
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

